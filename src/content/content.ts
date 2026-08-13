/**
 * Content script — intentionally minimal and polite.
 * Adds one power-user shortcut to every page: Alt+Shift+T opens a fresh
 * HyprTab. That's all. No overlays, no DOM surgery, no tracking.
 */
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.altKey && e.shiftKey && (e.key === 'T' || e.code === 'KeyT')) {
    e.preventDefault();
    try {
      chrome.runtime.sendMessage({ type: 'hypertab:open' }, () => {
        // ignore response; if the worker is asleep the tab still opens
        void chrome.runtime.lastError;
      });
    } catch {
      /* extension context invalidated (reload) — ignore */
    }
  }
});
