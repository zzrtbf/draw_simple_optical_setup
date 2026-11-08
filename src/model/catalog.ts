import { LIBRARY } from '../generated/library';

export interface CatalogEntry {
  key: string;
  name: string;
  cat: CategoryId;
  /** search aliases */
  tags: string;
}

export type CategoryId =
  | 'sources'
  | 'mirrors'
  | 'lenses'
  | 'splitters'
  | 'polarization'
  | 'nonlinear'
  | 'modulators'
  | 'fiber'
  | 'detection'
  | 'electronics';

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'sources', label: 'Sources' },
  { id: 'mirrors', label: 'Mirrors' },
  { id: 'lenses', label: 'Lenses & Prisms' },
  { id: 'splitters', label: 'Beamsplitters' },
  { id: 'polarization', label: 'Polarization' },
  { id: 'nonlinear', label: 'Crystals & Cavities' },
  { id: 'modulators', label: 'Modulators' },
  { id: 'fiber', label: 'Fiber' },
  { id: 'detection', label: 'Detection' },
  { id: 'electronics', label: 'Electronics' },
];

/**
 * Display names for Franzen ComponentLibrary shapes. The `c-opa*` family is a
 * set of nonlinear-optics cavities drawn with different mirror / crystal
 * geometries (cc = curved-curved, fc = flat-curved, ff = flat-flat); the names
 * below are inferred from the artwork.
 */
