/**
 * Settings store — loads from chrome.storage.sync, keeps an in-memory
 * snapshot, and notifies subscribers on any change (including changes
 * made from the popup or another open new-tab page).
 */
import type { Settings } from '../types';
import { DEFAULT_SETTINGS, SETTINGS_KEY, normalizeSettings } from './schema';

export type SettingsListener = (settings: Settings, changed: ReadonlySet<keyof Settings>) => void;

class SettingsStore {
  private current: Settings = { ...DEFAULT_SETTINGS };
  private listeners = new Set<SettingsListener>();
  private ready = false;

  /** Load persisted settings and start listening for external changes. */
  async init(): Promise<Settings> {
    try {
      const stored = await chrome.storage.sync.get(SETTINGS_KEY);
      this.current = normalizeSettings(stored[SETTINGS_KEY]);
    } catch (err) {
      console.warn('[hypertab] storage unavailable, using defaults', err);
      this.current = { ...DEFAULT_SETTINGS };
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes[SETTINGS_KEY]) return;
      const next = normalizeSettings(changes[SETTINGS_KEY].newValue);
      const changed = new Set<keyof Settings>();
      (Object.keys(next) as (keyof Settings)[]).forEach((k) => {
        if (JSON.stringify(next[k]) !== JSON.stringify(this.current[k])) changed.add(k);
      });
      this.current = next;
      if (changed.size) this.listeners.forEach((fn) => fn(this.current, changed));
    });

    this.ready = true;
    return this.current;
  }

  get(): Settings {
    return this.current;
  }

  isReady(): boolean {
    return this.ready;
  }

  /** Persist a partial update and notify local subscribers immediately. */
  async update(patch: Partial<Settings>): Promise<void> {
    const next = { ...this.current, ...patch };
    const changed = new Set<keyof Settings>();
    (Object.keys(patch) as (keyof Settings)[]).forEach((k) => {
      if (JSON.stringify(next[k]) !== JSON.stringify(this.current[k])) changed.add(k);
    });
    this.current = next;
    try {
      await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
    } catch (err) {
      console.error('[hypertab] failed to save settings', err);
    }
    if (changed.size) this.listeners.forEach((fn) => fn(this.current, changed));
  }

  subscribe(fn: SettingsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const settings = new SettingsStore();
