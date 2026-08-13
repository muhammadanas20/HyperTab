/**
 * HyprTab — new tab bootstrap.
 *
 * Order of operations:
 *  1. settings load   2. theme applied   3. wallpaper engine spins up
 *  4. widgets mount   5. the webhead wakes   6. interactions wire in
 * Everything subscribes to the settings store, so the settings panel
 * (or the popup, from any page) changes things live.
 */
import { settings } from '../settings/store';
import { applyAppearance } from '../settings/themes';
import { SettingsPanel } from '../settings/panel';
import { WallpaperEngine } from '../scene/engine';
import { ClockWidget } from '../widgets/clock';
import { WeatherWidget } from '../widgets/weather';
import { BatteryWidget } from '../widgets/battery';
import { LinksWidget } from '../widgets/links';
import { SpiderController } from '../spider/controller';
import { sound } from '../audio/sound';
import { $ } from '../utils/helpers';

declare const gsap: {
  from(target: object | string, vars: Record<string, unknown>): void;
  to(target: object | string, vars: Record<string, unknown>): void;
  fromTo(target: object | string, from: Record<string, unknown>, to: Record<string, unknown>): void;
  timeline(vars?: Record<string, unknown>): { from(t: object | string, v: Record<string, unknown>, p?: string | number): unknown };
};

const OPEN_PANEL_KEY = 'hypertab:openPanel';

