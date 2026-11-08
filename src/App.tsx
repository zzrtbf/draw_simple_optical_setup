import { useEffect, useRef, useState } from 'react';
import { autosave, useEditor } from './store';
import { Palette } from './components/Palette';
import { Toolbar } from './components/Toolbar';
import { Stage } from './components/Stage';
import { Inspector } from './components/Inspector';
import { StatusBar } from './components/StatusBar';
import { copySelection, pasteClipboard } from './lib/clipboard';
import { openProjectFile, parseProject, saveProjectFile } from './lib/persist';
import { isNativeApp, nativeBridge, nativeReadAutosave } from './lib/native';
import { toast } from './lib/toast';
import { sampleProject } from './model/sample';
import { buildExportSVG, svgToPngBlob, type ExportOptions } from './lib/export';
import { IconChevronLeft, IconChevronRight } from './components/Icons';

function isEditable(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t || !t.tagName) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

/** Module scope so React StrictMode's double-mount does not run boot twice. */
let bootOnce = false;
let exportOnce = false;

/**
 * Plumb the packaged app's native shell into the editor:
 *   - the Edit menu must not steal ⌘Z/⌘C/⌘V from the canvas, but still has to
 *     work inside text fields, so the shell asks which one has focus;
 *   - quitting must flush the autosave before the process goes away.
 */
function installNativeHooks() {
  if (!nativeBridge()) return;
  window.__obMenuActive = () => isEditable(document.activeElement);
  window.__obMenu = (operation) => {
    const st = useEditor.getState();
    switch (operation) {
      case 'undo':
        st.undo();
        break;
      case 'redo':
        st.redo();
        break;
      case 'copy':
        if (copySelection()) toast('Copied');
        break;
      case 'cut':
        if (copySelection()) st.deleteSelection();
        break;
      case 'paste':
        pasteClipboard(st.snapStep || 10);
        break;
      case 'selectAll':
        st.selectAll();
        break;
      default:
        break;
    }
  };
  window.__obFlush = () => {
    // write now, then tell the shell it may terminate
    autosave(useEditor.getState().project);
    void nativeBridge()?.call('flushDone');
  };
}

