import { opticSpec } from '../lib/opticsMap';

/**
 * Scene model. All dimensions are millimetres, all angles degrees, y axis points down
 * (SVG convention). z is reserved for the future Blender hand-off: height above the
 * table surface, table at z = 0.
 */

export type Kind = 'lib' | 'box' | 'text';

export interface ItemBase {
  id: string;
  kind: Kind;
  /** centre of the footprint, mm */
  x: number;
  y: number;
  /** rotation about the centre, degrees, clockwise on screen */
  rot: number;
  label: string;
  showLabel: boolean;
  /** explicit label anchor, offset from the centre in world mm. null = auto below the part. */
  labelOffset: { x: number; y: number } | null;
  locked: boolean;
  /** participates in the collision check */
  collide: boolean;
  /** snap this part to the hole grid while dragging */
  snap: boolean;
  /** optical axis height above the table, mm (3D hand-off) */
  z: number;
}

export interface LibItem extends ItemBase {
  kind: 'lib';
  /** key into LIBRARY */
  lib: string;
  w: number;
  h: number;
  /** 3D model resource id, unused for now */
  model3d?: string | null;

  /* --- optics (only meaningful for parts that appear in lib/opticsMap.ts) --- */
  /** emit light (sources and fiber couplers) */
  emit?: boolean;
  /** vacuum wavelength, nm */
  wavelength?: number;
  /** collimated output diameter, mm */
  beamDia?: number;
  /** drawn opacity of the generated beams, 0..1 */
  beamOpacity?: number;
  /** fiber coupler: collimator (out) or coupler (in) */
  couplerMode?: 'out' | 'in';
  /** thin-lens focal length, mm; positive converges */
  focal?: number;
  /** splitter: fraction transmitted */
  split?: number;
}

export interface BoxItem extends ItemBase {
  kind: 'box';
  w: number;
  h: number;
  color: string;
  radius: number;
}

export interface TextItem extends ItemBase {
  kind: 'text';
  text: string;
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
}

export type Item = LibItem | BoxItem | TextItem;

export interface Beam {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** diameter at the start / end, mm. w1 !== w2 gives a diverging or converging beam */
  w1: number;
  w2: number;
  /** vacuum wavelength, nm. When set, the colour follows it. */
  wavelength?: number;
  color: string;
  opacity: number;
  label: string;
  showLabel: boolean;
  locked: boolean;
  /** snap the endpoints to the hole grid */
  snap: boolean;
  z: number;
}

export type Theme = 'dark' | 'light';

export interface Board {
  mode: 'infinite' | 'plate';
  /** plate size, mm (only used when mode === 'plate') */
  w: number;
  h: number;
  showGrid: boolean;
  /** hole pitch, mm */
  pitch: number;
  /** drawing background: dark bench or paper white */
  theme: Theme;
  /** draw the automatically traced beams */
  showAutoBeams?: boolean;
}

export interface Project {
  schema: 'optical-setup/1';
  name: string;
  board: Board;
  items: Item[];
  beams: Beam[];
}

export const BEAM_COLORS = [
  { name: 'HeNe 633', hex: '#ff2f4a' },
  { name: 'Nd:YAG 532', hex: '#2bff9c' },
  { name: 'Ti:S 800', hex: '#ff4fd8' },
  { name: 'Diode 405', hex: '#8a5bff' },
  { name: 'Diode 461', hex: '#3d86ff' },
  { name: 'Ruby 694', hex: '#ff5a1f' },
  { name: 'Er 1550', hex: '#ffc23d' },
  { name: 'White', hex: '#e8f4ff' },
];

export const BOX_COLORS = [
  '#38e1c4',
  '#4da3ff',
  '#ff5b76',
  '#ffc23d',
  '#b07cff',
  '#8fa3b8',
];

export function isText(it: Item): it is TextItem {
  return it.kind === 'text';
}

export function hasSize(it: Item): it is LibItem | BoxItem {
  return it.kind !== 'text';
}

let counter = 0;
export function newId(prefix = 'o'): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36).slice(-4)}${counter.toString(36)}`;
}

export function emptyProject(): Project {
  return {
    schema: 'optical-setup/1',
    name: 'Untitled setup',
    board: { mode: 'plate', w: 600, h: 450, showGrid: true, pitch: 25, theme: 'dark', showAutoBeams: true },
    items: [],
    beams: [],
  };
}

/** Fill in fields added after v1.0 so old autosaves and project files keep loading. */
export function normalizeProject(p: Project): Project {
  const board = { ...p.board } as Board;
  if (board.theme === undefined) board.theme = 'dark';
  if (board.pitch === undefined) board.pitch = 25;
  if (board.showGrid === undefined) board.showGrid = true;
  if (board.showAutoBeams === undefined) board.showAutoBeams = true;

  const items = p.items.map((it) => {
    const o = { ...it } as Item & Record<string, unknown>;
    if (o.snap === undefined) o.snap = true;
    if (o.labelOffset === undefined) o.labelOffset = null;
    if (o.collide === undefined) o.collide = it.kind !== 'text';
    if (o.showLabel === undefined) o.showLabel = false;
    if (o.locked === undefined) o.locked = false;
    if (o.z === undefined) o.z = 25.4;
    if (it.kind === 'lib') {
      const spec = opticSpec(it.lib);
      if (spec && (spec.role === 'source' || spec.role === 'coupler')) {
        if (o.emit === undefined) o.emit = true;
        if (o.wavelength === undefined) o.wavelength = spec.wavelength ?? 633;
        if (o.beamDia === undefined) o.beamDia = spec.dia ?? 2;
        if (o.beamOpacity === undefined) o.beamOpacity = 0.9;
        if (spec.role === 'coupler' && o.couplerMode === undefined) o.couplerMode = 'out';
      }
      if (spec?.role === 'lens' && o.focal === undefined) o.focal = spec.focal ?? 100;
      if (spec?.role === 'splitter' && o.split === undefined) o.split = spec.split ?? 0.5;
    }
    return o as Item;
  });

  const beams = p.beams.map((b) => {
    const o = { ...b } as Beam & Record<string, unknown>;
    if (o.snap === undefined) o.snap = true;
    if (o.locked === undefined) o.locked = false;
    if (o.showLabel === undefined) o.showLabel = false;
    if (o.opacity === undefined) o.opacity = 1;
    return o as Beam;
  });

  return { ...p, board, items, beams };
}

export const BOARD_PRESETS = [
  { label: '300 × 300', w: 300, h: 300 },
  { label: '450 × 300', w: 450, h: 300 },
  { label: '600 × 450', w: 600, h: 450 },
  { label: '900 × 600', w: 900, h: 600 },
  { label: '1200 × 900', w: 1200, h: 900 },
  { label: '1500 × 1200', w: 1500, h: 1200 },
];