async function boot(): Promise<void> {
  const s = await settings.init();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* '#bare' hides all UI — used by the wallpaper capture tooling */
  if (window.location.hash === '#bare') document.body.classList.add('bare');

  applyAppearance(s.theme, s.accent, s.blur);
  document.documentElement.style.setProperty('--scene-poster', `url("../assets/wallpapers/${s.wallpaper}.jpg")`);

  /* ---------------- wallpaper engine ---------------- */
  const engine = new WallpaperEngine($<HTMLCanvasElement>('#wallpaper'));
  engine.setScene(s.wallpaper);
  engine.speed = s.animationSpeed;
  engine.particleAmount = s.particleAmount;
  engine.accent = s.accent;
  engine.rain = s.rain;
  engine.snow = s.snow;
  engine.performanceMode = s.performanceMode;
  if (!reducedMotion) engine.start();
  else {
    // respect reduced motion: render a single still frame
    engine.setPerformanceMode(true);
    engine.start(); engine.stop();
    // draw one frame manually
    (engine as unknown as { tick(d: number): void }).tick(0.016);
  }

  /* ---------------- widgets ---------------- */
  const clock = new ClockWidget(s);
  const weather = new WeatherWidget(s);
  const battery = new BatteryWidget(s);
  const links = new LinksWidget(s);

  /* ---------------- sound ---------------- */
  sound.setEnabled(s.sound);
  sound.setVolume(s.volume);
  if (s.sound && s.rain) sound.startRain();
  // browsers require a gesture before audio — resume softly on first interaction
  const unlock = (): void => {
    const current = settings.get();
    if (!current.sound) return;
    sound.setEnabled(true);
    if (current.rain) sound.startRain();
    window.removeEventListener('pointerdown', unlock);
  };
  // Keep listening until sound is actually enabled. With `once: true`, the
  // first click on the disabled-by-default page consumed the only audio
  // gesture, so enabling sound later could leave AudioContext suspended.
  window.addEventListener('pointerdown', unlock);

  /* ---------------- speech bubble ---------------- */
  const bubble = $('#bubble');
  let bubbleTimer = 0;
  const showBubble = (text: string, x: number, y: number, holdMs = 2200): void => {
    window.clearTimeout(bubbleTimer);
    bubble.textContent = text;
    bubble.style.visibility = 'visible';
    const bw = bubble.offsetWidth;
    const bx = Math.min(Math.max(x - bw / 2, 12), window.innerWidth - bw - 12);
    bubble.style.left = `${bx}px`;
    bubble.style.top = `${Math.max(10, y - 34)}px`;
    try {
      gsap.fromTo(bubble, { scale: 0.3, opacity: 0, y: 8 }, { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: 'back.out(2.4)' });
    } catch {
      bubble.style.opacity = '1';
    }
    bubbleTimer = window.setTimeout(() => {
      try {
        gsap.to(bubble, { opacity: 0, scale: 0.8, duration: 0.25 });
      } catch {
        bubble.style.opacity = '0';
      }
    }, holdMs);
  };

  /* ---------------- the webhead ---------------- */
  const spider = new SpiderController($<HTMLCanvasElement>('#spider-canvas'), {
    showBubble,
    sfx: (name) => sound.play(name),
    searchRect: () => $('#search').getBoundingClientRect(),
    accent: () => settings.get().accent,
  });
  spider.enabled = s.spiderEnabled;
  spider.frequency = s.spiderFrequency;
  spider.speed = s.animationSpeed;
  spider.reducedMotion = reducedMotion;
  spider.performanceMode = s.performanceMode;
  if (s.spiderEnabled) spider.start();
  // power-user handle — lets curious folks poke the webhead from devtools
  (window as unknown as { __spider: SpiderController }).__spider = spider;

  /* ---------------- settings panel ---------------- */
  const panel = new SettingsPanel({
    onOpen: () => spider.onSettingsOpen(),
    onClose: () => spider.onSettingsClose(),
  });

  /* ---------------- search ---------------- */
  const searchForm = $('#search') as HTMLFormElement;
  const searchInput = $('#search-input') as HTMLInputElement;
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    const url = /^(https?:\/\/|[\w-]+(\.[\w-]+)+(\/\S*)?$)/.test(q)
      ? (q.startsWith('http') ? q : `https://${q}`)
      : `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    window.location.href = url;
  });
  searchInput.addEventListener('focus', () => spider.onSearchHover(true));
  searchInput.addEventListener('blur', () => spider.onSearchHover(false));
  searchInput.addEventListener('input', () => spider.onTyping());
  $('#search-wrap').addEventListener('pointerenter', () => spider.onSearchHover(true));
  $('#search-wrap').addEventListener('pointerleave', () => {
    if (document.activeElement !== searchInput) spider.onSearchHover(false);
  });

  /* ---------------- pointer wiring for the webhead ---------------- */
  window.addEventListener('pointermove', (e) => spider.onPointerMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('#settings-panel, #settings-gear, a, button, input, select')) return;
    spider.onPointerDown(e.clientX, e.clientY);
  });
  window.addEventListener('dblclick', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('#settings-panel, #settings-gear, a, button, input, select')) return;
    spider.onDoubleClick(e.clientX, e.clientY);
  });

  /* "/" focuses the search like every good launcher */
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  /* ---------------- live settings wiring ---------------- */
  settings.subscribe((next, changed) => {
    if (changed.has('theme') || changed.has('accent') || changed.has('blur')) {
      applyAppearance(next.theme, next.accent, next.blur);
      engine.accent = next.accent;
    }
    if (changed.has('wallpaper')) {
      engine.setScene(next.wallpaper);
      document.documentElement.style.setProperty('--scene-poster', `url("../assets/wallpapers/${next.wallpaper}.jpg")`);
    }
    if (changed.has('animationSpeed')) {
      engine.speed = next.animationSpeed;
      spider.speed = next.animationSpeed;
    }
    if (changed.has('particleAmount')) engine.particleAmount = next.particleAmount;
    if (changed.has('rain')) {
      engine.rain = next.rain;
      if (next.sound) next.rain ? sound.startRain() : sound.stopRain();
    }
    if (changed.has('snow')) engine.snow = next.snow;
    if (changed.has('performanceMode')) {
      engine.setPerformanceMode(next.performanceMode);
      spider.performanceMode = next.performanceMode;
      spider.resize();
    }
    if (changed.has('sound')) {
      sound.setEnabled(next.sound);
      if (next.sound && next.rain) sound.startRain();
    }
    if (changed.has('volume')) sound.setVolume(next.volume);
    if (changed.has('spiderEnabled')) spider.setEnabled(next.spiderEnabled);
    if (changed.has('spiderFrequency')) spider.frequency = next.spiderFrequency;

    clock.updateSettings(next);
    weather.updateSettings(next);
    battery.updateSettings(next);
    links.updateSettings(next);
  });

  /* pause everything when the tab is hidden (Chrome keeps rendering off-screen otherwise) */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      spider.stop();
    } else if (settings.get().spiderEnabled) {
      spider.start();
    }
  });

  /* ---------------- entrance choreography ---------------- */
  if (!reducedMotion) {
    try {
      gsap.from('#topbar', { y: -26, opacity: 0, duration: 0.8, ease: 'expo.out', delay: 0.05 });
      gsap.from('.link-tile', {
        y: -14, opacity: 0, duration: 0.6, ease: 'back.out(2)', stagger: 0.05, delay: 0.25,
      });
      gsap.from('#search-wrap', { y: 26, opacity: 0, scale: 0.96, duration: 0.9, ease: 'expo.out', delay: 0.35 });
      gsap.from('#hint', { opacity: 0, duration: 1.2, delay: 1.2 });
    } catch { /* CSS fallback keeps things visible */ }
  }

  /* popup asked us to open the settings panel? honour + consume the flag */
  try {
    const stored = await chrome.storage.local.get(OPEN_PANEL_KEY);
    if (stored[OPEN_PANEL_KEY]) {
      await chrome.storage.local.remove(OPEN_PANEL_KEY);
      window.setTimeout(() => panel.open(), 600);
    }
  } catch { /* storage optional */ }
}

void boot();
