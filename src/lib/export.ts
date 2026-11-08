import type { Beam, Item, Project } from '../model/types';
import { adaptInk, bboxOfPoints, itemCorners, unionBBox, type BBox } from './geom';
import { nativeBridge, nativeSaveBlob } from './native';

export interface ExportOptions {
  /** raster resolution, pixels per mm */
  scale: number;
  margin: number;
  background: 'dark' | 'white' | 'transparent';
  withGrid: boolean;
  selectionOnly: boolean;
  selection: string[];
}

function beamBox(b: Beam): BBox {
  const pad = Math.max(b.w1, b.w2) / 2;
  const pts = [
    { x: b.x1, y: b.y1 },
    { x: b.x2, y: b.y2 },
  ];
  const bb = bboxOfPoints(pts);
  return { minX: bb.minX - pad, minY: bb.minY - pad, maxX: bb.maxX + pad, maxY: bb.maxY + pad };
}

export function contentBBox(project: Project, opts: ExportOptions): BBox {
  const sel = new Set(opts.selection);
  const items: Item[] = opts.selectionOnly
    ? project.items.filter((i) => sel.has(i.id))
    : project.items;
  const beams: Beam[] = opts.selectionOnly ? project.beams.filter((b) => sel.has(b.id)) : project.beams;

  let box: BBox | null = null;
  for (const it of items) box = unionBBox(box, bboxOfPoints(itemCorners(it)));
  for (const b of beams) box = unionBBox(box, beamBox(b));
  if (!opts.selectionOnly && project.board.mode === 'plate') {
    box = unionBBox(box, { minX: 0, minY: 0, maxX: project.board.w, maxY: project.board.h });
  }
  if (!box || !Number.isFinite(box.minX)) box = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  const m = opts.margin;
  return {
    minX: box.minX - m,
    minY: box.minY - m,
    maxX: box.maxX + m,
    maxY: box.maxY + m,
  };
}

const BG_FILL: Record<ExportOptions['background'], string> = {
  dark: '#080b10',
  white: '#ffffff',
  transparent: 'none',
};

/**
 * Clones the live stage SVG, strips editor chrome and returns a standalone
 * document. When `scale` is given the root gets pixel dimensions so that a
 * rasterizer renders it at that resolution.
 */
export function buildExportSVG(
  source: SVGSVGElement,
  project: Project,
  opts: ExportOptions,
  scale?: number,
): { text: string; box: BBox } {
  const box = contentBBox(project, opts);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;

  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-ui]').forEach((n) => n.remove());
  if (!opts.withGrid) clone.querySelectorAll('[data-board-grid]').forEach((n) => n.remove());
  const world = clone.querySelector('[data-world]');
  if (world) world.setAttribute('transform', '');
  clone.querySelectorAll('[data-grid-dot]').forEach((n) => n.setAttribute('r', '0.4'));

  if (opts.background === 'white') {
    clone.querySelectorAll('[data-board-bg]').forEach((n) => {
      n.setAttribute('fill', '#f3f7fb');
      n.setAttribute('stroke', '#c3d0de');
    });
    clone.querySelectorAll('[data-grid-dot]').forEach((n) => n.setAttribute('fill', '#a9b9c9'));
    clone.querySelectorAll('[data-origin]').forEach((n) => n.setAttribute('stroke', '#88b3aa'));
    // ink chosen for a dark bench has to flip for paper
    clone.querySelectorAll('[data-ink]').forEach((n) => {
      const ink = n.getAttribute('data-ink');
      if (ink) n.setAttribute('fill', adaptInk(ink, 'light'));
      if (n.hasAttribute('stroke')) n.setAttribute('stroke', 'rgba(255,255,255,0.9)');
    });
  }

  // background
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', String(box.minX));
  bg.setAttribute('y', String(box.minY));
  bg.setAttribute('width', String(w));
  bg.setAttribute('height', String(h));
  bg.setAttribute('fill', BG_FILL[opts.background]);
  clone.insertBefore(bg, clone.firstChild);

  // editor bookkeeping does not belong in the output
  const scratch = new Set([
    'data-ink',
    'data-label',
    'data-grid-dot',
    'data-board-bg',
    'data-board-grid',
    'data-origin',
    'data-world',
    'data-stage',
    'data-auto-beams',
    'data-auto-beam',
    'data-wavelength',
  ]);
  clone.querySelectorAll('*').forEach((n) => {
    for (const name of Array.from(n.getAttributeNames())) {
      if (scratch.has(name)) n.removeAttribute(name);
    }
  });

  clone.setAttribute('viewBox', `${box.minX} ${box.minY} ${w} ${h}`);
  if (scale && Number.isFinite(scale)) {
    clone.setAttribute('width', String(Math.round(w * scale)));
    clone.setAttribute('height', String(Math.round(h * scale)));
  } else {
    clone.setAttribute('width', `${round2(w)}mm`);
    clone.setAttribute('height', `${round2(h)}mm`);
  }
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const text = new XMLSerializer().serializeToString(clone);
  return { text: `<?xml version="1.0" encoding="UTF-8"?>\n${text}`, box };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function svgTextToBlobUrl(text: string): string {
  return URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not rasterise the drawing.'));
    img.src = url;
  });
}

export async function svgToPngBlob(
  svgText: string,
  widthPx: number,
  heightPx: number,
): Promise<Blob> {
  const url = svgTextToBlobUrl(svgText);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(widthPx));
    canvas.height = Math.max(1, Math.round(heightPx));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Hand a finished file to the user: a native save panel inside the packaged
 * app, an ordinary download in a browser. Resolves false when the user
 * cancelled a native save.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<boolean> {
  if (nativeBridge()) return nativeSaveBlob(blob, filename);

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

export function safeName(name: string): string {
  return (name || 'optical-setup').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'optical-setup';
}