const ENTRIES: CatalogEntry[] = [
  { key: 'c-laser1', name: 'Laser (red beam)', cat: 'sources', tags: 'laser hene source' },
  { key: 'c-laser2', name: 'Laser Head', cat: 'sources', tags: 'laser head source diode' },
  { key: 'c-diodegrn', name: 'Diode Laser (green)', cat: 'sources', tags: 'diode dpl source 532' },
  { key: 'c-opared', name: 'OPA Cavity (red)', cat: 'sources', tags: 'opa opo red source' },

  { key: 'b-mir', name: 'Mirror', cat: 'mirrors', tags: 'mirror flat' },
  { key: 'b-mirpzt', name: 'Mirror (piezo)', cat: 'mirrors', tags: 'mirror piezo pzt' },
  { key: 'b-mirc', name: 'Concave Mirror', cat: 'mirrors', tags: 'mirror curved concave' },
  { key: 'b-mircpzt', name: 'Concave Mirror (piezo)', cat: 'mirrors', tags: 'mirror curved piezo' },
  { key: 'c-mirpzt3ax', name: 'Mirror Mount (3-axis piezo)', cat: 'mirrors', tags: 'mirror piezo 3 axis' },
  { key: 'c-flip', name: 'Flip Mirror Mount', cat: 'mirrors', tags: 'flip mirror mount' },
  { key: 'b-dump', name: 'Beam Dump', cat: 'mirrors', tags: 'dump block absorber' },

  { key: 'b-lens1', name: 'Lens (plano-convex)', cat: 'lenses', tags: 'lens plano convex' },
  { key: 'b-lens2', name: 'Lens (biconvex)', cat: 'lenses', tags: 'lens biconvex focusing' },
  { key: 'b-lens3', name: 'Lens (biconcave)', cat: 'lenses', tags: 'lens biconcave diverging negative' },
  { key: 'x-objective', name: 'Objective Lens', cat: 'lenses', tags: 'objective microscope ob focus' },
  { key: 'b-phase', name: 'Wedge / Phase Plate', cat: 'lenses', tags: 'wedge prism phase' },
  { key: 'b-grat', name: 'Grating', cat: 'lenses', tags: 'grating dispersion' },

  { key: 'b-bsp', name: 'Beam Splitter (plate)', cat: 'splitters', tags: 'beam splitter plate bs' },
  { key: 'b-bspcube', name: 'Beam Splitter Cube', cat: 'splitters', tags: 'beam splitter cube bs' },
  { key: 'b-npro', name: 'Polarizing BS Cube', cat: 'splitters', tags: 'pbs polarizing cube beam splitter' },
  { key: 'b-diccube', name: 'Dichroic Cube', cat: 'splitters', tags: 'dichroic cube dm' },
  { key: 'b-dicgrn', name: 'Dichroic Mirror (green)', cat: 'splitters', tags: 'dichroic green dm' },
  { key: 'b-dicred', name: 'Dichroic Mirror (red)', cat: 'splitters', tags: 'dichroic red dm' },

  { key: 'b-wpred', name: 'Waveplate (red)', cat: 'polarization', tags: 'waveplate retarder hwp qwp red' },
  { key: 'b-wpyel', name: 'Waveplate (yellow)', cat: 'polarization', tags: 'waveplate retarder hwp qwp yellow' },
  { key: 'b-wpgn', name: 'Waveplate (green)', cat: 'polarization', tags: 'waveplate retarder hwp qwp green' },
  { key: 'c-isolator', name: 'Optical Isolator', cat: 'polarization', tags: 'isolator faraday' },
  { key: 'c-rotator', name: 'Rotary Mount', cat: 'polarization', tags: 'rotator mount rotation' },

  { key: 'b-crystalff', name: 'Crystal (FF)', cat: 'nonlinear', tags: 'crystal flat flat bbo' },
  { key: 'b-crystalfc', name: 'Crystal (FC)', cat: 'nonlinear', tags: 'crystal flat curved bbo' },
  { key: 'b-crystalcc', name: 'Crystal (CC)', cat: 'nonlinear', tags: 'crystal curved curved bbo' },
  { key: 'c-opaff', name: 'OPA Cavity (FF)', cat: 'nonlinear', tags: 'opa opo cavity resonator' },
  { key: 'c-opafc', name: 'OPA Cavity (FC)', cat: 'nonlinear', tags: 'opa opo cavity resonator' },
  { key: 'c-opacc', name: 'OPA Cavity (CC)', cat: 'nonlinear', tags: 'opa opo cavity resonator' },
  { key: 'c-opaffplates', name: 'OPA Cavity (FF, plates)', cat: 'nonlinear', tags: 'opa opo cavity plates' },
  { key: 'c-opacfplates', name: 'OPA Cavity (CF, plates)', cat: 'nonlinear', tags: 'opa opo cavity plates' },
  { key: 'c-opaccplates', name: 'OPA Cavity (CC, plates)', cat: 'nonlinear', tags: 'opa opo cavity plates' },
  { key: 'c-opakerr', name: 'Kerr Cell', cat: 'nonlinear', tags: 'kerr nonlinear cell' },
  { key: 'c-modeclean', name: 'Mode Cleaner Cavity', cat: 'nonlinear', tags: 'mode cleaner cavity ring' },
  { key: 'c-modecleanpzt', name: 'Mode Cleaner (piezo)', cat: 'nonlinear', tags: 'mode cleaner cavity piezo' },

  { key: 'c-aom', name: 'AOM', cat: 'modulators', tags: 'aom acousto optic modulator' },
  { key: 'c-eom1', name: 'EOM (transverse)', cat: 'modulators', tags: 'eom electro optic modulator pockels' },
  { key: 'c-eom2', name: 'EOM (crystal)', cat: 'modulators', tags: 'eom electro optic modulator crystal' },

  { key: 'c-fiber', name: 'Optical Fiber', cat: 'fiber', tags: 'fiber patchcord' },
  { key: 'c-fibercoupl', name: 'Fiber Coupler', cat: 'fiber', tags: 'fiber coupler' },
  { key: 'b-coupler', name: 'Fiber Coupler Mount', cat: 'fiber', tags: 'fiber coupler mount' },

  { key: 'e-pd1', name: 'Photodetector', cat: 'detection', tags: 'photodiode pd detector' },
  { key: 'e-pd2', name: 'Photodetector (round)', cat: 'detection', tags: 'photodiode pd detector' },
  { key: 'e-pdgrn1', name: 'Photodetector (green)', cat: 'detection', tags: 'photodiode pd detector' },
  { key: 'e-pdgrn2', name: 'Photodetector (green, round)', cat: 'detection', tags: 'photodiode pd detector' },
  { key: 'e-qpd', name: 'Quadrant Photodetector', cat: 'detection', tags: 'qpd quadrant detector' },
  { key: 'e-spekki', name: 'Spectrum Analyser', cat: 'detection', tags: 'spectrum analyser spekki' },

  { key: 'e-amp', name: 'Amplifier', cat: 'electronics', tags: 'amp amplifier' },
  { key: 'e-hvampleft', name: 'HV Amplifier (left)', cat: 'electronics', tags: 'hv amplifier high voltage' },
  { key: 'e-hvampright', name: 'HV Amplifier (right)', cat: 'electronics', tags: 'hv amplifier high voltage' },
  { key: 'e-diff', name: 'Differentiator', cat: 'electronics', tags: 'diff differentiator' },
  { key: 'e-sum', name: 'Sum Amplifier', cat: 'electronics', tags: 'sum adder' },
  { key: 'e-sumdiff', name: 'Sum / Difference Amp', cat: 'electronics', tags: 'sum difference amp' },
  { key: 'e-mix', name: 'Mixer', cat: 'electronics', tags: 'mixer rf' },
  { key: 'e-frq1', name: 'Function Generator (sine)', cat: 'electronics', tags: 'function generator sine frq' },
  { key: 'e-frq2', name: 'Function Generator (ramp)', cat: 'electronics', tags: 'function generator ramp saw frq' },
  { key: 'e-hipass', name: 'High-pass Filter', cat: 'electronics', tags: 'high pass filter' },
  { key: 'e-lopass', name: 'Low-pass Filter', cat: 'electronics', tags: 'low pass filter' },
  { key: 'e-servoleft', name: 'Servo Controller (left)', cat: 'electronics', tags: 'servo controller pid' },
  { key: 'e-servoright', name: 'Servo Controller (right)', cat: 'electronics', tags: 'servo controller pid' },
  { key: 'e-computer', name: 'Computer / DAQ', cat: 'electronics', tags: 'computer daq pc' },
];

export interface CatalogItem extends CatalogEntry {
  w: number;
  h: number;
}

export const CATALOG: CatalogItem[] = ENTRIES.filter((e) => LIBRARY[e.key]).map((e) => ({
  ...e,
  w: LIBRARY[e.key].w,
  h: LIBRARY[e.key].h,
}));

export const CATALOG_BY_KEY = new Map(CATALOG.map((c) => [c.key, c]));

/** Shapes present in the artwork but not listed above (kept reachable by search). */
export const EXTRA_KEYS = Object.keys(LIBRARY).filter((k) => !CATALOG_BY_KEY.has(k));
