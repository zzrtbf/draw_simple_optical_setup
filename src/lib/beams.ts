import type { Beam, Item, LibItem, Project } from '../model/types';

/**
 * A baked ("converted to hand-drawn") beam belongs to one source. While that
 * source is back in auto mode its snapshot is kept but hidden, so the two
 * modes can be flipped back and forth without duplicating the light.
 */
export function isBeamHidden(beam: Beam, items: Item[]): boolean {
  if (!beam.bakedFrom) return false;
  const src = items.find((i) => i.id === beam.bakedFrom);
  return !!src && src.kind === 'lib' && (src as LibItem).autoBeams !== false;
}

/** Beams that should be drawn, counted and exported right now. */
export function visibleBeams(project: Project): Beam[] {
  return project.beams.filter((b) => !isBeamHidden(b, project.items));
}
