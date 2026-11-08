/**
 * Straight-line optical path tracer with Gaussian-beam widths.
 *
 * Physics used (explicitly, so it can be checked and argued with):
 *   - every emitter launches a *collimated* beam: waist at the output face,
 *     q = i z_R with z_R = pi w0^2 / lambda;
 *   - propagation over a distance d: q -> q + d;
 *   - thin lens: 1/q' = 1/q - 1/f (f > 0 converging, f < 0 diverging);
 *   - flat mirror: direction reflected about the surface normal, q unchanged;
 *   - beamsplitter: the transmitted branch keeps q, the reflected branch keeps q
 *     too — same diameter and same convergence on both arms, as requested;
 *   - the beam radius follows the Gaussian envelope
 *     w(z) = sqrt(-lambda / (pi Im(1/q))), i.e. hyperbolic, not a straight taper.
 *
 * Deliberate simplifications: 2D paraxial (ignore the oblique-incidence cosine),
 * thin elements, flat mirrors only (a concave mirror is treated as flat), no
 * polarisation, no interference, no diffraction beyond the Gaussian envelope.
 */
import type { LibItem, Project } from '../model/types';
import { opticSpec, type OpticRole } from './opticsMap';
import { wavelengthToColor } from './spectrum';

export interface Vec {
  x: number;
  y: number;
}

export interface BeamHit {
  itemId: string;
  role: OpticRole;
  x: number;
  y: number;
}

export interface BeamSample {
  x: number;
  y: number;
  /** half width of the beam here, mm */
  hw: number;
}

export interface TracedBeam {
  id: string;
  sourceId: string;
  wavelength: number;
  color: string;
  opacity: number;
  diameter: number;
  samples: BeamSample[];
  hits: BeamHit[];
  ended: 'detector' | 'blocker' | 'edge' | 'limit';
}

export interface Complex {
  re: number;
  im: number;
}

const EPS = 0.06; // mm, stops a ray from re-hitting the surface it just left
const MAX_SEGMENTS = 80;
const MAX_PATHS = 64;
const MAX_DEPTH = 8;
const SAMPLES_PER_SEGMENT = 24;

/**
 * Where to sample along one straight run. Uniform spacing plus the beam waist
 * (Re(1/q) = 0, i.e. s = -Re(q)) so a tight focus is never lost between two
 * samples and the drawn envelope gets its cusp.
 */
