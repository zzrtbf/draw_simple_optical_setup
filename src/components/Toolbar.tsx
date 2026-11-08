import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import {
  buildExportSVG,
  downloadBlob,
  safeName,
  svgToPngBlob,
  type ExportOptions,
} from '../lib/export';
import { buildScene3D, openProjectFile, saveProjectFile } from '../lib/persist';
import { nativeBridge, nativeCopyImage } from '../lib/native';
import { chord } from '../lib/platform';
import { toast } from '../lib/toast';
import {
  IconBeam,
  IconCursor,
  IconDownload,
  IconFile,
  IconFit,
  IconFolder,
  IconGrid,
  IconMinus,
  IconMoon,
  IconPanelLeft,
  IconPanelRight,
  IconPlus,
  IconRedo,
  IconSave,
  IconSun,
  IconText,
  IconUndo,
} from './Icons';

export function Toolbar({
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
}: {
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}) {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const snapStep = useEditor((s) => s.snapStep);
  const setSnapStep = useEditor((s) => s.setSnapStep);
  const zoom = useEditor((s) => s.view.zoom);
  const zoomAt = useEditor((s) => s.zoomAt);
  const fitView = useEditor((s) => s.fitView);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const showGrid = useEditor((s) => s.project.board.showGrid);
  const showAutoBeams = useEditor((s) => s.project.board.showAutoBeams !== false);
  const theme = useEditor((s) => s.project.board.theme);
  const setBoard = useEditor((s) => s.setBoard);

  const [menuOpen, setMenuOpen] = useState(false);

  const zoomBy = (f: number) => {
    const { viewport } = useEditor.getState();
    zoomAt(f, viewport.w / 2, viewport.h / 2);
  };

  return (
    <header className="toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="tb-group">
        <ToolButton
          active={leftOpen}
          onClick={onToggleLeft}
          title="Show / hide the part library"
        >
          <IconPanelLeft />
        </ToolButton>
        <ToolButton
          active={rightOpen}
          onClick={onToggleRight}
          title="Show / hide the inspector"
        >
          <IconPanelRight />
        </ToolButton>
      </div>

      <Divider />

      <div className="tb-group">
        <ToolButton active={tool === 'select'} onClick={() => setTool('select')} title="Select (V)">
          <IconCursor />
        </ToolButton>
        <ToolButton active={tool === 'beam'} onClick={() => setTool('beam')} title="Beam (B)">
          <IconBeam />
        </ToolButton>
        <ToolButton active={tool === 'text'} onClick={() => setTool('text')} title="Text (T)" onActivate={() => useEditor.getState().addText()}>
          <IconText />
        </ToolButton>
      </div>

      <Divider />

      <ToolButton active={showGrid} onClick={() => setBoard({ showGrid: !showGrid })} title="Show hole grid">
        <IconGrid />
      </ToolButton>
      <ToolButton
        active={showAutoBeams}
        onClick={() => setBoard({ showAutoBeams: !showAutoBeams })}
        title={showAutoBeams ? 'Hide the automatically traced beams' : 'Trace the beams through the setup'}
      >
        <IconBeam />
      </ToolButton>
      <ToolButton
        active={theme === 'light'}
        onClick={() => setBoard({ theme: theme === 'light' ? 'dark' : 'light' })}
        title={theme === 'light' ? 'Switch to the dark bench' : 'Switch to a white (print) bench'}
      >
        {theme === 'light' ? <IconSun /> : <IconMoon />}
      </ToolButton>
      <select
        className="tb-select"
        value={snapStep}
        onChange={(e) => setSnapStep(Number(e.target.value))}
        title="Grid step used by parts that have snapping on"
      >
        <option value={25}>25 mm</option>
        <option value={12.5}>12.5 mm</option>
        <option value={5}>5 mm</option>
        <option value={1}>1 mm</option>
      </select>

      <Divider />

      <ToolButton onClick={undo} title={`Undo (${chord('Z')})`} disabled={!canUndo}>
        <IconUndo />
      </ToolButton>
      <ToolButton onClick={redo} title={`Redo (${chord('Shift+Z')})`} disabled={!canRedo}>
        <IconRedo />
      </ToolButton>

      <div className="tb-spacer" />

      <div className="tb-group zoom-group">
        <ToolButton onClick={() => zoomBy(1 / 1.25)} title="Zoom out">
          <IconMinus />
        </ToolButton>
        <button className="zoom-readout" onClick={() => {
          const { viewport, setView } = useEditor.getState();
          setView({ zoom: 1, panX: viewport.w / 2 - 300, panY: viewport.h / 2 - 225 });
        }} title="Reset to 100 %">
          {Math.round(zoom * 100)}%
        </button>
        <ToolButton onClick={() => zoomBy(1.25)} title="Zoom in">
          <IconPlus />
        </ToolButton>
        <ToolButton onClick={fitView} title="Fit drawing (0)">
          <IconFit />
        </ToolButton>
      </div>

      <Divider />

      <div className="tb-group">
        <ToolButton onClick={() => useEditor.getState().newProject()} title="New project">
          <IconFile />
        </ToolButton>
        <ToolButton
          onClick={async () => {
            const res = await openProjectFile();
            if (res) {
              useEditor.getState().loadProject(res.project, res.name);
              toast(`Opened ${res.name}`);
            }
          }}
          title={`Open project (${chord('O')})`}
        >
          <IconFolder />
        </ToolButton>
        <ToolButton
          onClick={async () => {
            const st = useEditor.getState();
            const res = await saveProjectFile(st.project, st.fileName?.replace(/\.osopt\.json$/i, '') ?? st.project.name);
            if (res === 'saved') toast('Project saved');
            else if (res === 'downloaded') toast('Project saved to your Downloads folder');
          }}
          title={`Save project (${chord('S')})`}
        >
          <IconSave />
        </ToolButton>
      </div>

      <div className="export-wrap">
        <button className="btn-primary" onClick={() => setMenuOpen((v) => !v)}>
          <IconDownload size={14} />
          Export
        </button>
        {menuOpen && <ExportMenu onClose={() => setMenuOpen(false)} />}
      </div>
    </header>
  );
}

