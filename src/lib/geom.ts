import type { Beam, Item } from '../model/types';

export interface Pt {
  x: number;
  y: number;
}

export interface Frame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

export const FONT_STACK = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";

let _ctx: CanvasRenderingContext2D | null = null;

/** Width of a text run in mm, when the font size is given in mm. */
export function measureTextMm(text: string, sizeMm: number): number {
  if (!_ctx) _ctx = document.createElement('canvas').getContext('2d');
  if (!_ctx) return text.length * sizeMm * 0.55;
  _ctx.font = `400 ${sizeMm}px ${FONT_STACK}`;
  return _ctx.measureText(text).width;
}

export function textLines(text: string): string[] {
  return text.split('\n');
}

export const LINE_HEIGHT = 1.28;

/** Axis-aligned frame of an item, in world mm. Text is measured on the fly. */
export function itemFrame(item: Item): Frame {
  if (item.kind !== 'text') {
    return { cx: item.x, cy: item.y, w: item.w, h: item.h, rot: item.rot };
  }
  const lines = textLines(item.text);
  let w = 0;
  for (const line of lines) w = Math.max(w, measureTextMm(line, item.size));
  w = Math.max(w, item.size * 0.6);
  const h = lines.length * item.size * LINE_HEIGHT;
  const off = item.align === 'left' ? w / 2 : item.align === 'right' ? -w / 2 : 0;
  return { cx: item.x + off, cy: item.y, w, h, rot: item.rot };
}

export function rotatePt(p: Pt, deg: number): Pt {
  if (!deg) return { x: p.x, y: p.y };
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Corners of a frame in world coordinates, clockwise from top-left. */
export function frameCorners(f: Frame): Pt[] {
  const hw = f.w / 2;
  const hh = f.h / 2;
  const local: Pt[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return local.map((p) => {
    const r = rotatePt(p, f.rot);
    return { x: f.cx + r.x, y: f.cy + r.y };
  });
}

export function itemCorners(item: Item): Pt[] {
  return frameCorners(itemFrame(item));
}

function projectPoly(poly: Pt[], ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * ax + p.y * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/** Separating-axis test for two convex polygons. Touching edges do not count. */
export function polyOverlap(a: Pt[], b: Pt[], eps = 0.05): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const ax = -(p2.y - p1.y);
      const ay = p2.x - p1.x;
      const len = Math.hypot(ax, ay);
      if (len < 1e-9) continue;
      const [amin, amax] = projectPoly(a, ax / len, ay / len);
      const [bmin, bmax] = projectPoly(b, ax / len, ay / len);
      if (amax <= bmin + eps || bmax <= amin + eps) return false;
    }
  }
  return true;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bboxOfPoints(pts: Pt[]): BBox {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of pts) {
    if (p.x < b.minX) b.minX = p.x;
    if (p.y < b.minY) b.minY = p.y;
    if (p.x > b.maxX) b.maxX = p.x;
    if (p.y > b.maxY) b.maxY = p.y;
  }
  return b;
}

export function unionBBox(a: BBox | null, b: BBox | null): BBox | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function bboxIntersectsRect(b: BBox, r: BBox): boolean {
  return !(b.maxX < r.minX || b.minX > r.maxX || b.maxY < r.minY || b.minY > r.maxY);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function snapTo(v: number, step: number): number {
  if (!step) return v;
  return Math.round(v / step) * step;
}

export function snapDeg(v: number, step = 15): number {
  return Math.round(v / step) * step;
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function beamLength(b: Beam): number {
  return Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
}

/** Half divergence angle of a beam, in degrees. */
export function beamHalfAngle(b: Beam): number {
  const L = beamLength(b);
  if (L < 1e-6) return 0;
  return (Math.atan2((b.w2 - b.w1) / 2, L) * 180) / Math.PI;
}

export function normDeg(d: number): number {
  let v = d % 360;
  if (v < 0) v += 360;
  return v;
}

export function fmt(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  const r = Number(v.toFixed(digits));
  return String(r);
}

/* ------------------------------------------------------------------ */
/* colour helpers (theme-aware ink)                                    */
/* ------------------------------------------------------------------ */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(c: Rgb): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`;
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function luminance(hex: string): number {
  const c = hexToRgb(hex);
  if (!c) return 0.5;
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function rgbToHsl(c: Rgb): [number, number, number] {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: Math.round(hue(h + 1 / 3) * 255),
    g: Math.round(hue(h) * 255),
    b: Math.round(hue(h - 1 / 3) * 255),
  };
}

/**
 * Keep text readable on either background: light ink on a light bench turns dark
 * (same hue) and very dark ink on the dark bench turns light.
 */
export function adaptInk(color: string, theme: 'dark' | 'light'): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const [h, s, l] = rgbToHsl(rgb);
  const y = luminance(color);
  if (theme === 'light') {
    if (y < 0.28) return color;
    return rgbToHex(hslToRgb(h, Math.min(1, s * 1.05), Math.max(0.16, Math.min(0.3, l * 0.32))));
  }
  if (y > 0.22) return color;
  return rgbToHex(hslToRgb(h, s, Math.max(0.72, Math.min(0.9, l + 0.55))));
}

/* ------------------------------------------------------------------ */
/* label anchor                                                        */
/* ------------------------------------------------------------------ */

/** Where the (unrotated) label sits, in world mm. */
export function labelPoint(item: Item): Pt {
  if (item.labelOffset) return { x: item.x + item.labelOffset.x, y: item.y + item.labelOffset.y };
  const f = itemFrame(item);
  const rad = (f.rot * Math.PI) / 180;
  const hh = Math.abs((f.w / 2) * Math.sin(rad)) + Math.abs((f.h / 2) * Math.cos(rad));
  return { x: f.cx, y: f.cy + hh + 3.6 };
}

/* ------------------------------------------------------------------ */
/* beam geometry editing                                               */
/* ------------------------------------------------------------------ */

export function beamAngle(b: Beam): number {
  return (Math.atan2(b.y2 - b.y1, b.x2 - b.x1) * 180) / Math.PI;
}

export function beamEndFrom(b: Beam, length: number, angleDeg: number): Pt {
  const r = (angleDeg * Math.PI) / 180;
  return { x: b.x1 + Math.cos(r) * length, y: b.y1 + Math.sin(r) * length };
}
