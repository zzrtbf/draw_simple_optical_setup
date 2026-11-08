import { create } from 'zustand';
import {
  emptyProject,
  newId,
  normalizeProject,
  type Beam,
  type BoxItem,
  type Item,
  type LibItem,
  type Project,
  type TextItem,
} from './model/types';
import { CATALOG_BY_KEY } from './model/catalog';
import { nativeBridge, nativeWriteAutosave } from './lib/native';
import { wavelengthToColor } from './lib/spectrum';
import {
  bboxOfPoints,
  clamp,
  frameCorners,
  itemCorners,
  polyOverlap,
  snapTo,
  unionBBox,
  type BBox,
  type Pt,
} from './lib/geom';

export type Tool = 'select' | 'beam' | 'text';

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

export type NewBeam = Pick<Beam, 'x1' | 'y1' | 'x2' | 'y2' | 'w1' | 'w2'> &
  Partial<Pick<Beam, 'color' | 'opacity' | 'z' | 'label' | 'showLabel' | 'locked' | 'snap'>>;

export interface EditorState {
  project: Project;
  view: View;
  viewport: { w: number; h: number };
  tool: Tool;
  snapStep: number;
  selection: string[];
  past: Project[];
  future: Project[];
  fileName: string | null;
  cursor: Pt | null;

  setTool: (t: Tool) => void;
  setView: (v: Partial<View>) => void;
  setViewport: (v: { w: number; h: number }) => void;
  zoomAt: (factor: number, sx: number, sy: number) => void;
  fitView: () => void;
  panBy: (dx: number, dy: number) => void;
  setCursor: (p: Pt | null) => void;

  setSnapStep: (v: number) => void;

  select: (ids: string[], mode?: 'replace' | 'add' | 'toggle') => void;
  selectAll: () => void;
  clearSelection: () => void;

  pushHistory: () => void;
  dropLastHistory: () => void;
  undo: () => void;
  redo: () => void;

  addLib: (key: string, at?: Pt) => void;
  addBox: (at?: Pt) => void;
  addText: (at?: Pt) => void;
  addBeam: (b: NewBeam) => void;

  updateItem: (id: string, patch: Partial<Item>, record?: boolean) => void;
  updateBeam: (id: string, patch: Partial<Beam>, record?: boolean) => void;
  moveItems: (ids: string[], dx: number, dy: number) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  duplicateInPlace: (ids: string[]) => void;
  nudgeSelection: (dx: number, dy: number, record?: boolean) => void;
  alignSelection: (mode: AlignMode) => void;
  reorder: (dir: 'front' | 'back' | 'up' | 'down') => void;

  setBoard: (patch: Partial<Project['board']>) => void;
  setProjectName: (name: string) => void;
  newProject: () => void;
  loadProject: (p: Project, fileName: string | null) => void;
  setFileName: (n: string | null) => void;
}

const HISTORY_LIMIT = 80;

function worldCenter(state: EditorState): Pt {
  const { view, viewport } = state;
  return {
    x: (viewport.w / 2 - view.panX) / view.zoom,
    y: (viewport.h / 2 - view.panY) / view.zoom,
  };
}

const STORAGE_KEY = 'optical-bench.autosave.v1';

/** Nudge a fresh part off its neighbours so it does not arrive already colliding. */
function freeSpot(items: Item[], w: number, h: number, x: number, y: number, step: number): Pt {
  const free = (px: number, py: number) => {
    const poly = frameCorners({ cx: px, cy: py, w, h, rot: 0 });
    return !items.some(
      (it) => it.kind !== 'text' && it.collide && polyOverlap(poly, itemCorners(it), 0.5),
    );
  };
  if (free(x, y)) return { x, y };
  for (let ring = 1; ring <= 6; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const px = x + dx * step;
        const py = y + dy * step;
        if (free(px, py)) return { x: px, y: py };
      }
    }
  }
  return { x, y };
}

