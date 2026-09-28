/**
 * Shared type definitions for HyprTab.
 * Kept dependency-free so every module (newtab, popup, background) can import them.
 */

/** Wallpaper scenes shipped with the extension. */
export type SceneId =
  | 'cityRain'
  | 'neonStreet'
  | 'mountains'
  | 'forest'
  | 'space'
  | 'aurora'
  | 'particles';

/** Built-in colour themes (inspired by Hyprland ricing culture). */
export type ThemeId = 'catppuccin' | 'tokyo' | 'nord' | 'cyber';

/** A quick-link tile shown top-left. */
export interface Shortcut {
  id: string;
  title: string;
  url: string;
  enabled: boolean;
}

/** Persisted user settings (chrome.storage.sync). */
export interface Settings {
  /** schema version, for future migrations */
  version: number;

  /* ---- wallpaper / atmosphere ---- */
  wallpaper: SceneId;
  animationSpeed: number;   // 0.25 – 2 global time multiplier
  particleAmount: number;   // 0 – 1 density scale
  rain: boolean;
  snow: boolean;

  /* ---- spider ---- */
  spiderEnabled: boolean;
  spiderFrequency: number;  // 0 – 1 → how often it does things

  /* ---- widgets ---- */
  clock24: boolean;
  showSeconds: boolean;
  showDate: boolean;
  showGreeting: boolean;
  showBattery: boolean;
  weatherEnabled: boolean;
  weatherUnit: 'c' | 'f';
  weatherCity: string;      // '' → auto-lookup a default city
  userName: string;

  /* ---- appearance ---- */
  theme: ThemeId;
  accent: string;           // hex colour, e.g. #89b4fa
  blur: number;             // glass blur strength px (0 – 30)

  /* ---- system ---- */
  performanceMode: boolean;
  sound: boolean;
  volume: number;           // 0 – 1

  /* ---- links ---- */
  shortcuts: Shortcut[];
  sortByUsage: boolean;
  /** merge the browser's own bookmarks into the quick-links bar */
  importBookmarks: boolean;
}

/** Runtime snapshot passed to the wallpaper renderer each frame. */
export interface SceneFrame {
  /** seconds, scaled by animationSpeed */
  t: number;
  /** raw delta seconds (unscaled) */
  dt: number;
  /** scaled delta seconds */
  sdt: number;
  /** parallax cursor offset, -1..1 on both axes */
  px: number;
  py: number;
  /** raw cursor position in CSS pixels (for scenes that react to the pointer) */
  mx: number;
  my: number;
  /** 0..1 particle density from settings */
  particles: number;
  /** active accent colour */
  accent: string;
  /** 0..1 render quality (perf mode degrades) */
  quality: number;
  rain: boolean;
  snow: boolean;
  w: number;
  h: number;
}

/** Cached weather payload. */
export interface WeatherData {
  tempC: number;
  code: number;        // WMO weather code
  isDay: boolean;
  city: string;
  fetchedAt: number;
}

/** Module contract every wallpaper scene implements. */
export interface Scene {
  readonly id: SceneId;
  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void;
  resize(w: number, h: number, dpr: number): void;
  render(f: SceneFrame): void;
  dispose(): void;
}
