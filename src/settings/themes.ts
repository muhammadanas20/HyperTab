/**
 * Theme palettes (Catppuccin Mocha, Tokyo Night, Nord, Cyberpunk) and the
 * routine that pushes them into CSS custom properties on :root.
 */
import type { ThemeId } from '../types';
import { rgba } from '../utils/helpers';

export interface Palette {
  id: ThemeId;
  label: string;
  base: string;      // page background behind the canvas
  surface: string;   // glass surface
  text: string;
  subtext: string;
  accent: string;    // default accent for the theme
  glow: string;      // neon glow colour
}

export const PALETTES: Record<ThemeId, Palette> = {
  catppuccin: {
    id: 'catppuccin',
    label: 'Catppuccin Mocha',
    base: '#1e1e2e',
    surface: 'rgba(30, 30, 46, 0.55)',
    text: '#cdd6f4',
    subtext: '#a6adc8',
    accent: '#89b4fa',
    glow: '#b4befe',
  },
  tokyo: {
    id: 'tokyo',
    label: 'Tokyo Night',
    base: '#1a1b26',
    surface: 'rgba(26, 27, 38, 0.55)',
    text: '#c0caf5',
    subtext: '#8891b8',
    accent: '#7aa2f7',
    glow: '#bb9af7',
  },
  nord: {
    id: 'nord',
    label: 'Nord',
    base: '#2e3440',
    surface: 'rgba(46, 52, 64, 0.55)',
    text: '#eceff4',
    subtext: '#aeb9cf',
    accent: '#88c0d0',
    glow: '#81a1c1',
  },
  cyber: {
    id: 'cyber',
    label: 'Cyberpunk',
    base: '#0b0e1a',
    surface: 'rgba(11, 14, 26, 0.6)',
    text: '#d8f3ff',
    subtext: '#8aa8c2',
    accent: '#00e5ff',
    glow: '#ff2bd6',
  },
};

/** Apply theme + accent + blur to the document. */
export function applyAppearance(theme: ThemeId, accent: string, blur: number): void {
  const p = PALETTES[theme] ?? PALETTES.catppuccin;
  const root = document.documentElement.style;
  root.setProperty('--base', p.base);
  root.setProperty('--surface', p.surface);
  root.setProperty('--text', p.text);
  root.setProperty('--subtext', p.subtext);
  root.setProperty('--accent', accent);
  root.setProperty('--accent-soft', rgba(accent, 0.35));
  root.setProperty('--accent-faint', rgba(accent, 0.12));
  root.setProperty('--glow', p.glow);
  root.setProperty('--glass-blur', `${blur}px`);
}