export default function App() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: string; key: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const lastNudge = useRef(0);

  /* dev helper: ?export renders the exported PNG over the UI for inspection */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('export') || exportOnce) return;
    exportOnce = true;
    window.setTimeout(async () => {
      const el = document.querySelector('[data-stage]') as SVGSVGElement | null;
      if (!el) return;
      try {
        const st = useEditor.getState();
        const scale = Number(params.get('scale') ?? 4);
        const bg = (params.get('bg') ?? 'dark') as ExportOptions['background'];
        const opts: ExportOptions = {
          scale,
          margin: 15,
          background: bg,
          withGrid: !params.has('nogrid'),
          selectionOnly: false,
          selection: [],
        };
        const { text, box } = buildExportSVG(el, st.project, opts, scale);
        const blob = await svgToPngBlob(
          text,
          (box.maxX - box.minX) * scale,
          (box.maxY - box.minY) * scale,
        );
        setPreview(URL.createObjectURL(blob));
      } catch (err) {
        toast(`preview failed: ${(err as Error).message}`, 'error');
      }
    }, 500);
  }, []);

  /* boot: restore the drawing, then fit it once on first paint */
  useEffect(() => {
    if (bootOnce) return;
    bootOnce = true;
    installNativeHooks();
    const params = new URLSearchParams(window.location.search);

    const boot = async () => {
      if (isNativeApp()) {
        const raw = await nativeReadAutosave();
        if (raw) {
          try {
            useEditor.getState().loadProject(parseProject(raw), null);
          } catch {
            /* a corrupt autosave must never block startup */
          }
        }
      }
      if (params.has('demo')) {
        const p = sampleProject();
        useEditor.getState().loadProject(p, null);
        if (params.has('inf')) useEditor.getState().setBoard({ mode: 'infinite' });
        if (params.has('light')) useEditor.getState().setBoard({ theme: 'light' });
        if (params.has('clash')) {
          useEditor.getState().updateItem('s8', { x: 120, y: 120 }, false);
        }
        const sel = params.get('sel');
        if (sel !== null) {
          const ids = sel.split(',').map((i) => p.items[Number(i)]?.id).filter(Boolean) as string[];
          if (ids.length) useEditor.getState().select(ids);
        }
      }
      window.setTimeout(() => useEditor.getState().fitView(), 80);
    };

    void boot();
  }, []);

  /* autosave */
  useEffect(() => {
    let timer = 0;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.project !== prev.project) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => autosave(s.project), 600);
      }
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  /* toasts */
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ msg: string; kind: string }>).detail;
      setToastMsg({ ...d, key: Date.now() });
    };
    window.addEventListener('ob-toast', handler);
    return () => window.removeEventListener('ob-toast', handler);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 2800);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  /* keyboard */
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) st.redo();
            else st.undo();
            return;
          case 'y':
            e.preventDefault();
            st.redo();
            return;
          case 'c':
            if (copySelection()) toast('Copied');
            return;
          case 'x':
            if (copySelection()) st.deleteSelection();
            return;
          case 'v':
            e.preventDefault();
            pasteClipboard(st.snapStep || 10);
            return;
          case 'd':
            e.preventDefault();
            st.duplicateSelection();
            return;
          case 'a':
            e.preventDefault();
            st.selectAll();
            return;
          case 's':
            e.preventDefault();
            {
              const res = await saveProjectFile(
                st.project,
                st.fileName?.replace(/\.osopt\.json$/i, '') ?? st.project.name,
              );
              if (res === 'saved') toast('Project saved');
              else if (res === 'downloaded') toast('Project saved to your Downloads folder');
            }
            return;
          case 'o':
            e.preventDefault();
            {
              const res = await openProjectFile();
              if (res) {
                st.loadProject(res.project, res.name);
                toast(`Opened ${res.name}`);
              }
            }
            return;
          default:
            return;
        }
      }

      const step = e.shiftKey ? st.snapStep : 1;
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          st.deleteSelection();
          break;
        case 'Escape':
          st.clearSelection();
          st.setTool('select');
          break;
        case 'v':
        case 'V':
          st.setTool('select');
          break;
        case 'b':
        case 'B':
          st.setTool('beam');
          break;
        case 't':
        case 'T':
          st.addText();
          break;
        case '0':
          st.fitView();
          break;
        case '+':
        case '=':
          st.zoomAt(1.25, st.viewport.w / 2, st.viewport.h / 2);
          break;
        case '-':
        case '_':
          st.zoomAt(1 / 1.25, st.viewport.w / 2, st.viewport.h / 2);
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          const now = Date.now();
          if (now - lastNudge.current > 700) st.pushHistory();
          lastNudge.current = now;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          st.nudgeSelection(dx, dy, false);
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const empty = useEditor((s) => s.project.items.length === 0 && s.project.beams.length === 0);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  return (
    <div className="app">
      <Toolbar
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
      />
      <div className={`main${leftOpen ? '' : ' no-left'}${rightOpen ? '' : ' no-right'}`}>
        {leftOpen && <Palette />}
        <div className="canvas-col">
          <Stage svgRef={svgRef} />
          {empty && (
            <div className="canvas-hint">
              <b>Pick a part from the library</b>
              <span>Click a part to drop it on the bench, then drag to move.</span>
              <span>Press B and drag to draw a beam.</span>
            </div>
          )}
          {!leftOpen && (
            <button className="panel-reveal left" onClick={() => setLeftOpen(true)} title="Show the part library">
              <IconChevronRight size={14} />
            </button>
          )}
          {!rightOpen && (
            <button className="panel-reveal right" onClick={() => setRightOpen(true)} title="Show the inspector">
              <IconChevronLeft size={14} />
            </button>
          )}
        </div>
        {rightOpen && <Inspector />}
      </div>
      <StatusBar />
      {toastMsg && (
        <div className={`toast ${toastMsg.kind}`} key={toastMsg.key}>
          {toastMsg.msg}
        </div>
      )}
      {preview && (
        <div className="preview-overlay" onClick={() => setPreview(null)}>
          <img src={preview} alt="export preview" />
        </div>
      )}
    </div>
  );
}
