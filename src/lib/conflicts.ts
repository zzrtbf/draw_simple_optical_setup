import { useMemo } from 'react';
import { useEditor } from '../store';
import { itemCorners, polyOverlap } from './geom';
import type { Item } from '../model/types';

const cache = new WeakMap<Item[], Set<string>>();

export function computeConflicts(items: Item[]): Set<string> {
  const hit = cache.get(items);
  if (hit) return hit;
  const solid = items.filter((i) => i.collide && i.kind !== 'text');
  const polys = solid.map((i) => ({ id: i.id, poly: itemCorners(i) }));
  const bad = new Set<string>();
  for (let a = 0; a < polys.length; a++) {
    for (let b = a + 1; b < polys.length; b++) {
      if (polyOverlap(polys[a].poly, polys[b].poly)) {
        bad.add(polys[a].id);
        bad.add(polys[b].id);
      }
    }
  }
  cache.set(items, bad);
  return bad;
}

export function useConflictIds(): Set<string> {
  const items = useEditor((s) => s.project.items);
  return useMemo(() => computeConflicts(items), [items]);
}