function sampleDistances(q: Complex, advance: number): number[] {
  const marks: number[] = [];
  for (let i = 1; i <= SAMPLES_PER_SEGMENT; i++) marks.push((advance * i) / SAMPLES_PER_SEGMENT);
  const waist = -q.re;
  if (waist > advance * 0.002 && waist < advance * 0.998) marks.push(waist);
  marks.sort((a, b) => a - b);
  const out: number[] = [];
  for (const s of marks) {
    if (out.length === 0 || s - out[out.length - 1] > advance * 1e-4) out.push(s);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* complex helpers                                                     */
/* ------------------------------------------------------------------ */

function divide(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  if (d < 1e-18) return { re: 0, im: 0 };
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

/** Beam half-width from the q parameter: w^2 = -lambda / (pi Im(1/q)). */
export function halfWidthFromQ(q: Complex, lambda: number): number {
  const inv = divide({ re: 1, im: 0 }, q);
  const denom = Math.PI * inv.im;
  if (!Number.isFinite(denom) || denom >= 0) return Number.NaN;
  return Math.sqrt(Math.max(-lambda / denom, 0));
}

export function rayleighRange(w0: number, lambda: number): number {
  return (Math.PI * w0 * w0) / lambda;
}

/** Thin lens in q-space: 1/q' = 1/q - 1/f. */
export function applyLens(q: Complex, focal: number): Complex {
  if (!Number.isFinite(focal) || Math.abs(focal) < 1e-6) return q;
  return divide(q, { re: 1 - q.re / focal, im: -q.im / focal });
}

/** Flat mirror: reflect d about the unit normal n. */
export function reflect(d: Vec, n: Vec): Vec {
  const dot = d.x * n.x + d.y * n.y;
  return { x: d.x - 2 * dot * n.x, y: d.y - 2 * dot * n.y };
}

/* ------------------------------------------------------------------ */
/* scene -> optical elements                                           */
/* ------------------------------------------------------------------ */

export interface Element {
  id: string;
  role: OpticRole;
  center: Vec;
  /** unit vector along the active face */
  surface: Vec;
  /** half length of the active face, mm */
  half: number;
  split: number;
  focal: number;
}

function rotate(v: Vec, deg: number): Vec {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function buildElements(project: Project): Element[] {
  const out: Element[] = [];
  for (const it of project.items) {
    if (it.kind !== 'lib') continue;
    const spec = opticSpec(it.lib);
    if (!spec || spec.role === 'source' || spec.role === 'coupler') continue;
    const base = { x: Math.cos((spec.surfaceDeg * Math.PI) / 180), y: Math.sin((spec.surfaceDeg * Math.PI) / 180) };
    const u = rotate(base, it.rot);
    const half = spec.role === 'splitter' ? Math.hypot(it.w, it.h) / 2 : Math.max(it.h, 4) / 2;
    out.push({
      id: it.id,
      role: spec.role,
      center: { x: it.x, y: it.y },
      surface: u,
      half: half + 0.6,
      split: (it as LibItem).split ?? spec.split ?? 0.5,
      focal: (it as LibItem).focal ?? spec.focal ?? 100,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* geometry                                                            */
/* ------------------------------------------------------------------ */

/** Distance along the ray to the segment a-b; Infinity when it misses. */
export function raySegment(origin: Vec, dir: Vec, a: Vec, b: Vec): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = dir.x * ey - dir.y * ex;
  if (Math.abs(denom) < 1e-12) return Infinity;
  const t = ((a.x - origin.x) * ey - (a.y - origin.y) * ex) / denom;
  const s = ((a.x - origin.x) * dir.y - (a.y - origin.y) * dir.x) / denom;
  if (t <= 1e-6 || s < -0.001 || s > 1.001) return Infinity;
  return t;
}

/** Distance along the ray to the edge of the drawing area. */
function rayRect(origin: Vec, dir: Vec, rect: { minX: number; minY: number; maxX: number; maxY: number }): number {
  let best = Infinity;
  const edges: [Vec, Vec][] = [
    [{ x: rect.minX, y: rect.minY }, { x: rect.maxX, y: rect.minY }],
    [{ x: rect.maxX, y: rect.minY }, { x: rect.maxX, y: rect.maxY }],
    [{ x: rect.maxX, y: rect.maxY }, { x: rect.minX, y: rect.maxY }],
    [{ x: rect.minX, y: rect.maxY }, { x: rect.minX, y: rect.minY }],
  ];
  for (const [a, b] of edges) {
    const t = raySegment(origin, dir, a, b);
    if (t < best) best = t;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* tracing                                                             */
/* ------------------------------------------------------------------ */

interface PathState {
  id: string;
  sourceId: string;
  pos: Vec;
  dir: Vec;
  /** q at `pos` */
  q: Complex;
  depth: number;
  samples: BeamSample[];
  hits: BeamHit[];
}

export function traceScene(project: Project): TracedBeam[] {
  const elements = buildElements(project);
  const rect =
    project.board.mode === 'plate'
      ? { minX: 0, minY: 0, maxX: project.board.w, maxY: project.board.h }
      : { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000 };

  const beams: TracedBeam[] = [];

  for (const item of project.items) {
    if (item.kind !== 'lib') continue;
    const spec = opticSpec(item.lib);
    if (!spec || (spec.role !== 'source' && spec.role !== 'coupler')) continue;
    const lib = item as LibItem;
    if (lib.emit === false) continue;
    if (spec.role === 'coupler' && lib.couplerMode === 'in') continue;

    const wavelength = lib.wavelength ?? spec.wavelength ?? 633;
    const lambda = wavelength * 1e-6; // nm -> mm
    const diameter = lib.beamDia ?? spec.dia ?? 2;
    const opacity = lib.beamOpacity ?? 0.9;
    const emitDeg = (spec.emitDeg ?? 0) + item.rot;
    const dir = rotate({ x: 1, y: 0 }, emitDeg);
    const halfExtent =
      (Math.abs(Math.cos((emitDeg * Math.PI) / 180)) * item.w) / 2 +
      (Math.abs(Math.sin((emitDeg * Math.PI) / 180)) * item.h) / 2;

    const w0 = diameter / 2;
    const startPos: Vec = { x: item.x + dir.x * halfExtent, y: item.y + dir.y * halfExtent };

    const queue: PathState[] = [
      {
        id: `${item.id}:0`,
        sourceId: item.id,
        pos: startPos,
        dir,
        q: { re: 0, im: rayleighRange(w0, lambda) },
        depth: 0,
        samples: [{ x: startPos.x, y: startPos.y, hw: w0 }],
        hits: [],
      },
    ];

    let produced = 0;
    while (queue.length > 0 && produced < MAX_PATHS) {
      const state = queue.shift()!;
      produced += 1;
      let ended: TracedBeam['ended'] = 'limit';
      let guard = 0;

      while (guard < MAX_SEGMENTS) {
        guard += 1;
        const { pos, dir: d } = state;

        let bestT = Infinity;
        let bestEl: Element | null = null;
        for (const el of elements) {
          const a = { x: el.center.x - el.surface.x * el.half, y: el.center.y - el.surface.y * el.half };
          const b = { x: el.center.x + el.surface.x * el.half, y: el.center.y + el.surface.y * el.half };
          const t = raySegment(pos, d, a, b);
          if (t < bestT) {
            bestT = t;
            bestEl = el;
          }
        }

        const tEdge = rayRect(pos, d, rect);
        const stopT = bestEl ? Math.min(bestT, tEdge) : tEdge;

        // sample the straight run with the Gaussian envelope
        const advance = Math.min(stopT, 6000);
        if (!Number.isFinite(advance) || advance <= 0) {
          ended = 'limit';
          break;
        }
        for (const s of sampleDistances(state.q, advance)) {
          const qAt: Complex = { re: state.q.re + s, im: state.q.im };
          const hw = halfWidthFromQ(qAt, lambda);
          state.samples.push({
            x: pos.x + d.x * s,
            y: pos.y + d.y * s,
            hw: Number.isFinite(hw) ? hw : w0,
          });
        }
        state.q = { re: state.q.re + advance, im: state.q.im };

        if (!bestEl || bestT > tEdge) {
          ended = 'edge';
          break;
        }

        const hitPoint = { x: pos.x + d.x * bestT, y: pos.y + d.y * bestT };
        state.hits.push({ itemId: bestEl.id, role: bestEl.role, x: hitPoint.x, y: hitPoint.y });

        if (bestEl.role === 'detector') {
          ended = 'detector';
          break;
        }
        if (bestEl.role === 'blocker') {
          ended = 'blocker';
          break;
        }
        if (bestEl.role === 'mirror') {
          const n = { x: -bestEl.surface.y, y: bestEl.surface.x };
          state.dir = reflect(d, n);
          state.pos = { x: hitPoint.x + state.dir.x * EPS, y: hitPoint.y + state.dir.y * EPS };
          continue;
        }
        if (bestEl.role === 'lens') {
          state.q = applyLens(state.q, bestEl.focal);
          state.pos = { x: hitPoint.x + d.x * EPS, y: hitPoint.y + d.y * EPS };
          continue;
        }
        if (bestEl.role === 'splitter') {
          const n = { x: -bestEl.surface.y, y: bestEl.surface.x };
          const reflected = reflect(d, n);
          if (state.depth < MAX_DEPTH) {
            const startHw = halfWidthFromQ(state.q, lambda);
            queue.push({
              id: `${state.id}r${queue.length}`,
              sourceId: state.sourceId,
              pos: { x: hitPoint.x + reflected.x * EPS, y: hitPoint.y + reflected.y * EPS },
              dir: reflected,
              q: state.q,
              depth: state.depth + 1,
              samples: [{ x: hitPoint.x, y: hitPoint.y, hw: Number.isFinite(startHw) ? startHw : w0 }],
              hits: [...state.hits],
            });
          }
          state.pos = { x: hitPoint.x + d.x * EPS, y: hitPoint.y + d.y * EPS };
          continue;
        }
      }

      if (state.samples.length > 1) {
        beams.push({
          id: state.id,
          sourceId: state.sourceId,
          wavelength,
          color: wavelengthToColor(wavelength),
          opacity,
          diameter,
          samples: state.samples,
          hits: state.hits,
          ended,
        });
      }
    }
  }

  return beams;
}
