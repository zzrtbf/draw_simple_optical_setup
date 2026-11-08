/**
 * What each library part *is*, optically.
 *
 * The artwork in the component library has a consistent local orientation:
 * mirrors, lenses and detectors are drawn as vertical faces (surface along local
 * +y, optical axis along local +x), beamsplitters are drawn as squares with a
 * diagonal coating, and sources emit along local +x. Item rotation then aims the
 * part, so "rotate the mirror 45°" gives the familiar 90° fold.
 *
 * Parts that are not in this table are optically transparent: a beam passes
 * straight through them. That keeps the drawing readable when a mount happens to
 * sit on top of the path; use a Beam Dump to actually block a beam.
 */

export type OpticRole =
  | 'source'
  | 'coupler'
  | 'mirror'
  | 'lens'
  | 'splitter'
  | 'detector'
  | 'blocker';

export interface OpticSpec {
  role: OpticRole;
  /** direction of the active face in local coords, deg (0 = +x, y down, clockwise) */
  surfaceDeg: number;
  /** direction the part emits along, deg (sources only) */
  emitDeg?: number;
  /** default collimated beam diameter, mm (sources only) */
  dia?: number;
  /** default wavelength, nm (sources only) */
  wavelength?: number;
  /** default focal length, mm; positive converges (lenses only) */
  focal?: number;
  /** default split ratio transmitted / (transmitted + reflected) (splitters only) */
  split?: number;
}

const MIRROR: OpticSpec = { role: 'mirror', surfaceDeg: 90 };

export const OPTICS: Record<string, OpticSpec> = {
  /* ---- sources: emit a collimated beam along local +x ---- */
  'c-laser1': { role: 'source', surfaceDeg: 90, emitDeg: 0, dia: 2, wavelength: 633 },
  'c-laser2': { role: 'source', surfaceDeg: 90, emitDeg: 0, dia: 2, wavelength: 633 },
  'c-diodegrn': { role: 'source', surfaceDeg: 90, emitDeg: 0, dia: 1.5, wavelength: 532 },
  /* Fiber coupler mount: a collimator when emitting, a coupler when receiving */
  'b-coupler': { role: 'coupler', surfaceDeg: 90, emitDeg: 0, dia: 2, wavelength: 633 },
  'c-fibercoupl': { role: 'coupler', surfaceDeg: 90, emitDeg: 0, dia: 2, wavelength: 1064 },

  /* ---- mirrors: flat reflecting face along local y ---- */
  'b-mir': MIRROR,
  'b-mirpzt': MIRROR,
  'b-mirc': MIRROR,
  'b-mircpzt': MIRROR,
  'c-mirpzt3ax': MIRROR,
  'c-flip': MIRROR,

  /* ---- lenses: thin, surface along local y ---- */
  'b-lens1': { role: 'lens', surfaceDeg: 90, focal: 150 },
  'b-lens2': { role: 'lens', surfaceDeg: 90, focal: 100 },
  'b-lens3': { role: 'lens', surfaceDeg: 90, focal: -100 },
  'x-objective': { role: 'lens', surfaceDeg: 90, focal: 18 },

  /* ---- beamsplitters: coating along the drawn diagonal ---- */
  // b-bsp / b-diccube: diagonal from the top-left corner to the bottom-right one
  'b-bsp': { role: 'splitter', surfaceDeg: 45, split: 0.5 },
  'b-diccube': { role: 'splitter', surfaceDeg: 45, split: 0.5 },
  // b-npro: diagonal from the bottom-left corner to the top-right one
  'b-npro': { role: 'splitter', surfaceDeg: -45, split: 0.5 },
  // b-bspcube is drawn as a plain upright plate, so its face is vertical
  'b-bspcube': { role: 'splitter', surfaceDeg: 90, split: 0.5 },

  /* ---- detectors: absorb where they are hit ---- */
  'e-pd1': { role: 'detector', surfaceDeg: 90 },
  'e-pd2': { role: 'detector', surfaceDeg: 90 },
  'e-pdgrn1': { role: 'detector', surfaceDeg: 90 },
  'e-pdgrn2': { role: 'detector', surfaceDeg: 90 },
  'e-qpd': { role: 'detector', surfaceDeg: 90 },
  'e-spekki': { role: 'detector', surfaceDeg: 90 },

  /* ---- blockers ---- */
  'b-dump': { role: 'blocker', surfaceDeg: 90 },
};

export function opticSpec(lib: string | undefined): OpticSpec | null {
  if (!lib) return null;
  return OPTICS[lib] ?? null;
}

/** Roles whose parts carry an on/off switch and wavelength settings. */
export function isEmitter(role: OpticRole | undefined): boolean {
  return role === 'source' || role === 'coupler';
}
