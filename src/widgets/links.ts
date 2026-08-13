/**
 * Quick-links bar (top-left) — favourite sites as glass tiles.
 * Icons come from Chrome's built-in `_favicon` service (crisp, cached,
 * offline-friendly) with an inline SVG letter-tile fallback.
 * Clicks are counted locally; tiles can sort by usage.
 */
import type { Settings, Shortcut } from '../types';
import { LINK_USAGE_KEY } from '../settings/schema';
import { $, el } from '../utils/helpers';

export class LinksWidget {
  private settings: Settings;
  private usage = new Map<string, number>();
  private root: HTMLElement;

  constructor(settings: Settings) {
    this.settings = settings;
    this.root = $('#links');
    void this.loadUsage().then(() => this.render());
  }

  updateSettings(s: Settings): void {
    this.settings = s;
    this.render();
  }

  private async loadUsage(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(LINK_USAGE_KEY);
      const map = stored[LINK_USAGE_KEY] as Record<string, number> | undefined;
      if (map) this.usage = new Map(Object.entries(map));
    } catch {
      /* counts are a nice-to-have */
    }
  }

  private async recordClick(id: string): Promise<void> {
    this.usage.set(id, (this.usage.get(id) ?? 0) + 1);
    try {
      await chrome.storage.local.set({ [LINK_USAGE_KEY]: Object.fromEntries(this.usage) });
    } catch {
      /* non-critical */
    }
  }

  private faviconUrl(pageUrl: string): string {
    // Chrome's favicon cache service (requires the "favicon" permission).
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', '64');
    return url.toString();
  }

  private tile(shortcut: Shortcut): HTMLElement {
    const a = el('a', 'link-tile');
    a.href = shortcut.url;
    a.title = `${shortcut.title} — ${shortcut.url}`;
    a.setAttribute('aria-label', shortcut.title);

    const icon = el('span', 'link-icon');
    const img = new Image();
    img.src = this.faviconUrl(shortcut.url);
    img.alt = '';
    img.width = 20;
    img.height = 20;
    img.draggable = false;
    // favicon can miss (new profile / uncached) → letter tile fallback
    img.addEventListener('error', () => {
      icon.textContent = shortcut.title.slice(0, 1).toUpperCase();
      icon.classList.add('link-icon-letter');
    });
    icon.appendChild(img);

    const label = el('span', 'link-label', shortcut.title);
    a.append(icon, label);

    a.addEventListener('click', () => void this.recordClick(shortcut.id));
    return a;
  }

  private orderedShortcuts(): Shortcut[] {
    const active = this.settings.shortcuts.filter((s) => s.enabled);
    if (!this.settings.sortByUsage) return active;
    return [...active].sort((a, b) => (this.usage.get(b.id) ?? 0) - (this.usage.get(a.id) ?? 0));
  }

  render(): void {
    this.root.textContent = '';
    for (const shortcut of this.orderedShortcuts()) {
      this.root.appendChild(this.tile(shortcut));
    }
  }
}
