/**
 * Quick-links bar (top-left) — favourite sites as glass tiles.
 *
 * Sources, merged & de-duplicated:
 *  1. the curated/user shortcuts from settings, and
 *  2. (default ON) the browser's own bookmarks — every http(s) leaf in
 *     the bookmark bar / other-bookmarks folders is imported live, so a
 *     fresh profile immediately shows *your* links.
 *
 * Icon resolution is a three-step "best available" chain:
 *  1. Chrome's built-in `_favicon` cache (crisp, offline-friendly),
 *  2. Google's public favicon service for the domain (a web lookup),
 *  3. a generated monogram tile — a gradient hashed from the domain with
 *     the site's initial, so even an icon-less bookmark gets a fitted icon.
 *
 * Clicks are counted locally; tiles can sort by usage.
 */
import type { Settings, Shortcut } from '../types';
import { LINK_USAGE_KEY } from '../settings/schema';
import { $, el } from '../utils/helpers';

const MAX_TILES = 18;
// Resolve by destination, never by user-editable title/id.
const LOCAL_ICONS: Record<string, string> = {
  'github.com':'github', 'web.whatsapp.com':'whatsapp', 'gemini.google.com':'gemini',
  'arena.ai':'arena', 'chatgpt.com':'chatgpt', 'chat.openai.com':'chatgpt',
  'leetcode.com':'leetcode', 'mail.google.com':'gmail', 'youtube.com':'youtube',
  'claude.ai':'claude', 'neetcode.io':'neetcode', 'open.spotify.com':'spotify',
};

export class LinksWidget {
  private settings: Settings;
  private usage = new Map<string, number>();
  private root: HTMLElement;
  private bookmarks: Shortcut[] = [];

  constructor(settings: Settings) {
    this.settings = settings;
    this.root = $('#links');
    void this.loadUsage().then(() => this.render());
    if (chrome.bookmarks) {
      const refresh = (): void => void this.refreshBookmarks();
      chrome.bookmarks.onCreated?.addListener(refresh);
      chrome.bookmarks.onRemoved?.addListener(refresh);
      chrome.bookmarks.onChanged?.addListener(refresh);
      chrome.bookmarks.onMoved?.addListener(refresh);
    }
  }

  updateSettings(s: Settings): void {
    this.settings = s;
    void this.refreshBookmarks();
  }

  /* ---------------------------------------------------------------- */
  /* Bookmark import                                                   */
  /* ---------------------------------------------------------------- */

  private async refreshBookmarks(): Promise<void> {
    const want = this.settings.importBookmarks && !!chrome.bookmarks;
    if (!want) {
      this.bookmarks = [];
      this.render();
      return;
    }
    try {
      const tree = await chrome.bookmarks.getTree();
      const found: Shortcut[] = [];
      const walk = (node: chrome.bookmarks.BookmarkTreeNode): void => {
        if (node.url && /^https?:/i.test(node.url)) {
          found.push({
            id: `bm-${node.id}`,
            title: node.title || new URL(node.url).hostname.replace(/^www\./, ''),
            url: node.url,
            enabled: true,
          });
        }
        for (const child of node.children ?? []) walk(child);
      };
      for (const root of tree) {
        // skip the mobile folder; bar + other + managed are what people use
        for (const child of root.children ?? []) {
          if (child.title === 'Mobile bookmarks') continue;
          walk(child);
        }
      }
      this.bookmarks = found.slice(0, MAX_TILES);
    } catch {
      this.bookmarks = [];
    }
    this.render();
  }

  /* ---------------------------------------------------------------- */
  /* Usage bookkeeping                                                 */
  /* ---------------------------------------------------------------- */