function Divider() {
  return <span className="tb-divider" />;
}

function ToolButton({
  children,
  onClick,
  title,
  active,
  disabled,
  onActivate,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onActivate?: () => void;
}) {
  return (
    <button
      className={`tb-btn${active ? ' is-active' : ''}`}
      title={title}
      disabled={disabled}
      onClick={() => {
        onClick?.();
        onActivate?.();
      }}
    >
      {children}
    </button>
  );
}

type Bg = ExportOptions['background'];

function ExportMenu({ onClose }: { onClose: () => void }) {
  const boardTheme = useEditor((s) => s.project.board.theme);
  const [bg, setBg] = useState<Bg>(boardTheme === 'light' ? 'white' : 'dark');
  const [withGrid, setWithGrid] = useState(true);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [onClose]);

  const buildOptions = (): ExportOptions => {
    const st = useEditor.getState();
    return {
      scale: 4,
      margin: 15,
      background: bg,
      withGrid,
      selectionOnly,
      selection: st.selection,
    };
  };

  const stageEl = () => document.querySelector('[data-stage]') as SVGSVGElement | null;

  const exportPng = async (scale: number) => {
    const el = stageEl();
    if (!el) return;
    const st = useEditor.getState();
    const opts = buildOptions();
    try {
      const { text, box } = buildExportSVG(el, st.project, opts, scale);
      const w = (box.maxX - box.minX) * scale;
      const h = (box.maxY - box.minY) * scale;
      if (w * h > 120e6) {
        toast('That image is too large — pick a smaller scale.', 'error');
        return;
      }
      const blob = await svgToPngBlob(text, w, h);
      const saved = await downloadBlob(blob, `${safeName(st.project.name)}-${scale}x.png`);
      if (!saved) {
        onClose();
        return;
      }
      toast(`PNG exported (${Math.round(w)} × ${Math.round(h)} px)`);
      onClose();
    } catch (err) {
      toast(`Export failed: ${(err as Error).message}`, 'error');
    }
  };

  const exportSvg = async () => {
    const el = stageEl();
    if (!el) return;
    const st = useEditor.getState();
    const opts = buildOptions();
    const { text } = buildExportSVG(el, st.project, opts);
    const saved = await downloadBlob(
      new Blob([text], { type: 'image/svg+xml' }),
      `${safeName(st.project.name)}.svg`,
    );
    if (saved) toast('SVG exported');
    onClose();
  };

  const copyPng = async () => {
    const el = stageEl();
    if (!el) return;
    const st = useEditor.getState();
    const opts = buildOptions();
    const scale = 3;
    const { text, box } = buildExportSVG(el, st.project, opts, scale);
    const w = (box.maxX - box.minX) * scale;
    const h = (box.maxY - box.minY) * scale;

    // Packaged app: hand the bitmap to NSPasteboard, which always works.
    if (nativeBridge()) {
      try {
        const ok = await nativeCopyImage(await svgToPngBlob(text, w, h));
        toast(ok ? 'Copied to clipboard' : 'Clipboard refused the image', ok ? 'info' : 'error');
      } catch (err) {
        toast(`Copy failed: ${(err as Error).message}`, 'error');
      }
      onClose();
      return;
    }

    // WebKit (Safari) only allows a clipboard write that was *started* by the
    // user gesture: the ClipboardItem has to be built synchronously, with the
    // still-pending rasterisation handed over as a promise. Awaiting first and
    // then building the item throws NotAllowedError.
    const png = svgToPngBlob(text, w, h);
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        throw new Error('this browser has no image clipboard');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      toast('Copied to clipboard');
      onClose();
      return;
    } catch (err) {
      // A blocked clipboard should degrade to a file, not to an error dialog.
      downloadBlob(await png, `${safeName(st.project.name)}-${scale}x.png`);
      toast(`Clipboard refused by the browser — saved a ${scale}× PNG instead`, 'error');
      onClose();
      console.warn('clipboard write failed', err);
    }
  };

  const exportScene = async () => {
    const st = useEditor.getState();
    const data = buildScene3D(st.project);
    const saved = await downloadBlob(
      new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }),
      `${safeName(st.project.name)}.scene3d.json`,
    );
    if (saved) toast('3D scene stub exported');
    onClose();
  };

  return (
    <div className="menu" ref={ref}>
      <div className="menu-section">
        <div className="menu-label">PNG</div>
        <button onClick={() => exportPng(2)}>
          2× <span>2 px/mm · screen</span>
        </button>
        <button onClick={() => exportPng(4)}>
          4× <span>4 px/mm · print</span>
        </button>
        <button onClick={() => exportPng(8)}>
          8× <span>8 px/mm · poster</span>
        </button>
      </div>
      <div className="menu-section">
        <div className="menu-label">Vector</div>
        <button onClick={exportSvg}>
          SVG <span>mm units, lossless</span>
        </button>
        <button onClick={copyPng}>
          Copy image <span>clipboard</span>
        </button>
        <button onClick={exportScene}>
          3D scene JSON <span>Blender hand-off</span>
        </button>
      </div>
      <div className="menu-section">
        <div className="menu-label">Background</div>
        <div className="seg-mini">
          {(['dark', 'white', 'transparent'] as Bg[]).map((v) => (
            <button key={v} className={bg === v ? 'is-active' : ''} onClick={() => setBg(v)}>
              {v === 'transparent' ? 'none' : v}
            </button>
          ))}
        </div>
        <label className="menu-check">
          <input type="checkbox" checked={withGrid} onChange={(e) => setWithGrid(e.target.checked)} />
          hole grid
        </label>
        <label className="menu-check">
          <input
            type="checkbox"
            checked={selectionOnly}
            onChange={(e) => setSelectionOnly(e.target.checked)}
          />
          selection only
        </label>
      </div>
    </div>
  );
}
