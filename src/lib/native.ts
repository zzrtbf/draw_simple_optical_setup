/**
 * Bridge to a native shell (see `macos/`; a Windows shell would implement the same ops).
 *
 * In a browser `window.__ob` does not exist and every helper here reports
 * "not native", so the ordinary web code paths stay in charge. Nothing in this
 * module imports the editor, which keeps it usable from the store.
 */

export interface NativeReply {
  ok?: boolean;
  cancelled?: boolean;
  error?: string;
  path?: string;
  name?: string;
  text?: string | null;
}

interface ObBridge {
  version: string;
  call: (op: string, args?: Record<string, unknown>) => Promise<NativeReply>;
}

declare global {
  interface Window {
    __ob?: ObBridge;
    /** Set by the native shell's menu: true when a text field has focus. */
    __obMenuActive?: () => boolean;
    /** Called by the native shell's Edit menu when the canvas has focus. */
    __obMenu?: (operation: string) => void;
    /** Called by the shell right before quitting. */
    __obFlush?: () => void;
  }
}

export function nativeBridge(): ObBridge | null {
  if (typeof window === 'undefined') return null;
  return window.__ob ?? null;
}

/** True when running inside the packaged macOS app. */
export function isNativeApp(): boolean {
  return nativeBridge() !== null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function kindOf(filename: string): 'png' | 'svg' | 'json' | 'text' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.svg')) return 'svg';
  if (lower.endsWith('.json')) return 'json';
  return 'text';
}

/**
 * Save a blob through the native save panel.
 * Resolves false when the user cancelled; always false in a browser.
 */
export async function nativeSaveBlob(blob: Blob, filename: string): Promise<boolean> {
  const bridge = nativeBridge();
  if (!bridge) return false;
  const kind = kindOf(filename);
  const data = kind === 'png' ? await blobToBase64(blob) : await blob.text();
  const reply = await bridge.call('saveFile', { name: filename, kind, data });
  return reply.ok === true;
}

export async function nativeOpenProjectFile(): Promise<{ name: string; text: string } | null> {
  const bridge = nativeBridge();
  if (!bridge) return null;
  const reply = await bridge.call('openFile');
  if (reply.ok === true && typeof reply.text === 'string') {
    return { name: reply.name ?? 'project.osopt.json', text: reply.text };
  }
  return null;
}

/** Read the native autosave file (Application Support). Null when absent. */
export async function nativeReadAutosave(): Promise<string | null> {
  const bridge = nativeBridge();
  if (!bridge) return null;
  try {
    const reply = await bridge.call('readAutosave');
    return typeof reply.text === 'string' ? reply.text : null;
  } catch {
    return null;
  }
}

export async function nativeWriteAutosave(text: string): Promise<void> {
  const bridge = nativeBridge();
  if (!bridge) return;
  try {
    await bridge.call('writeAutosave', { text });
  } catch {
    /* the file layer never throws; ignore a lost autosave rather than nag */
  }
}

export async function nativeCopyImage(blob: Blob): Promise<boolean> {
  const bridge = nativeBridge();
  if (!bridge) return false;
  try {
    const reply = await bridge.call('copyImage', { data: await blobToBase64(blob) });
    return reply.ok === true;
  } catch {
    return false;
  }
}
