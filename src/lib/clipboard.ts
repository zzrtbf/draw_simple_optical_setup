import { useEditor } from '../store';
import { newId, type Beam, type Item } from '../model/types';

let clip: { items: Item[]; beams: Beam[] } | null = null;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function copySelection(): number {
  const st = useEditor.getState();
  const sel = new Set(st.selection);
  clip = {
    items: clone(st.project.items.filter((i) => sel.has(i.id))),
    beams: clone(st.project.beams.filter((b) => sel.has(b.id))),
  };
  return clip.items.length + clip.beams.length;
}

export function cutSelection(): number {
  const n = copySelection();
  useEditor.getState().deleteSelection();
  return n;
}

export function hasClipboard(): boolean {
  return !!clip && clip.items.length + clip.beams.length > 0;
}

export function pasteClipboard(offset = 25): string[] {
  if (!clip) return [];
  const st = useEditor.getState();
  st.pushHistory();
  const items: Item[] = clip.items.map((i) => ({
    ...clone(i),
    id: newId('i'),
    x: i.x + offset,
    y: i.y + offset,
    locked: false,
  }));
  const beams: Beam[] = clip.beams.map((b) => ({
    ...clone(b),
    id: newId('b'),
    x1: b.x1 + offset,
    y1: b.y1 + offset,
    x2: b.x2 + offset,
    y2: b.y2 + offset,
    locked: false,
  }));
  useEditor.setState((s) => ({
    project: { ...s.project, items: [...s.project.items, ...items], beams: [...s.project.beams, ...beams] },
  }));
  const ids = [...items.map((i) => i.id), ...beams.map((b) => b.id)];
  st.select(ids);
  return ids;
}