  private async loadUsage(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(LINK_USAGE_KEY);
      const map = stored[LINK_USAGE_KEY] as Record<string, number> | undefined;
      if (map) this.usage = new Map(Object.entries(map));
    } catch {
      /* counts are a nice-to-have */
    }
    if (this.settings.importBookmarks) void this.refreshBookmarks();
  }

  private async recordClick(id: string): Promise<void> {
    this.usage.set(id, (this.usage.get(id) ?? 0) + 1);
    try {
      await chrome.storage.local.set({ [LINK_USAGE_KEY]: Object.fromEntries(this.usage) });
    } catch {
      /* non-critical */
    }
  }

  /* ---------------------------------------------------------------- */
  /* Icons                                                             */
  /* ---------------------------------------------------------------- */

  private faviconUrl(pageUrl: string): string {
    // Chrome's favicon cache service (requires the "favicon" permission).
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', '64');
    return url.toString();
  }

  /** Public favicon service — a plain web lookup for the domain's icon. */
  private webFaviconUrl(pageUrl: string): string {
    try {
      const host = new URL(pageUrl).hostname;
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    } catch {
      return '';
    }
  }

  /**
   * Generated fallback: a rounded gradient tile seeded by the domain,
   * with the site's initial — always legible, always on-brand-ish.
   */
  private monogramTile(title: string, pageUrl: string): string {
    let seed = 0;
    for (const ch of pageUrl) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const hue = seed % 360;
    const hue2 = (hue + 42 + (seed >> 8) % 60) % 360;
    const letter = (title.trim().slice(0, 1) || '?').toUpperCase();
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="hsl(${hue},68%,52%)"/>` +
      `<stop offset="1" stop-color="hsl(${hue2},72%,38%)"/>` +
      `</linearGradient></defs>` +
      `<rect width="64" height="64" rx="14" fill="url(#g)"/>` +
      `<text x="32" y="44" font-family="Segoe UI, Ubuntu, sans-serif" font-size="34" ` +
      `font-weight="700" text-anchor="middle" fill="rgba(255,255,255,0.94)">${letter}</text>` +
      `</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  private tile(shortcut: Shortcut): HTMLElement {
    const a = el('a', 'link-tile');
    a.href = shortcut.url;
    a.title = `${shortcut.title} — ${shortcut.url}`;
    a.setAttribute('aria-label', shortcut.title);

    const icon = el('span', 'link-icon');
    const img = new Image();
    img.alt = '';
    img.width = 20;
    img.height = 20;
    img.draggable = false;
    let stage = 0;
    img.addEventListener('error', () => {
      stage += 1;
      if (stage === 1) img.src = this.webFaviconUrl(shortcut.url);      // ask the web
      else {                                                            // generate one
        icon.textContent = '';
        img.src = this.monogramTile(shortcut.title, shortcut.url);
      }
    });
    const localIcon = LOCAL_ICONS[new URL(shortcut.url).hostname.replace(/^www\./, '')];
    img.src = localIcon ? chrome.runtime.getURL(`assets/links/${localIcon}.svg`) : this.faviconUrl(shortcut.url);
    icon.appendChild(img);

    const label = el('span', 'link-label', shortcut.title);
    a.append(icon, label);

    a.addEventListener('click', () => void this.recordClick(shortcut.id));
    return a;
  }

  /* ---------------------------------------------------------------- */

  private orderedShortcuts(): Shortcut[] {
    const active = this.settings.shortcuts.filter((s) => s.enabled);
    const seen = new Set(active.map((s) => {
      try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return s.url; }
    }));
    // bookmarks fill the remaining slots, never duplicating a shortcut
    const merged = [...active];
    for (const bm of this.bookmarks) {
      if (merged.length >= MAX_TILES) break;
      let host = bm.url;
      try { host = new URL(bm.url).hostname.replace(/^www\./, ''); } catch { /* keep url */ }
      if (seen.has(host)) continue;
      seen.add(host);
      merged.push(bm);
    }
    if (!this.settings.sortByUsage) return merged;
    return merged.sort((a, b) => (this.usage.get(b.id) ?? 0) - (this.usage.get(a.id) ?? 0));
  }

  render(): void {
    this.root.textContent = '';
    for (const shortcut of this.orderedShortcuts()) {
      this.root.appendChild(this.tile(shortcut));
    }
  }
}
