import type { Project } from '../model/types';
import { normalizeProject } from '../model/types';
import { safeName } from './export';
import { nativeBridge, nativeOpenProjectFile } from './native';

interface SaveFilePicker {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
type SavePickerWindow = Window & {
  showSaveFilePicker?: (o: SaveFilePicker) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (o: {
    types?: { description: string; accept: Record<string, string[]> }[];
    multiple?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
};

const JSON_TYPES = [
  { description: 'Optical Bench project', accept: { 'application/json': ['.osopt.json', '.json'] } },
];

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 1);
}

export function parseProject(text: string): Project {
  const p = JSON.parse(text) as Project;
  if (!p || p.schema !== 'optical-setup/1' || !Array.isArray(p.items) || !Array.isArray(p.beams)) {
    throw new Error('Not an Optical Bench project file.');
  }
  if (!p.board || !p.board.mode) {
    p.board = { mode: 'plate', w: 600, h: 450, showGrid: true, pitch: 25, theme: 'dark' };
  }
  return normalizeProject(p);
}

/**
 * Save through the File System Access API when available, otherwise download.
 *
 * Returns what actually happened so the caller can word its toast correctly:
 * `'saved'` = written through a native save dialog, `'downloaded'` = the file
 * landed in the browser's download folder (Safari and Firefox have no save
 * dialog API), `'cancelled'` = the user dismissed the dialog.
 */
export type SaveResult = 'saved' | 'downloaded' | 'cancelled';

export async function saveProjectFile(project: Project, suggestedName: string): Promise<SaveResult> {
  const text = serializeProject(project);
  const w = window as unknown as SavePickerWindow;
  const name = `${safeName(suggestedName)}.osopt.json`;

  // Packaged app: real NSSavePanel, no download folder involved.
  const bridge = nativeBridge();
  if (bridge) {
    const reply = await bridge.call('saveFile', { name, kind: 'json', data: text });
    return reply.ok === true ? 'saved' : 'cancelled';
  }

  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: name, types: JSON_TYPES });
      const stream = await (
        handle as unknown as { createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }
      ).createWritable();
      await stream.write(text);
      await stream.close();
      return 'saved';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      /* fall through to download */
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  // WebKit ignores a click on a detached anchor, so put it in the document.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return 'downloaded';
}

export async function openProjectFile(): Promise<{ project: Project; name: string } | null> {
  // Packaged app: native open panel.
  if (nativeBridge()) {
    const picked = await nativeOpenProjectFile();
    if (!picked) return null;
    try {
      return { project: parseProject(picked.text), name: picked.name };
    } catch (e) {
      alert(`Could not open file: ${(e as Error).message}`);
      return null;
    }
  }

  const w = window as unknown as SavePickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: JSON_TYPES, multiple: false });
      const file = await handle.getFile();
      return { project: parseProject(await file.text()), name: file.name };
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return null;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve({ project: parseProject(await file.text()), name: file.name });
      } catch (e) {
        alert(`Could not open file: ${(e as Error).message}`);
        resolve(null);
      }
    };
    input.click();
  });
}

/**
 * 3D hand-off stub. The schema is fixed now so the Blender side can be written
 * later without touching the editor.
 */
export function buildScene3D(project: Project) {
  return {
    schema: 'optical-bench/scene3d/1',
    unit: 'mm',
    axes: { x: 'table right', y: 'table down (screen)', z: 'up from table surface' },
    table: {
      mode: project.board.mode,
      width: project.board.w,
      height: project.board.h,
      holePitch: project.board.pitch,
    },
    resources: [] as { id: string; file: string; size: [number, number, number] }[],
    items: project.items.map((it) => ({
      id: it.id,
      kind: it.kind,
      source: it.kind === 'lib' ? it.lib : it.kind,
      position: [it.x, it.y, it.z],
      rotationDeg: it.rot,
      size: it.kind === 'text' ? null : [it.w, it.h, null],
      model3d: it.kind === 'lib' ? (it.model3d ?? null) : null,
      label: it.kind === 'text' ? it.text : it.label,
    })),
    beams: project.beams.map((b) => ({
      id: b.id,
      a: [b.x1, b.y1, b.z],
      b: [b.x2, b.y2, b.z],
      diameterA: b.w1,
      diameterB: b.w2,
      color: b.color,
      opacity: b.opacity,
    })),
  };
}
