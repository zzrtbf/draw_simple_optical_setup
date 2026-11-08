/**
 * Platform helpers.
 *
 * The editor runs on Windows (Ctrl) and macOS (Cmd). Everything that has to
 * look or behave differently per platform goes through this module so the
 * shortcut hints can never drift out of sync with the handlers.
 */

function ua(): string {
  return typeof navigator === 'undefined' ? '' : `${navigator.platform} ${navigator.userAgent}`;
}

/** True on macOS / iPadOS. `navigator.platform` is "MacIntel" even on Apple Silicon. */
export const IS_MAC = /Mac|iPhone|iPad/.test(ua());

/**
 * Renders a key chord the way the platform writes it:
 *   chord('Z')        -> "⌘Z"      / "Ctrl+Z"
 *   chord('Shift+Z')  -> "⇧⌘Z"     / "Ctrl+Shift+Z"
 *   chord('S')        -> "⌘S"      / "Ctrl+S"
 */
export function chord(keys: string): string {
  const shift = /^shift\+/i.test(keys);
  const key = keys.replace(/^shift\+/i, '');
  if (IS_MAC) return `${shift ? '⇧' : ''}⌘${key}`;
  return `Ctrl+${shift ? 'Shift+' : ''}${key}`;
}
