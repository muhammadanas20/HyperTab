/**
 * Settings schema: defaults, validation and storage keys.
 */
import type { Settings, Shortcut } from '../types';

export const SETTINGS_KEY = 'hypertab:settings';
export const WEATHER_CACHE_KEY = 'hypertab:weather';
export const LINK_USAGE_KEY = 'hypertab:linkUsage';

export const SETTINGS_VERSION = 1;

/** The default quick-links requested in the spec. */
export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: 'github',   title: 'GitHub',   url: 'https://github.com',   enabled: true },
  { id: 'youtube',  title: 'YouTube',  url: 'https://youtube.com',  enabled: true },
  { id: 'chatgpt',  title: 'ChatGPT',  url: 'https://chat.openai.com', enabled: true },
  { id: 'gmail',    title: 'Gmail',    url: 'https://mail.google.com', enabled: true },
  { id: 'leetcode', title: 'LeetCode', url: 'https://leetcode.com', enabled: true },
  { id: 'reddit',   title: 'Reddit',   url: 'https://reddit.com',   enabled: true },
  { id: 'spotify',  title: 'Spotify',  url: 'https://open.spotify.com', enabled: true },
];

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,

  wallpaper: 'cityRain',
  animationSpeed: 1,
  particleAmount: 0.7,
  rain: true,
  snow: false,

  spiderEnabled: true,
  spiderFrequency: 0.6,

  clock24: true,
  showSeconds: false,
  showDate: true,
  showGreeting: true,
  showBattery: true,
  weatherEnabled: true,
  weatherUnit: 'c',
  weatherCity: '',
  userName: '',

  theme: 'catppuccin',
  accent: '#89b4fa',
  blur: 14,

  performanceMode: false,
  sound: false,
  volume: 0.5,

  shortcuts: DEFAULT_SHORTCUTS.map((s) => ({ ...s })),
  sortByUsage: true,
  importBookmarks: true,
};

/** Clamp/validate a settings object loaded from storage against the schema. */
export function normalizeSettings(raw: unknown): Settings {
  const base: Settings = { ...DEFAULT_SETTINGS, shortcuts: DEFAULT_SHORTCUTS.map((s) => ({ ...s })) };
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;

  const num = (v: unknown, d: number, min: number, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
  const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
  const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d;

  base.wallpaper = oneOf(r.wallpaper, ['cityRain', 'neonStreet', 'mountains', 'forest', 'space', 'aurora', 'particles'], base.wallpaper);
  base.theme = oneOf(r.theme, ['catppuccin', 'tokyo', 'nord', 'cyber'], base.theme);
  base.weatherUnit = oneOf(r.weatherUnit, ['c', 'f'], base.weatherUnit);

  base.animationSpeed = num(r.animationSpeed, base.animationSpeed, 0.25, 2);
  base.particleAmount = num(r.particleAmount, base.particleAmount, 0, 1);
  base.spiderFrequency = num(r.spiderFrequency, base.spiderFrequency, 0, 1);
  base.blur = num(r.blur, base.blur, 0, 30);
  base.volume = num(r.volume, base.volume, 0, 1);

  base.rain = bool(r.rain, base.rain);
  base.snow = bool(r.snow, base.snow);
  base.spiderEnabled = bool(r.spiderEnabled, base.spiderEnabled);
  base.clock24 = bool(r.clock24, base.clock24);
  base.showSeconds = bool(r.showSeconds, base.showSeconds);
  base.showDate = bool(r.showDate, base.showDate);
  base.showGreeting = bool(r.showGreeting, base.showGreeting);
  base.showBattery = bool(r.showBattery, base.showBattery);
  base.weatherEnabled = bool(r.weatherEnabled, base.weatherEnabled);
  base.performanceMode = bool(r.performanceMode, base.performanceMode);
  base.sound = bool(r.sound, base.sound);
  base.sortByUsage = bool(r.sortByUsage, base.sortByUsage);
  base.importBookmarks = bool(r.importBookmarks, base.importBookmarks);

  base.weatherCity = str(r.weatherCity, base.weatherCity);
  base.userName = str(r.userName, base.userName);
  base.accent = /^#[0-9a-f]{6}$/i.test(str(r.accent, base.accent)) ? str(r.accent, base.accent) : base.accent;

  if (Array.isArray(r.shortcuts)) {
    const list: Shortcut[] = [];
    for (const item of r.shortcuts) {
      if (
        typeof item === 'object' && item !== null &&
        typeof (item as Shortcut).id === 'string' &&
        typeof (item as Shortcut).url === 'string'
      ) {
        const s = item as Shortcut;
        let safeUrl: string;
        try {
          const rawUrl = s.url.trim();
          const candidate = /^https?:\/\//i.test(rawUrl)
            ? rawUrl
            : `https://${rawUrl.replace(/^\/\//, '')}`;
          const parsed = new URL(candidate);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
          safeUrl = parsed.href;
        } catch {
          continue;
        }
        list.push({
          id: s.id.slice(0, 40),
          title: typeof s.title === 'string' && s.title ? s.title.slice(0, 24) : s.id,
          url: safeUrl,
          enabled: !!s.enabled,
        });
      }
    }
    // An empty list is valid (the user may intentionally remove every tile).
    base.shortcuts = list.slice(0, 24);
  }

  return base;
}