function loadAutosave(): Project | null {
  // The packaged app keeps its autosave in Application Support and reads it
  // through the native bridge during boot, so the web storage is skipped there.
  if (nativeBridge()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Project;
    if (p && p.schema === 'optical-setup/1' && Array.isArray(p.items) && Array.isArray(p.beams)) {
      return normalizeProject(p);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function autosave(project: Project) {
  const json = JSON.stringify(project);
  if (nativeBridge()) {
    // Straight to a file: WebKit flushes localStorage lazily, so quitting right
    // after an edit could silently lose the last change.
    void nativeWriteAutosave(json);
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* quota */
  }
}

export const useEditor = create<EditorState>()((set, get) => {
  const record = (mutate: (p: Project) => Project) => {
    const s = get();
    set({
      past: [...s.past.slice(-HISTORY_LIMIT), s.project],
      future: [],
      project: mutate(s.project),
    });
  };

  return {
    project: loadAutosave() ?? emptyProject(),
    view: { zoom: 1.2, panX: 120, panY: 90 },
    viewport: { w: 1200, h: 800 },
    tool: 'select',
    snapStep: 25,
    selection: [],
    past: [],
    future: [],
    fileName: null,
    cursor: null,

    setTool: (tool) => set({ tool }),
    setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
    setViewport: (viewport) => set({ viewport }),

    setCursor: (cursor) => set({ cursor }),

    zoomAt: (factor, sx, sy) =>
      set((s) => {
        const zoom = clamp(s.view.zoom * factor, 0.03, 60);
        const k = zoom / s.view.zoom;
        return {
          view: {
            zoom,
            panX: sx - (sx - s.view.panX) * k,
            panY: sy - (sy - s.view.panY) * k,
          },
        };
      }),

    panBy: (dx, dy) => set((s) => ({ view: { ...s.view, panX: s.view.panX + dx, panY: s.view.panY + dy } })),

    fitView: () => {
      const s = get();
      const { project, viewport } = s;
      let box: BBox | null = null;
      for (const it of project.items) box = unionBBox(box, bboxOfPoints(itemCorners(it)));
      for (const b of project.beams) {
        box = unionBBox(
          box,
          bboxOfPoints([
            { x: b.x1, y: b.y1 },
            { x: b.x2, y: b.y2 },
          ]),
        );
      }
      if (project.board.mode === 'plate') {
        box = unionBBox(box, { minX: 0, minY: 0, maxX: project.board.w, maxY: project.board.h });
      }
      if (!box || !Number.isFinite(box.minX)) {
        box = { minX: 0, minY: 0, maxX: 600, maxY: 450 };
      }
      const pad = 40;
      const bw = Math.max(box.maxX - box.minX, 10);
      const bh = Math.max(box.maxY - box.minY, 10);
      const zoom = clamp(
        Math.min((viewport.w - pad * 2) / bw, (viewport.h - pad * 2) / bh),
        0.03,
        60,
      );
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      set({
        view: {
          zoom,
          panX: viewport.w / 2 - cx * zoom,
          panY: viewport.h / 2 - cy * zoom,
        },
      });
    },

    setSnapStep: (snapStep) => set({ snapStep }),

    select: (ids, mode = 'replace') =>
      set((s) => {
        if (mode === 'replace') return { selection: ids };
        if (mode === 'add') return { selection: Array.from(new Set([...s.selection, ...ids])) };
        const next = new Set(s.selection);
        for (const id of ids) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        return { selection: Array.from(next) };
      }),

    selectAll: () =>
      set((s) => ({ selection: [...s.project.items.map((i) => i.id), ...s.project.beams.map((b) => b.id)] })),

    clearSelection: () => set({ selection: [] }),

    pushHistory: () => {
      const s = get();
      const last = s.past[s.past.length - 1];
      if (last && last === s.project) return;
      set({ past: [...s.past.slice(-HISTORY_LIMIT), s.project], future: [] });
    },

    /** Undo a snapshot that ended up being a no-op (a click that did not drag). */
    dropLastHistory: () =>
      set((s) => {
        const last = s.past[s.past.length - 1];
        if (!last || last !== s.project) return {};
        return { past: s.past.slice(0, -1) };
      }),

    undo: () =>
      set((s) => {
        if (!s.past.length) return {};
        const prev = s.past[s.past.length - 1];
        return {
          project: prev,
          past: s.past.slice(0, -1),
          future: [...s.future, s.project],
          selection: [],
        };
      }),

    redo: () =>
      set((s) => {
        if (!s.future.length) return {};
        const next = s.future[s.future.length - 1];
        return {
          project: next,
          future: s.future.slice(0, -1),
          past: [...s.past, s.project],
          selection: [],
        };
      }),

    addLib: (key, at) => {
      const cat = CATALOG_BY_KEY.get(key);
      if (!cat) return;
      const s = get();
      const p = at ?? worldCenter(s);
      const rawX = snapTo(p.x, s.snapStep);
      const rawY = snapTo(p.y, s.snapStep);
      const spot = freeSpot(s.project.items, cat.w, cat.h, rawX, rawY, s.snapStep || 10);
      const x = spot.x;
      const y = spot.y;
      const item: LibItem = {
        id: newId('i'),
        kind: 'lib',
        lib: key,
        x,
        y,
        rot: 0,
        w: Math.round(cat.w * 10) / 10,
        h: Math.round(cat.h * 10) / 10,
        label: '',
        labelOffset: null,
        showLabel: false,
        locked: false,
        collide: true,
        snap: true,
        z: 25.4,
      };
      record((proj) => ({ ...proj, items: [...proj.items, item] }));
      set({ selection: [item.id], tool: 'select' });
    },

    addBox: (at) => {
      const s = get();
      const p = at ?? worldCenter(s);
      const spot = freeSpot(
        s.project.items,
        60,
        40,
        snapTo(p.x, s.snapStep),
        snapTo(p.y, s.snapStep),
        s.snapStep || 10,
      );
      const item: BoxItem = {
        id: newId('i'),
        kind: 'box',
        x: spot.x,
        y: spot.y,
        rot: 0,
        w: 60,
        h: 40,
        color: '#38e1c4',
        radius: 4,
        label: 'Custom',
        labelOffset: null,
        showLabel: true,
        locked: false,
        collide: true,
        snap: true,
        z: 25.4,
      };
      record((proj) => ({ ...proj, items: [...proj.items, item] }));
      set({ selection: [item.id], tool: 'select' });
    },

    addText: (at) => {
      const s = get();
      const p = at ?? worldCenter(s);
      const item: TextItem = {
        id: newId('i'),
        kind: 'text',
        x: snapTo(p.x, s.snapStep),
        y: snapTo(p.y, s.snapStep),
        rot: 0,
        text: 'Label',
        size: 10,
        color: '#cfe0f0',
        align: 'center',
        label: '',
        labelOffset: null,
        showLabel: false,
        locked: false,
        collide: false,
        snap: true,
        z: 0,
      };
      record((proj) => ({ ...proj, items: [...proj.items, item] }));
      set({ selection: [item.id], tool: 'select' });
    },

    addBeam: (b) => {
      const beam: Beam = {
        id: newId('b'),
        label: '',
        showLabel: false,
        locked: false,
        snap: true,
        z: 25.4,
        wavelength: 633,
        color: wavelengthToColor(633),
        opacity: 1,
        ...b,
      };
      record((proj) => ({ ...proj, beams: [...proj.beams, beam] }));
      set({ selection: [beam.id], tool: 'select' });
    },

    updateItem: (id, patch, shouldRecord = true) => {
      const apply = (proj: Project) => ({
        ...proj,
        items: proj.items.map((it) => (it.id === id ? ({ ...it, ...patch } as Item) : it)),
      });
      if (shouldRecord) record(apply);
      else set((s) => ({ project: apply(s.project) }));
    },

    updateBeam: (id, patch, shouldRecord = true) => {
      const apply = (proj: Project) => ({
        ...proj,
        beams: proj.beams.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      });
      if (shouldRecord) record(apply);
      else set((s) => ({ project: apply(s.project) }));
    },

    moveItems: (ids, dx, dy) => {
      const set$ = new Set(ids);
      set((s) => ({
        project: {
          ...s.project,
          items: s.project.items.map((it) =>
            set$.has(it.id) && !it.locked ? { ...it, x: it.x + dx, y: it.y + dy } : it,
          ),
        },
      }));
    },

    deleteSelection: () => {
      const s = get();
      if (!s.selection.length) return;
      const ids = new Set(s.selection);
      record((proj) => ({
        ...proj,
        items: proj.items.filter((it) => !ids.has(it.id) || it.locked),
        beams: proj.beams.filter((b) => !ids.has(b.id) || b.locked),
      }));
      set({ selection: [] });
    },

    duplicateSelection: () => {
      const s = get();
      if (!s.selection.length) return;
      const ids = new Set(s.selection);
      const off = s.snapStep || 10;
      const newItems: Item[] = s.project.items
        .filter((it) => ids.has(it.id))
        .map((it) => ({ ...it, id: newId('i'), x: it.x + off, y: it.y + off, locked: false }));
      const newBeams: Beam[] = s.project.beams
        .filter((b) => ids.has(b.id))
        .map((b) => ({
          ...b,
          id: newId('b'),
          x1: b.x1 + off,
          y1: b.y1 + off,
          x2: b.x2 + off,
          y2: b.y2 + off,
          locked: false,
        }));
      record((proj) => ({
        ...proj,
        items: [...proj.items, ...newItems],
        beams: [...proj.beams, ...newBeams],
      }));
      set({ selection: [...newItems.map((i) => i.id), ...newBeams.map((b) => b.id)] });
    },

    /** Ctrl+drag: copy the given objects on top of themselves and select the copies. */
    duplicateInPlace: (ids) => {
      const s = get();
      const wanted = new Set(ids.filter((id) => s.selection.includes(id)).length ? s.selection : ids);
      const srcItems = s.project.items.filter((it) => wanted.has(it.id) && !it.locked);
      const srcBeams = s.project.beams.filter((b) => wanted.has(b.id) && !b.locked);
      if (!srcItems.length && !srcBeams.length) return;
      const newItems: Item[] = srcItems.map((it) => ({ ...it, id: newId('i') }));
      const newBeams: Beam[] = srcBeams.map((b) => ({ ...b, id: newId('b') }));
      record((proj) => ({
        ...proj,
        items: [...proj.items, ...newItems],
        beams: [...proj.beams, ...newBeams],
      }));
      set({ selection: [...newItems.map((i) => i.id), ...newBeams.map((b) => b.id)] });
    },

    nudgeSelection: (dx, dy, shouldRecord = true) => {
      const s = get();
      if (!s.selection.length) return;
      const ids = new Set(s.selection);
      const apply = (proj: Project): Project => ({
        ...proj,
        items: proj.items.map((it) => (ids.has(it.id) && !it.locked ? { ...it, x: it.x + dx, y: it.y + dy } : it)),
        beams: proj.beams.map((b) =>
          ids.has(b.id) && !b.locked
            ? { ...b, x1: b.x1 + dx, y1: b.y1 + dy, x2: b.x2 + dx, y2: b.y2 + dy }
            : b,
        ),
      });
      if (shouldRecord) record(apply);
      else set((st) => ({ project: apply(st.project) }));
    },

    alignSelection: (mode) => {
      const s = get();
      const sel = s.project.items.filter((it) => s.selection.includes(it.id));
      if (sel.length < 2) return;
      const boxes = sel.map((it) => ({ it, b: bboxOfPoints(itemCorners(it)) }));
      let total: BBox | null = null;
      for (const { b } of boxes) total = unionBBox(total, b);
      if (!total) return;
      const moves = new Map<string, Pt>();
      for (const { it, b } of boxes) {
        let dx = 0;
        let dy = 0;
        switch (mode) {
          case 'left':
            dx = total.minX - b.minX;
            break;
          case 'centerX':
            dx = (total.minX + total.maxX) / 2 - (b.minX + b.maxX) / 2;
            break;
          case 'right':
            dx = total.maxX - b.maxX;
            break;
          case 'top':
            dy = total.minY - b.minY;
            break;
          case 'centerY':
            dy = (total.minY + total.maxY) / 2 - (b.minY + b.maxY) / 2;
            break;
          case 'bottom':
            dy = total.maxY - b.maxY;
            break;
        }
        moves.set(it.id, { x: dx, y: dy });
      }
      record((proj) => ({
        ...proj,
        items: proj.items.map((it) => {
          const m = moves.get(it.id);
          return m ? { ...it, x: it.x + m.x, y: it.y + m.y } : it;
        }),
      }));
    },

    reorder: (dir) => {
      const s = get();
      if (!s.selection.length) return;
      const ids = new Set(s.selection);
      record((proj) => {
        const items = [...proj.items];
        const picked = items.filter((it) => ids.has(it.id));
        if (!picked.length) return proj;
        const rest = items.filter((it) => !ids.has(it.id));
        if (dir === 'front') return { ...proj, items: [...rest, ...picked] };
        if (dir === 'back') return { ...proj, items: [...picked, ...rest] };
        // step up / down by one position
        const dirStep = dir === 'up' ? 1 : -1;
        const idx = items.map((it, i) => (ids.has(it.id) ? i : -1)).filter((i) => i >= 0);
        if (dirStep > 0) idx.reverse();
        for (const i of idx) {
          const j = i + dirStep;
          if (j < 0 || j >= items.length) continue;
          [items[i], items[j]] = [items[j], items[i]];
        }
        return { ...proj, items };
      });
    },

    setBoard: (patch) => record((proj) => ({ ...proj, board: { ...proj.board, ...patch } })),
    setProjectName: (name) => record((proj) => ({ ...proj, name })),

    newProject: () => {
      set((s) => ({
        past: [...s.past.slice(-HISTORY_LIMIT), s.project],
        future: [],
        project: emptyProject(),
        selection: [],
        fileName: null,
      }));
      get().fitView();
    },

    loadProject: (p, fileName) => {
      set((s) => ({
        past: [...s.past.slice(-HISTORY_LIMIT), s.project],
        future: [],
        project: normalizeProject(p),
        selection: [],
        fileName,
      }));
      get().fitView();
    },

    setFileName: (fileName) => set({ fileName }),
  };
});
