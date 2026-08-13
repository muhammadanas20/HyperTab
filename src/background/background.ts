/**
 * Background service worker — deliberately tiny.
 *  • seeds default settings on install
 *  • adds a context-menu shortcut for opening a HyprTab
 *  • answers lightweight pings from the content script
 */
import { SETTINGS_KEY, DEFAULT_SETTINGS } from '../settings/schema';

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    try {
      const stored = await chrome.storage.sync.get(SETTINGS_KEY);
      if (!stored[SETTINGS_KEY]) {
        await chrome.storage.sync.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
      }
    } catch (err) {
      console.warn('[hypertab] could not seed settings', err);
    }

    if (details.reason === 'install') {
      // gentle first-run: open a tab so the user meets the webhead
      void chrome.tabs.create({});
    }
  })();
});

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: 'hypertab-open',
      title: 'Open a HyprTab',
      contexts: ['page', 'frame'],
    });
  } catch {
    /* menu may already exist — harmless */
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'hypertab-open') {
    void chrome.tabs.create({});
  }
});

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if (typeof msg === 'object' && msg !== null && (msg as { type?: string }).type === 'hypertab:open') {
    void chrome.tabs.create({});
    sendResponse({ ok: true });
  }
  return false;
});
