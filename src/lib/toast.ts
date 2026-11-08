export function toast(msg: string, kind: 'info' | 'error' = 'info') {
  window.dispatchEvent(new CustomEvent('ob-toast', { detail: { msg, kind } }));
}
