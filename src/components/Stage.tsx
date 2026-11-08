import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LIBRARY } from '../generated/library';
import { useEditor } from '../store';
import type { Beam, BoxItem, Item, LibItem, TextItem } from '../model/types';
import {
  FONT_STACK,
  LINE_HEIGHT,
  adaptInk,
  clamp,
  frameCorners,
  itemFrame,
  labelPoint,
  measureTextMm,
  normDeg,
  rotatePt,
  snapDeg,
  snapTo,
  textLines,
  type Frame,
  type Pt,
} from '../lib/geom';
import { THEMES } from '../lib/theme';
import { useConflictIds } from '../lib/conflicts';
import { AutoBeams } from './AutoBeams';
import { IS_MAC } from '../lib/platform';

/* ------------------------------------------------------------------ */
/* library shape markup (ids must be unique per placed instance)       */
/* ------------------------------------------------------------------ */

const markupCache = new Map<string, string>();

function prefixIds(svg: string, prefix: string): string {
  return svg
    .replace(/id="([^"]+)"/g, (_m, id: string) => `id="${prefix}_${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${prefix}_${id})`)
    .replace(/xlink:href="#([^"]+)"/g, (_m, id: string) => `xlink:href="#${prefix}_${id}"`);
}

function libMarkup(libKey: string, id: string): string {
  const cacheKey = `${libKey}::${id}`;
  const hit = markupCache.get(cacheKey);
  if (hit) return hit;
  const shape = LIBRARY[libKey];
  const out = shape ? prefixIds(shape.svg, `p${id.replace(/[^A-Za-z0-9]/g, '')}`) : '';
  if (markupCache.size > 600) markupCache.clear();
  markupCache.set(cacheKey, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* items                                                              */
/* ------------------------------------------------------------------ */

interface ItemViewProps {
  item: Item;
  selected: boolean;
  conflict: boolean;
  zoom: number;
  theme: 'dark' | 'light';
}

const ItemView = React.memo(function ItemView({
  item,
  selected,
  conflict,
  zoom,
  theme,
}: ItemViewProps) {
  const f = itemFrame(item);
  const sw = 1 / zoom;

  return (
    <g data-id={item.id} className={`item item-${item.kind}`} opacity={item.locked ? 0.85 : 1}>
      {item.kind === 'lib' && <LibGraphic item={item} />}
      {item.kind === 'box' && <BoxGraphic item={item} theme={theme} />}
      {item.kind === 'text' && <TextGraphic item={item} frame={f} theme={theme} />}

      {conflict && (
        // editor-only warning: like the selection frame it must not reach exports
        <rect
          x={f.cx - f.w / 2}
          y={f.cy - f.h / 2}
          width={f.w}
          height={f.h}
          transform={`rotate(${f.rot} ${f.cx} ${f.cy})`}
          fill="none"
          stroke="#ff5b76"
          strokeWidth={2.5 * sw}
          strokeDasharray={`${6 * sw} ${4 * sw}`}
          data-ui="1"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {selected && (
        <rect
          x={f.cx - f.w / 2}
          y={f.cy - f.h / 2}
          width={f.w}
          height={f.h}
          transform={`rotate(${f.rot} ${f.cx} ${f.cy})`}
          fill="none"
          stroke="#38e1c4"
          strokeWidth={1.4 * sw}
          data-ui="1"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
});

function LibGraphic({ item }: { item: LibItem }) {
  const shape = LIBRARY[item.lib];
  const html = useMemo(() => libMarkup(item.lib, item.id), [item.lib, item.id]);
  if (!shape) {
    return (
      <rect
        x={item.x - item.w / 2}
        y={item.y - item.h / 2}
        width={item.w}
        height={item.h}
        fill="rgba(255,91,118,0.15)"
        stroke="#ff5b76"
        strokeWidth={0.4}
      />
    );
  }
  const sx = item.w / shape.w;
  const sy = item.h / shape.h;
  return (
    <g
      transform={`translate(${item.x} ${item.y}) rotate(${item.rot}) scale(${sx} ${sy}) translate(${-shape.w / 2} ${-shape.h / 2})`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function BoxGraphic({ item, theme }: { item: BoxItem; theme: 'dark' | 'light' }) {
  const r = Math.min(item.radius, item.w / 2, item.h / 2);
  const ink = adaptInk(item.color, theme);
  return (
    <g transform={`translate(${item.x} ${item.y}) rotate(${item.rot})`}>
      <rect
        x={-item.w / 2}
        y={-item.h / 2}
        width={item.w}
        height={item.h}
        rx={r}
        fill={item.color}
        fillOpacity={theme === 'light' ? 0.12 : 0.16}
        stroke={ink}
        strokeWidth={0.9}
        strokeOpacity={0.9}
      />
      <rect
        x={-item.w / 2 + 1.2}
        y={-item.h / 2 + 1.2}
        width={Math.max(item.w - 2.4, 0)}
        height={Math.max(item.h - 2.4, 0)}
        rx={Math.max(r - 1.2, 0)}
        fill="none"
        stroke={ink}
        strokeOpacity={0.22}
        strokeWidth={0.4}
      />
      {item.showLabel && item.label.trim() !== '' && (
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.min(item.h * 0.42, 9)}
          fill={ink}
          data-ink={item.color}
          fontFamily={FONT_STACK}
          letterSpacing={0.2}
          style={{ pointerEvents: 'none' }}
        >
          {item.label}
        </text>
      )}
    </g>
  );
}

function TextGraphic({
  item,
  frame,
  theme,
}: {
  item: TextItem;
  frame: Frame;
  theme: 'dark' | 'light';
}) {
  const lines = textLines(item.text);
  const lh = item.size * LINE_HEIGHT;
  const top = item.y - ((lines.length - 1) * lh) / 2;
  const anchor = item.align === 'left' ? 'start' : item.align === 'right' ? 'end' : 'middle';
  const ink = adaptInk(item.color, theme);
  return (
    <g transform={`rotate(${item.rot} ${frame.cx} ${frame.cy})`}>
      <rect
        x={frame.cx - frame.w / 2}
        y={frame.cy - frame.h / 2}
        width={frame.w}
        height={frame.h}
        fill="transparent"
        style={{ cursor: 'move' }}
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={item.x}
          y={top + i * lh}
          textAnchor={anchor}
          dominantBaseline="central"
          fontSize={item.size}
          fill={ink}
          data-ink={item.color}
          fontFamily={FONT_STACK}
          style={{ pointerEvents: 'none', whiteSpace: 'pre' }}
        >
          {line || ' '}
        </text>
      ))}
    </g>
  );
}

/** Part labels sit in their own layer so they stay upright and can be dragged. */
const LabelView = React.memo(function LabelView({
  item,
  theme,
}: {
  item: Item;
  theme: 'dark' | 'light';
}) {
  const c = THEMES[theme];
  const p = labelPoint(item);
  const size = 4.6;
  const w = Math.max(measureTextMm(item.label, size), size);
  const h = size * 1.3;
  return (
    <g>
      <rect
        data-label={item.id}
        x={p.x - w / 2 - 0.8}
        y={p.y - h / 2 - 0.4}
        width={w + 1.6}
        height={h + 0.8}
        fill="transparent"
        style={{ cursor: 'move' }}
      />
      <text
        x={p.x}
        y={p.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size}
        fill={c.label}
        data-ink={c.label}
        stroke={c.labelHalo}
        strokeWidth={0.3}
        paintOrder="stroke"
        fontFamily={FONT_STACK}
        style={{ pointerEvents: 'none' }}
      >
        {item.label}
      </text>
    </g>
  );
});

/* ------------------------------------------------------------------ */
/* beams                                                              */
/* ------------------------------------------------------------------ */

const BEAM_LAYERS_DARK = [
  { f: 1, a: 0.34, light: 0 },
  { f: 0.6, a: 0.55, light: 0.12 },
  { f: 0.28, a: 0.95, light: 0.55 },
];

/** On paper the same alphas read as washed out, so the light bench gets a tighter, harder core. */
const BEAM_LAYERS_LIGHT = [
  { f: 1, a: 0.2, light: 0 },
  { f: 0.55, a: 0.5, light: 0 },
  { f: 0.24, a: 1, light: 0 },
];

function lighten(hex: string, t: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const BeamView = React.memo(function BeamView({
  beam,
  selected,
  zoom,
  theme,
}: {
  beam: Beam;
  selected: boolean;
  zoom: number;
  theme: 'dark' | 'light';
}) {
  const dx = beam.x2 - beam.x1;
  const dy = beam.y2 - beam.y1;
  const L = Math.hypot(dx, dy);
  if (L < 0.05) return null;
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  const w1 = Math.max(beam.w1, 0);
  const w2 = Math.max(beam.w2, 0);
  const W = Math.max(w1, w2, 0.4);
  const mid = { x: (beam.x1 + beam.x2) / 2, y: (beam.y1 + beam.y2) / 2 };
  const g1 = { x: mid.x - (nx * W) / 2, y: mid.y - (ny * W) / 2 };
  const g2 = { x: mid.x + (nx * W) / 2, y: mid.y + (ny * W) / 2 };

  const quads = (theme === 'light' ? BEAM_LAYERS_LIGHT : BEAM_LAYERS_DARK).map((layer, k) => {
    const h1 = (w1 / 2) * layer.f;
    const h2 = (w2 / 2) * layer.f;
    const d = `M ${beam.x1 + nx * h1} ${beam.y1 + ny * h1} L ${beam.x2 + nx * h2} ${beam.y2 + ny * h2} L ${beam.x2 - nx * h2} ${beam.y2 - ny * h2} L ${beam.x1 - nx * h1} ${beam.y1 - ny * h1} Z`;
    return { d, k, a: layer.a, light: lighten(beam.color, layer.light) };
  });

  return (
    <g data-id={beam.id} opacity={beam.opacity}>
      <defs>
        {quads.map((q) => (
          <linearGradient
            key={q.k}
            id={`bg-${beam.id}-${q.k}`}
            gradientUnits="userSpaceOnUse"
            x1={g1.x}
            y1={g1.y}
            x2={g2.x}
            y2={g2.y}
          >
            <stop offset="0" stopColor={q.light} stopOpacity={0} />
            <stop offset="0.13" stopColor={q.light} stopOpacity={q.a * 0.45} />
            <stop offset="0.34" stopColor={q.light} stopOpacity={q.a * 0.92} />
            <stop offset="0.5" stopColor={q.light} stopOpacity={q.a} />
            <stop offset="0.66" stopColor={q.light} stopOpacity={q.a * 0.92} />
            <stop offset="0.87" stopColor={q.light} stopOpacity={q.a * 0.45} />
            <stop offset="1" stopColor={q.light} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      <path
        d={quads[0].d}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(W, 7 / zoom)}
        pointerEvents="stroke"
        style={{ cursor: 'move' }}
      />
      {quads.map((q) => (
        <path key={q.k} d={q.d} fill={`url(#bg-${beam.id}-${q.k})`} style={{ pointerEvents: 'none' }} />
      ))}
      {beam.showLabel && beam.label.trim() !== '' && (
        <text
          x={mid.x + nx * (W / 2 + 4)}
          y={mid.y + ny * (W / 2 + 4)}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={4.5}
          fill={beam.color}
          data-ink={beam.color}
          fontFamily={FONT_STACK}
          style={{ pointerEvents: 'none' }}
        >
          {beam.label}
        </text>
      )}
      {selected && (
        <line
          x1={beam.x1}
          y1={beam.y1}
          x2={beam.x2}
          y2={beam.y2}
          stroke="#38e1c4"
          strokeWidth={1 / zoom}
          strokeDasharray={`${5 / zoom} ${4 / zoom}`}
          data-ui="1"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
});

/** Beam handles live above the parts so they stay clickable. */
function BeamHandles({ beam, zoom }: { beam: Beam; zoom: number }) {
  return (
    <g data-ui="1" data-id={beam.id}>
      {(['p1', 'p2'] as const).map((which) => {
        const p = which === 'p1' ? { x: beam.x1, y: beam.y1 } : { x: beam.x2, y: beam.y2 };
        return (
          <g key={which}>
            <circle cx={p.x} cy={p.y} r={7 / zoom} fill="transparent" />
            <rect
              data-handle={which}
              x={p.x - 4 / zoom}
              y={p.y - 4 / zoom}
              width={8 / zoom}
              height={8 / zoom}
              fill="#0b1118"
              stroke="#38e1c4"
              strokeWidth={1.4 / zoom}
              style={{ cursor: 'crosshair' }}
            />
          </g>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* stage                                                              */
/* ------------------------------------------------------------------ */

type Drag =
  | { type: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | {
      type: 'move';
      start: Pt;
      items: { id: string; x: number; y: number }[];
      beams: { id: string; x1: number; y1: number; x2: number; y2: number }[];
      primary: { id: string; x: number; y: number };
      snap: boolean;
      moved: boolean;
    }
  | { type: 'resize'; id: string; corner: string; f0: Frame; ax: number; ay: number }
  /* text has no w/h: dragging a corner scales the font size instead */
  | { type: 'textResize'; id: string; corner: string; f0: Frame; size0: number; off0: number; ax: number; ay: number }
  | { type: 'rotate'; id: string; cx: number; cy: number; a0: number; rot0: number }
  | { type: 'label'; id: string; start: Pt; off0: Pt; moved: boolean }
  | { type: 'marquee'; start: Pt; cur: Pt }
  | { type: 'beam'; start: Pt; cur: Pt }
  | { type: 'beamEnd'; id: string; which: 'p1' | 'p2' }
  | { type: 'none' };

const CORNERS = [
  { key: 'nw', sx: -1, sy: -1 },
  { key: 'ne', sx: 1, sy: -1 },
  { key: 'se', sx: 1, sy: 1 },
  { key: 'sw', sx: -1, sy: 1 },
];

/** macOS trackpads send plain wheel events for two-finger scrolling. */

export function Stage({ svgRef }: { svgRef: React.RefObject<SVGSVGElement | null> }) {
  const project = useEditor((s) => s.project);
  const view = useEditor((s) => s.view);
  const tool = useEditor((s) => s.tool);
  const snapStep = useEditor((s) => s.snapStep);
  const selection = useEditor((s) => s.selection);
  const conflicts = useConflictIds();
  const theme = project.board.theme;
  const C = THEMES[theme];

  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const [draft, setDraft] = useState<{ a: Pt; b: Pt } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [editingText, setEditingText] = useState<string | null>(null);

  const drag = useRef<Drag>({ type: 'none' });
  const wrapRef = useRef<HTMLDivElement>(null);

  const toWorld = useCallback(
    (clientX: number, clientY: number): Pt => {
      const el = svgRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      const v = useEditor.getState().view;
      return { x: (clientX - r.left - v.panX) / v.zoom, y: (clientY - r.top - v.panY) / v.zoom };
    },
    [svgRef],
  );

  /* viewport size */
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      useEditor.getState().setViewport({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    useEditor.getState().setViewport({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  /* native wheel handler so we can preventDefault */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      // On a Mac trackpad a two-finger swipe must pan; pinch (ctrl+wheel) zooms.
      // With a mouse the wheel keeps zooming, as on Windows.
      if (IS_MAC && !e.ctrlKey && !e.metaKey) {
        useEditor.getState().panBy(-dx, -dy);
        return;
      }
      useEditor.getState().zoomAt(Math.exp(-dy * 0.0014), sx, sy);
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    /*
     * Safari never sends ctrl+wheel for a trackpad pinch — WebKit emits the
     * non-standard gesture* events instead. Without these handlers pinch would
     * zoom the whole page (or do nothing) on macOS. `scale` is cumulative
     * within one gesture, so we feed zoom only the per-event ratio.
     */
    let gestureScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureScale = 1;
    };
    const onGestureChange = (e: Event) => {
      const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
      g.preventDefault();
      const scale = g.scale ?? 1;
      if (!Number.isFinite(scale) || scale <= 0) return;
      const r = el.getBoundingClientRect();
      useEditor.getState().zoomAt(scale / gestureScale, (g.clientX ?? 0) - r.left, (g.clientY ?? 0) - r.top);
      gestureScale = scale;
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      gestureScale = 1;
    };
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    el.addEventListener('gestureend', onGestureEnd);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureEnd);
    };
  }, [svgRef]);

  /* space bar pans */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.code === 'Space') {
        setSpaceDown(true);
        if (e.target === document.body) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = e.target as Element;
    const isMiddle = e.button === 1;
    const isRight = e.button === 2;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    setEditingText(null);

    if (isMiddle || isRight || spaceDown) {
      drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, panX: view.panX, panY: view.panY };
      return;
    }
    if (e.button !== 0) return;

    const p = toWorld(e.clientX, e.clientY);

    if (tool === 'beam') {
      const a = e.altKey ? p : { x: snapTo(p.x, snapStep), y: snapTo(p.y, snapStep) };
      drag.current = { type: 'beam', start: a, cur: a };
      setDraft({ a, b: a });
      return;
    }

    if (tool === 'text') {
      useEditor.getState().addText(p);
      useEditor.getState().setTool('select');
      return;
    }

    const st = useEditor.getState();

    /* label drag (before the generic item hit test) */
    const labelEl = el.closest('[data-label]');
    if (labelEl) {
      const id = labelEl.getAttribute('data-label')!;
      const item = st.project.items.find((i) => i.id === id);
      if (item && !item.locked) {
        if (!st.selection.includes(id)) st.select([id]);
        const base = item.labelOffset ?? {
          x: labelPoint(item).x - item.x,
          y: labelPoint(item).y - item.y,
        };
        st.pushHistory();
        drag.current = { type: 'label', id, start: p, off0: base, moved: false };
        return;
      }
    }

    const handleEl = el.closest('[data-handle]');
    if (handleEl) {
      const h = handleEl.getAttribute('data-handle')!;
      const idSelector = el.closest('[data-id]')?.getAttribute('data-id');
      if (h === 'rot' && idSelector) {
        const item = st.project.items.find((i) => i.id === idSelector);
        if (item) {
          const f = itemFrame(item);
          const a0 = (Math.atan2(p.y - f.cy, p.x - f.cx) * 180) / Math.PI;
          st.pushHistory();
          drag.current = { type: 'rotate', id: item.id, cx: f.cx, cy: f.cy, a0, rot0: item.rot };
          return;
        }
      }
      if (h === 'p1' || h === 'p2') {
        const beamEl = el.closest('[data-id]')?.getAttribute('data-id');
        if (beamEl) {
          st.pushHistory();
          drag.current = { type: 'beamEnd', id: beamEl, which: h };
          return;
        }
      }
      if (idSelector && /^(nw|ne|se|sw)$/.test(h)) {
        const item = st.project.items.find((i) => i.id === idSelector);
        if (item) {
          const f = itemFrame(item);
          const c = CORNERS.find((c) => c.key === h)!;
          const anchor = rotatePt({ x: (-c.sx * f.w) / 2, y: (-c.sy * f.h) / 2 }, f.rot);
          st.pushHistory();
          drag.current =
            item.kind === 'text'
              ? {
                  type: 'textResize',
                  id: item.id,
                  corner: h,
                  f0: f,
                  size0: item.size,
                  off0: f.cx - item.x,
                  ax: f.cx + anchor.x,
                  ay: f.cy + anchor.y,
                }
              : {
                  type: 'resize',
                  id: item.id,
                  corner: h,
                  f0: f,
                  ax: f.cx + anchor.x,
                  ay: f.cy + anchor.y,
                };
          return;
        }
      }
    }

    const idEl = el.closest('[data-id]');
    const hitId = idEl ? idEl.getAttribute('data-id') : null;

    if (hitId) {
      const alreadySelected = st.selection.includes(hitId);
      if (e.shiftKey) st.select([hitId], 'toggle');
      else if (!alreadySelected) st.select([hitId], 'replace');

      // Ctrl + drag copies on the fly
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        st.duplicateInPlace([hitId]);
      }

      const cur = useEditor.getState();
      const sel = cur.selection;
      if (sel.includes(hitId) || sel.length) {
        const items = cur.project.items
          .filter((i) => sel.includes(i.id) && !i.locked)
          .map((i) => ({ id: i.id, x: i.x, y: i.y }));
        const beams = cur.project.beams
          .filter((b) => sel.includes(b.id) && !b.locked)
          .map((b) => ({ id: b.id, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 }));
        const primItem = cur.project.items.find((i) => i.id === hitId);
        const primBeam = cur.project.beams.find((b) => b.id === hitId);
        if (items.length || beams.length) {
          cur.pushHistory();
          drag.current = {
            type: 'move',
            start: p,
            items,
            beams,
            primary: primItem
              ? { id: primItem.id, x: primItem.x, y: primItem.y }
              : { id: primBeam!.id, x: primBeam!.x1, y: primBeam!.y1 },
            snap: primItem ? primItem.snap : (primBeam?.snap ?? true),
            moved: false,
          };
        }
      }
      return;
    }

    if (!e.shiftKey) st.clearSelection();
    drag.current = { type: 'marquee', start: p, cur: p };
    setMarquee({ a: p, b: p });
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toWorld(e.clientX, e.clientY);
    useEditor.getState().setCursor(p);
    const d = drag.current;

    if (d.type === 'pan') {
      useEditor.getState().setView({
        panX: d.panX + (e.clientX - d.sx),
        panY: d.panY + (e.clientY - d.sy),
      });
      return;
    }

    if (d.type === 'marquee') {
      d.cur = p;
      setMarquee({ a: d.start, b: p });
      return;
    }

    if (d.type === 'beam') {
      let end = e.altKey ? p : { x: snapTo(p.x, snapStep), y: snapTo(p.y, snapStep) };
      if (e.shiftKey) end = constrain45(d.start, end);
      d.cur = end;
      setDraft({ a: d.start, b: end });
      return;
    }

    if (d.type === 'move') {
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (e.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (!e.altKey && d.snap) {
        dx = snapTo(d.primary.x + dx, snapStep) - d.primary.x;
        dy = snapTo(d.primary.y + dy, snapStep) - d.primary.y;
      }

      d.moved = d.moved || Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6;
      useEditor.setState((s) => {
        const im = new Map(d.items.map((i) => [i.id, i]));
        const bm = new Map(d.beams.map((b) => [b.id, b]));
        return {
          project: {
            ...s.project,
            items: s.project.items.map((it) => {
              const o = im.get(it.id);
              return o ? { ...it, x: o.x + dx, y: o.y + dy } : it;
            }),
            beams: s.project.beams.map((b) => {
              const o = bm.get(b.id);
              return o
                ? { ...b, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy }
                : b;
            }),
          },
        };
      });
      return;
    }

    if (d.type === 'label') {
      let ox = d.off0.x + (p.x - d.start.x);
      let oy = d.off0.y + (p.y - d.start.y);
      if (e.shiftKey) {
        if (Math.abs(p.x - d.start.x) >= Math.abs(p.y - d.start.y)) oy = d.off0.y;
        else ox = d.off0.x;
      }
      d.moved = true;
      useEditor.getState().updateItem(
        d.id,
        { labelOffset: { x: Math.round(ox * 10) / 10, y: Math.round(oy * 10) / 10 } } as Partial<Item>,
        false,
      );
      return;
    }

    if (d.type === 'textResize') {
      // Uniform scale about the opposite corner: project the pointer onto the
      // original corner diagonal, then apply that ratio to the font size.
      const c = CORNERS.find((c) => c.key === d.corner)!;
      const rel = rotatePt({ x: p.x - d.ax, y: p.y - d.ay }, -d.f0.rot);
      const ux = c.sx * d.f0.w;
      const uy = c.sy * d.f0.h;
      const denom = ux * ux + uy * uy;
      const k0 = denom > 1e-6 ? (rel.x * ux + rel.y * uy) / denom : 1;
      const size = Math.min(Math.max(d.size0 * Math.min(Math.max(k0, 0.1), 20), 0.5), 500);
      const k = size / d.size0;
      const centre = rotatePt({ x: (c.sx * d.f0.w * k) / 2, y: (c.sy * d.f0.h * k) / 2 }, d.f0.rot);
      useEditor.getState().updateItem(
        d.id,
        {
          size: Math.round(size * 10) / 10,
          x: Math.round((d.ax + centre.x - d.off0 * k) * 10) / 10,
          y: Math.round((d.ay + centre.y) * 10) / 10,
        } as Partial<Item>,
        false,
      );
      return;
    }

    if (d.type === 'resize') {
      const c = CORNERS.find((c) => c.key === d.corner)!;
      const rel = { x: p.x - d.ax, y: p.y - d.ay };
      const local = rotatePt(rel, -d.f0.rot);
      let w = Math.max(Math.abs(local.x), 1);
      let h = Math.max(Math.abs(local.y), 1);
      if (e.shiftKey) {
        const ratio = d.f0.w / Math.max(d.f0.h, 0.001);
        if (w / d.f0.w > h / d.f0.h) h = w / ratio;
        else w = h * ratio;
      }
      const localCenter = rotatePt({ x: (c.sx * w) / 2, y: (c.sy * h) / 2 }, d.f0.rot);
      useEditor.getState().updateItem(
        d.id,
        {
          w: Math.round(w * 10) / 10,
          h: Math.round(h * 10) / 10,
          x: d.ax + localCenter.x,
          y: d.ay + localCenter.y,
        } as Partial<Item>,
        false,
      );
      return;
    }

    if (d.type === 'rotate') {
      const a = (Math.atan2(p.y - d.cy, p.x - d.cx) * 180) / Math.PI;
      let rot = d.rot0 + (a - d.a0);
      if (e.shiftKey) rot = snapDeg(rot, 15);
      useEditor
        .getState()
        .updateItem(d.id, { rot: Math.round(normDeg(rot) * 10) / 10 } as Partial<Item>, false);
      return;
    }

    if (d.type === 'beamEnd') {
      const b = useEditor.getState().project.beams.find((bb) => bb.id === d.id);
      const useSnap = !e.altKey && (b?.snap ?? true);
      let end = useSnap ? { x: snapTo(p.x, snapStep), y: snapTo(p.y, snapStep) } : p;
      if (e.shiftKey && b) {
        const other = d.which === 'p1' ? { x: b.x2, y: b.y2 } : { x: b.x1, y: b.y1 };
        end = constrain45(other, end);
      }
      const patch = d.which === 'p1' ? { x1: end.x, y1: end.y } : { x2: end.x, y2: end.y };
      useEditor.getState().updateBeam(d.id, patch, false);
      return;
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = { type: 'none' };
    (e.currentTarget as SVGSVGElement).releasePointerCapture?.(e.pointerId);

    if (d.type === 'marquee') {
      setMarquee(null);
      const a = d.start;
      const b = d.cur;
      if (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1) return;
      const r = {
        minX: Math.min(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxX: Math.max(a.x, b.x),
        maxY: Math.max(a.y, b.y),
      };
      const st = useEditor.getState();
      const ids: string[] = [];
      for (const it of st.project.items) {
        const c = frameCorners(itemFrame(it));
        if (c.some((p) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY)) ids.push(it.id);
      }
      for (const bm of st.project.beams) {
        if (
          (bm.x1 >= r.minX && bm.x1 <= r.maxX && bm.y1 >= r.minY && bm.y1 <= r.maxY) ||
          (bm.x2 >= r.minX && bm.x2 <= r.maxX && bm.y2 >= r.minY && bm.y2 <= r.maxY)
        )
          ids.push(bm.id);
      }
      st.select(ids, 'add');
      return;
    }

    if (d.type === 'beam') {
      setDraft(null);
      const a = d.start;
      const b = d.cur;
      if (Math.hypot(b.x - a.x, b.y - a.y) < 2) return;
      const st = useEditor.getState();
      const last = st.project.beams[st.project.beams.length - 1];
      st.addBeam({
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        w1: last ? last.w1 : 3,
        w2: last ? last.w2 : 3,
        color: last ? last.color : '#ff2f4a',
      });
      return;
    }

    if ((d.type === 'move' || d.type === 'label') && !d.moved) {
      useEditor.getState().dropLastHistory();
    }
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // pointer capture makes the browser retarget click/dblclick at the <svg>,
    // so hit-test the DOM manually at the cursor position
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const labelEl = el?.closest('[data-label]');
    const idEl = el?.closest('[data-id]');
    const id = labelEl?.getAttribute('data-label') ?? idEl?.getAttribute('data-id');
    if (!id) return;
    const st = useEditor.getState();
    const item = st.project.items.find((i) => i.id === id);
    if (item && item.kind === 'text') {
      st.select([id]);
      setEditingText(id);
    }
  };

  const conflictIds = conflicts;
  const selected = new Set(selection);
  const { board } = project;
  const { zoom, panX, panY } = view;
  const sw = 1 / zoom;

  const gridPitch = useMemo(() => {
    let p = board.pitch || 25;
    while (p * zoom < 9) p *= 2;
    return p;
  }, [board.pitch, zoom]);

  const dotR = clamp(1.15 / zoom, 0.05, 3);

  const singleSel =
    selection.length === 1
      ? project.items.find((i) => i.id === selection[0]) ??
        project.beams.find((b) => b.id === selection[0]) ??
        null
      : null;
  const singleItem = singleSel && 'kind' in singleSel ? (singleSel as Item) : null;
  const editFrame = singleItem && singleItem.kind === 'text' ? itemFrame(singleItem) : null;

  return (
    <div className={`stage-wrap theme-${theme}`} ref={wrapRef}>
      <svg
        ref={svgRef}
        className="stage"
        data-stage="1"
        style={{ cursor: spaceDown ? 'grab' : tool === 'beam' ? 'crosshair' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern
            id="gridDot"
            width={gridPitch}
            height={gridPitch}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${-gridPitch / 2} ${-gridPitch / 2})`}
          >
            <circle
              data-grid-dot="1"
              cx={gridPitch / 2}
              cy={gridPitch / 2}
              r={dotR}
              fill={C.gridDot}
            />
          </pattern>
          <pattern
            id="gridDotBoard"
            width={gridPitch}
            height={gridPitch}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${-gridPitch / 2} ${-gridPitch / 2})`}
          >
            <circle
              data-grid-dot="1"
              cx={gridPitch / 2}
              cy={gridPitch / 2}
              r={dotR}
              fill={C.gridDotBoard}
            />
          </pattern>
        </defs>

        <g data-world="1" transform={`translate(${panX} ${panY}) scale(${zoom})`}>
          {/* background */}
          {board.mode === 'plate' ? (
            <>
              <rect
                data-board-bg="1"
                x={0}
                y={0}
                width={board.w}
                height={board.h}
                fill={C.boardBg}
                stroke={C.boardBorder}
                strokeWidth={2 * sw}
              />
              {board.showGrid && (
                <rect
                  data-board-grid="1"
                  x={0}
                  y={0}
                  width={board.w}
                  height={board.h}
                  fill="url(#gridDotBoard)"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              <rect
                x={0}
                y={0}
                width={board.w}
                height={board.h}
                fill="none"
                stroke={C.boardEdge}
                strokeWidth={1.2 * sw}
                style={{ pointerEvents: 'none' }}
              />
            </>
          ) : (
            board.showGrid && (
              <rect
                data-board-grid="1"
                x={-100000}
                y={-100000}
                width={200000}
                height={200000}
                fill="url(#gridDot)"
                style={{ pointerEvents: 'none' }}
              />
            )
          )}

          {/* origin marker */}
          <g
            data-origin="1"
            stroke={C.origin}
            strokeOpacity={0.45}
            strokeWidth={1.2 * sw}
            style={{ pointerEvents: 'none' }}
          >
            <line x1={-6} y1={0} x2={6} y2={0} />
            <line x1={0} y1={-6} x2={0} y2={6} />
          </g>

          {project.beams.map((b) => (
            <BeamView key={b.id} beam={b} selected={selected.has(b.id)} zoom={zoom} theme={theme} />
          ))}

          {project.items.map((it) => (
            <ItemView
              key={it.id}
              item={it}
              selected={selected.has(it.id)}
              conflict={conflictIds.has(it.id)}
              zoom={zoom}
              theme={theme}
            />
          ))}

          {/* light traced through the scene, above the parts so a beam crossing a
              lens or a splitter cube stays visible */}
          <AutoBeams project={project} />

          {/* labels: always upright, above the parts */}
          {project.items
            .filter((it) => it.kind === 'lib' && it.showLabel && it.label.trim() !== '')
            .map((it) => (
              <LabelView key={`lbl-${it.id}`} item={it} theme={theme} />
            ))}

          {/* selection handles for a single object */}
          {singleItem && singleItem.kind !== 'text' && (
            <ItemHandles item={singleItem} zoom={zoom} />
          )}
          {singleItem && singleItem.kind === 'text' && (
            <TextHandles item={singleItem} zoom={zoom} />
          )}
          {project.beams
            .filter((b) => selected.has(b.id) && !b.locked)
            .map((b) => (
              <BeamHandles key={b.id} beam={b} zoom={zoom} />
            ))}

          {marquee && (
            <rect
              data-ui="1"
              x={Math.min(marquee.a.x, marquee.b.x)}
              y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.a.x - marquee.b.x)}
              height={Math.abs(marquee.a.y - marquee.b.y)}
              fill="#38e1c4"
              fillOpacity={0.07}
              stroke="#38e1c4"
              strokeWidth={1 * sw}
              strokeDasharray={`${4 * sw} ${4 * sw}`}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {draft && (
            <g data-ui="1" style={{ pointerEvents: 'none' }}>
              <line
                x1={draft.a.x}
                y1={draft.a.y}
                x2={draft.b.x}
                y2={draft.b.y}
                stroke="#38e1c4"
                strokeWidth={3}
                strokeOpacity={0.5}
                strokeDasharray={`${6 / zoom} ${5 / zoom}`}
              />
              <circle cx={draft.a.x} cy={draft.a.y} r={3 / zoom} fill="#38e1c4" />
              <text
                x={(draft.a.x + draft.b.x) / 2}
                y={(draft.a.y + draft.b.y) / 2 - 6 / zoom}
                textAnchor="middle"
                fontSize={11 / zoom}
                fill="#38e1c4"
                fontFamily={FONT_STACK}
              >
                {Math.round(Math.hypot(draft.b.x - draft.a.x, draft.b.y - draft.a.y))} mm
              </text>
            </g>
          )}
        </g>
      </svg>

      {editingText && editFrame && (
        <TextEditor
          id={editingText}
          frame={editFrame}
          view={view}
          theme={theme}
          onDone={() => setEditingText(null)}
        />
      )}
    </div>
  );
}

function constrain45(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ang = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(ang / step) * step;
  const len = Math.hypot(dx, dy);
  return { x: a.x + Math.cos(snapped) * len, y: a.y + Math.sin(snapped) * len };
}

function ItemHandles({ item, zoom }: { item: Exclude<Item, TextItem>; zoom: number }) {
  const f = itemFrame(item);
  const s = 4.5 / zoom;
  if (item.locked) return null;
  const rotArm = 16 / zoom;
  return (
    <g data-ui="1" data-id={item.id}>
      <g transform={`translate(${f.cx} ${f.cy}) rotate(${f.rot})`}>
        {CORNERS.map((c) => (
          <rect
            key={c.key}
            data-handle={c.key}
            x={(c.sx * f.w) / 2 - s}
            y={(c.sy * f.h) / 2 - s}
            width={s * 2}
            height={s * 2}
            rx={s * 0.35}
            fill="#0b1118"
            stroke="#38e1c4"
            strokeWidth={1.4 / zoom}
            style={{ cursor: `${c.key}-resize` }}
          />
        ))}
        <line
          x1={0}
          y1={-f.h / 2}
          x2={0}
          y2={-f.h / 2 - rotArm}
          stroke="#38e1c4"
          strokeWidth={1.2 / zoom}
          style={{ pointerEvents: 'none' }}
        />
        <circle
          data-handle="rot"
          cx={0}
          cy={-f.h / 2 - rotArm}
          r={s}
          fill="#0b1118"
          stroke="#38e1c4"
          strokeWidth={1.4 / zoom}
          style={{ cursor: 'grab' }}
        />
      </g>
    </g>
  );
}

function TextHandles({ item, zoom }: { item: TextItem; zoom: number }) {
  const f = itemFrame(item);
  const s = 4.5 / zoom;
  const rotArm = 16 / zoom;
  if (item.locked) return null;
  return (
    <g data-ui="1" data-id={item.id}>
      <g transform={`translate(${f.cx} ${f.cy}) rotate(${f.rot})`}>
        {CORNERS.map((c) => (
          <rect
            key={c.key}
            data-handle={c.key}
            x={(c.sx * f.w) / 2 - s}
            y={(c.sy * f.h) / 2 - s}
            width={s * 2}
            height={s * 2}
            rx={s * 0.35}
            fill="#0b1118"
            stroke="#38e1c4"
            strokeWidth={1.4 / zoom}
            style={{ cursor: `${c.key}-resize` }}
          />
        ))}
        <line
          x1={0}
          y1={-f.h / 2}
          x2={0}
          y2={-f.h / 2 - rotArm}
          stroke="#38e1c4"
          strokeWidth={1.2 / zoom}
          style={{ pointerEvents: 'none' }}
        />
        <circle
          data-handle="rot"
          cx={0}
          cy={-f.h / 2 - rotArm}
          r={s}
          fill="#0b1118"
          stroke="#38e1c4"
          strokeWidth={1.4 / zoom}
          style={{ cursor: 'grab' }}
        />
      </g>
    </g>
  );
}

function TextEditor({
  id,
  frame,
  view,
  theme,
  onDone,
}: {
  id: string;
  frame: Frame;
  view: { zoom: number; panX: number; panY: number };
  theme: 'dark' | 'light';
  onDone: () => void;
}) {
  const item = useEditor((s) => s.project.items.find((i) => i.id === id)) as TextItem | undefined;
  const [value, setValue] = useState(item?.text ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  if (!item) return null;
  const left = view.panX + (frame.cx - frame.w / 2) * view.zoom;
  const top = view.panY + (frame.cy - frame.h / 2) * view.zoom;

  const commit = () => {
    if (value !== item.text) {
      useEditor.getState().pushHistory();
      useEditor.getState().updateItem(id, { text: value } as Partial<Item>, false);
    }
    onDone();
  };

  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={value}
      style={{
        left,
        top,
        width: Math.max(frame.w * view.zoom, 80),
        height: Math.max(frame.h * view.zoom, 28),
        fontSize: item.size * view.zoom,
        color: adaptInk(item.color, theme),
        textAlign: item.align,
      }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onDone();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
        e.stopPropagation();
      }}
    />
  );
}

export { };
