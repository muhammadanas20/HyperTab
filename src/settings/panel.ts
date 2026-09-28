/**
 * Settings panel — generated UI bound two-way to the settings store.
 * Lives as a slide-over on the new tab page; changes apply live
 * (wallpaper engine, spider, widgets all subscribe to the store).
 */
import type { SceneId, Settings, ThemeId } from '../types';
import { settings } from './store';
import { PALETTES } from './themes';
import { SCENE_LABELS, scenePreviewAccent } from '../scene/scenes';
import { DEFAULT_SETTINGS, referencePreset } from './schema';
import { $, el } from '../utils/helpers';

export interface PanelHooks {
  onOpen(): void;
  onClose(): void;
}

export class SettingsPanel {
  private hooks: PanelHooks;
  private isOpen = false;
  private panel: HTMLElement;
  private backdrop: HTMLElement;
  private gear: HTMLButtonElement;
  private lastFocused: HTMLElement | null = null;

  constructor(hooks: PanelHooks) {
    this.hooks = hooks;
    this.panel = el('aside', 'settings-panel');
    this.panel.id = 'settings-panel';
    this.panel.tabIndex = -1;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', 'settings-title');
    this.panel.setAttribute('aria-hidden', 'true');
    this.backdrop = el('div', 'settings-backdrop');
    this.backdrop.id = 'settings-backdrop';
    this.backdrop.setAttribute('aria-hidden', 'true');
    this.gear = $('#settings-gear') as HTMLButtonElement;
    this.gear.setAttribute('aria-controls', this.panel.id);
    this.gear.setAttribute('aria-expanded', 'false');

    document.body.append(this.backdrop, this.panel);

    this.backdrop.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => this.onKeydown(e));
    this.gear.addEventListener('click', () => this.toggle());

    this.build();
    settings.subscribe(() => this.sync());
    this.sync();
  }

  /* ---------------------------------------------------------------- */
  /* open / close                                                      */
  /* ---------------------------------------------------------------- */

  toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.panel.classList.add('open');
    this.backdrop.classList.add('visible');
    this.panel.setAttribute('aria-hidden', 'false');
    this.gear.setAttribute('aria-expanded', 'true');
    document.body.classList.add('settings-open');

    // A stale horizontal scroll position made the wallpaper cards appear cut
    // off on later opens. The panel is vertical-only and always starts flush.
    const scroll = this.panel.querySelector<HTMLElement>('.set-scroll');
    if (scroll) scroll.scrollLeft = 0;
    window.requestAnimationFrame(() => this.panel.querySelector<HTMLElement>('.set-close')?.focus());
    this.hooks.onOpen();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panel.classList.remove('open');
    this.backdrop.classList.remove('visible');
    this.panel.setAttribute('aria-hidden', 'true');
    this.gear.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('settings-open');
    this.hooks.onClose();
    (this.lastFocused ?? this.gear).focus();
  }

  private onKeydown(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = [...this.panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )].filter((node) => node.offsetParent !== null);
    if (!focusable.length) {
      e.preventDefault();
      this.panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  isVisible(): boolean {
    return this.isOpen;
  }

  /* ---------------------------------------------------------------- */
  /* control builders                                                  */
  /* ---------------------------------------------------------------- */

  private section(title: string, hint?: string): HTMLElement {
    const sec = el('section', 'set-section');
    const h = el('h3', 'set-title', title);
    sec.appendChild(h);
    if (hint) sec.appendChild(el('p', 'set-hint', hint));
    return sec;
  }

  private row(label: string, control: HTMLElement, sub?: string): HTMLElement {
    const row = el('label', 'set-row');
    const texts = el('span', 'set-row-text');
    texts.appendChild(el('span', 'set-label', label));
    if (sub) texts.appendChild(el('span', 'set-sub', sub));
    row.append(texts, control);
    return row;
  }

  private switchCtl(get: () => boolean, set: (v: boolean) => void, aria: string): HTMLElement {
    const btn = el('button', 'switch');
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-label', aria);
    const knob = el('span', 'switch-knob');
    btn.appendChild(knob);
    const paint = (): void => {
      btn.classList.toggle('on', get());
      btn.setAttribute('aria-checked', String(get()));
    };
    btn.addEventListener('click', () => {
      set(!get());
      paint();
    });
    (btn as unknown as { _paint: () => void })._paint = paint;
    paint();
    return btn;
  }

  private slider(
    get: () => number, set: (v: number) => void,
    min: number, max: number, step: number, format: (v: number) => string,
  ): HTMLElement {
    const wrap = el('span', 'slider-wrap');
    const input = el('input') as HTMLInputElement;
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const val = el('span', 'slider-val');
    const paint = (): void => {
      input.value = String(get());
      val.textContent = format(get());
      const pct = ((get() - min) / (max - min)) * 100;
      input.style.setProperty('--fill', `${pct}%`);
    };
    input.addEventListener('input', () => {
      set(Number(input.value));
      paint();
    });
    (wrap as unknown as { _paint: () => void })._paint = paint;
    paint();
    wrap.append(input, val);
    return wrap;
  }

  private textInput(get: () => string, set: (v: string) => void, placeholder: string): HTMLElement {
    const input = el('input', 'text-input') as HTMLInputElement;
    input.type = 'text';
    input.placeholder = placeholder;
    const paint = (): void => {
      if (document.activeElement !== input) input.value = get();
    };
    (input as unknown as { _paint: () => void })._paint = paint;
    paint();
    let t = 0;
    input.addEventListener('input', () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => set(input.value), 350);
    });
    return input;
  }

  /** sync every painted control from the store (external changes / reset) */
  private sync(): void {
    this.panel.querySelectorAll<HTMLElement>('[data-bound]').forEach((node) => {
      (node as unknown as { _paint?: () => void })._paint?.();
    });
  }

  private bound<T extends HTMLElement>(node: T): T {
    node.setAttribute('data-bound', '');
    node.dataset.bound = '1';
    (node as unknown as { _paint?: () => void })._paint = (node as unknown as { _paint?: () => void })._paint;
    return node;
  }

  /* ---------------------------------------------------------------- */
  /* build                                                             */
  /* ---------------------------------------------------------------- */

  private build(): void {
    const s = (): Settings => settings.get();
    const header = el('header', 'set-header');
    const brand = el('div', 'set-brand');
    const mark = el('span', 'set-mark', 'H');
    mark.setAttribute('aria-hidden', 'true');
    const titles = el('span', 'set-titles');
    const heading = el('h2', 'set-heading', 'HyprTab Settings');
    heading.id = 'settings-title';
    titles.append(el('span', 'set-eyebrow', 'PERSONALIZE'), heading);
    brand.append(mark, titles);
    header.appendChild(brand);
    const closeBtn = el('button', 'set-close', '✕');
    closeBtn.id = 'settings-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close settings');
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);
    this.panel.appendChild(header);

    const scroll = el('div', 'set-scroll');

    /* ---------- wallpaper ---------- */
    const wallSec = this.section('Wallpaper', 'Animated, parallax, 60fps — all rendered locally.');
    const grid = el('div', 'wall-grid');
    (Object.keys(SCENE_LABELS) as SceneId[]).forEach((id) => {
      const btn = el('button', 'wall-option');
      btn.type = 'button';
      const chip = el('span', 'wall-chip');
      // real in-engine render of the scene, shipped as a tiny poster
      chip.style.background =
        `radial-gradient(120% 120% at 30% 20%, ${scenePreviewAccent(id)}22, transparent 60%), ` +
        `url("${chrome.runtime.getURL(`assets/wallpapers/${id}.jpg`)}") center/cover, ` +
        `linear-gradient(160deg, #10142b, #05060f)`;
      btn.append(chip, el('span', 'wall-name', SCENE_LABELS[id]));
      const paint = (): void => { btn.classList.toggle('selected', s().wallpaper === id); };
      (btn as unknown as { _paint: () => void })._paint = paint;
      btn.setAttribute('data-bound', '1');
      btn.addEventListener('click', () => {
        void settings.update({ wallpaper: id });
        grid.querySelectorAll('.wall-option').forEach((n) => n.classList.remove('selected'));
        btn.classList.add('selected');
      });
      paint();
      grid.appendChild(btn);
    });
    wallSec.appendChild(this.bound(grid));
    scroll.appendChild(wallSec);

    /* ---------- spider ---------- */
    const spSec = this.section('The Webhead', 'Cinematic suit · articulated hands · matrix-driven movement.');
    spSec.appendChild(this.row('Enabled', this.bound(this.switchCtl(
      () => s().spiderEnabled, (v) => void settings.update({ spiderEnabled: v }), 'Toggle the spider',
    ))));
    spSec.appendChild(this.row('Activity', this.bound(this.slider(
      () => s().spiderFrequency, (v) => void settings.update({ spiderFrequency: v }),
      0, 1, 0.05, (v) => v < 0.25 ? 'Lazy' : v < 0.5 ? 'Chill' : v < 0.8 ? 'Lively' : 'Hyper',
    )), 'How often he does something new'));
    scroll.appendChild(spSec);

    /* ---------- atmosphere ---------- */
    const atSec = this.section('Atmosphere');
    atSec.appendChild(this.row('Particle density', this.bound(this.slider(
      () => s().particleAmount, (v) => void settings.update({ particleAmount: v }),
      0, 1, 0.05, (v) => `${Math.round(v * 100)}%`,
    ))));
    atSec.appendChild(this.row('Rain', this.bound(this.switchCtl(
      () => s().rain, (v) => void settings.update({ rain: v }), 'Toggle rain',
    ))));
    atSec.appendChild(this.row('Snow', this.bound(this.switchCtl(
      () => s().snow, (v) => void settings.update({ snow: v }), 'Toggle snow',
    ))));
    atSec.appendChild(this.row('Animation speed', this.bound(this.slider(
      () => s().animationSpeed, (v) => void settings.update({ animationSpeed: v }),
      0.25, 2, 0.05, (v) => `${v.toFixed(2)}×`,
    ))));
    scroll.appendChild(atSec);

    /* ---------- appearance ---------- */
    const apSec = this.section('Appearance');
    const swatches = el('div', 'theme-swatches');
    (Object.keys(PALETTES) as ThemeId[]).forEach((id) => {
      const p = PALETTES[id];
      const b = el('button', 'swatch');
      b.type = 'button';
      b.title = p.label;
      b.style.background = `linear-gradient(135deg, ${p.base} 55%, ${p.accent} 55% 75%, ${p.glow})`;
      b.setAttribute('aria-label', p.label);
      const paint = (): void => { b.classList.toggle('selected', s().theme === id); };
      (b as unknown as { _paint: () => void })._paint = paint;
      b.addEventListener('click', () => void settings.update({ theme: id, accent: p.accent }));
      paint();
      swatches.appendChild(b);
    });
    apSec.appendChild(this.row('Theme', this.bound(swatches)));
    const color = el('input') as HTMLInputElement;
    color.type = 'color';
    const paintColor = (): void => { color.value = s().accent; };
    (color as unknown as { _paint: () => void })._paint = paintColor;
    color.addEventListener('input', () => void settings.update({ accent: color.value }));
    paintColor();
    apSec.appendChild(this.row('Accent colour', this.bound(color), 'Neon glow, webs, highlights'));
    apSec.appendChild(this.row('Glass blur', this.bound(this.slider(
      () => s().blur, (v) => void settings.update({ blur: v }),
      0, 30, 1, (v) => `${v}px`,
    ))));
    scroll.appendChild(apSec);

    /* ---------- widgets ---------- */
    const wSec = this.section('Widgets');
    wSec.appendChild(this.row('24-hour clock', this.bound(this.switchCtl(
      () => s().clock24, (v) => void settings.update({ clock24: v }), 'Toggle 24 hour clock',
    ))));
    wSec.appendChild(this.row('Show seconds', this.bound(this.switchCtl(
      () => s().showSeconds, (v) => void settings.update({ showSeconds: v }), 'Toggle seconds',
    ))));
    wSec.appendChild(this.row('Show date', this.bound(this.switchCtl(
      () => s().showDate, (v) => void settings.update({ showDate: v }), 'Toggle date',
    ))));
    wSec.appendChild(this.row('Show greeting', this.bound(this.switchCtl(
      () => s().showGreeting, (v) => void settings.update({ showGreeting: v }), 'Toggle greeting',
    ))));
    wSec.appendChild(this.row('Your name', this.bound(this.textInput(
      () => s().userName, (v) => void settings.update({ userName: v }), 'for the greeting',
    ))));
    wSec.appendChild(this.row('Battery indicator', this.bound(this.switchCtl(
      () => s().showBattery, (v) => void settings.update({ showBattery: v }), 'Toggle battery indicator',
    ))));
    wSec.appendChild(this.row('Weather', this.bound(this.switchCtl(
      () => s().weatherEnabled, (v) => void settings.update({ weatherEnabled: v }), 'Toggle weather',
    ))));
    const unitSel = el('select', 'select') as HTMLSelectElement;
    const optC = new Option('°C — Celsius', 'c');
    const optF = new Option('°F — Fahrenheit', 'f');
    unitSel.append(optC, optF);
    const paintUnit = (): void => { unitSel.value = s().weatherUnit; };
    (unitSel as unknown as { _paint: () => void })._paint = paintUnit;
    unitSel.addEventListener('change', () => void settings.update({ weatherUnit: unitSel.value as 'c' | 'f' }));
    paintUnit();
    wSec.appendChild(this.row('Temperature unit', this.bound(unitSel)));
    wSec.appendChild(this.row('Weather city', this.bound(this.textInput(
      () => s().weatherCity, (v) => void settings.update({ weatherCity: v }), 'blank = Karachi',
    ))));
    scroll.appendChild(wSec);

    /* ---------- shortcuts ---------- */
    const lSec = this.section('Quick links');
    const presetBtn = el('button', 'btn', 'Apply particle preset');
    presetBtn.type = 'button';
    presetBtn.title = 'Use the dark particle look and reference shortcut list; keeps your other settings';
    presetBtn.addEventListener('click', () => {
      if (window.confirm('Replace your shortcut list and appearance with the particle preset? Other preferences will stay unchanged.')) {
        void settings.update(referencePreset());
      }
    });
    lSec.appendChild(this.row('Reference defaults', presetBtn, 'Dark particles + the curated shortcut list'));

    lSec.appendChild(this.row('Import bookmarks', this.bound(this.switchCtl(
      () => s().importBookmarks, (v) => void settings.update({ importBookmarks: v }),
      'Merge your browser bookmarks into the links bar',
    ))));
    lSec.appendChild(this.row('Sort by usage', this.bound(this.switchCtl(
      () => s().sortByUsage, (v) => void settings.update({ sortByUsage: v }), 'Toggle sort by usage',
    ))));
    const list = el('div', 'link-editor');
    const renderList = (): void => {
      list.textContent = '';
      for (const sc of s().shortcuts) {
        const item = el('div', 'link-edit-row');
        const label = el('span', 'link-edit-label', sc.title);
        label.title = sc.url;
        const tog = this.switchCtl(
          () => s().shortcuts.find((x) => x.id === sc.id)?.enabled ?? false,
          (v) => {
            const shortcuts = s().shortcuts.map((x) => (x.id === sc.id ? { ...x, enabled: v } : x));
            void settings.update({ shortcuts });
          },
          `Toggle ${sc.title}`,
        );
        const del = el('button', 'link-del', '✕');
        del.type = 'button';
        del.setAttribute('aria-label', `Remove ${sc.title}`);
        del.addEventListener('click', () => {
          void settings.update({ shortcuts: s().shortcuts.filter((x) => x.id !== sc.id) });
          renderList();
        });
        item.append(tog, label, del);
        list.appendChild(item);
      }
    };
    renderList();
    settings.subscribe(() => renderList());
    lSec.appendChild(list);

    const addWrap = el('div', 'link-add');
    const nameIn = el('input', 'text-input') as HTMLInputElement;
    nameIn.placeholder = 'Name';
    const urlIn = el('input', 'text-input') as HTMLInputElement;
    urlIn.placeholder = 'https://…';
    const addBtn = el('button', 'btn', 'Add link');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      const title = nameIn.value.trim().slice(0, 24);
      let url = urlIn.value.trim();
      if (!title || !url) return;
      if (!/^https?:\/\//.test(url)) url = `https://${url}`;
      const id = `custom-${Date.now().toString(36)}`;
      void settings.update({ shortcuts: [...s().shortcuts, { id, title, url, enabled: true }] });
      nameIn.value = '';
      urlIn.value = '';
    });
    addWrap.append(nameIn, urlIn, addBtn);
    lSec.appendChild(addWrap);
    scroll.appendChild(lSec);

    /* ---------- system ---------- */
    const sysSec = this.section('System');
    sysSec.appendChild(this.row('Performance mode', this.bound(this.switchCtl(
      () => s().performanceMode, (v) => void settings.update({ performanceMode: v }), 'Toggle performance mode',
    )), 'Lower resolution & effects, same vibes'));
    sysSec.appendChild(this.row('Sound', this.bound(this.switchCtl(
      () => s().sound, (v) => void settings.update({ sound: v }), 'Toggle sound',
    )), 'Subtle thwips, landings & rain ambience'));
    sysSec.appendChild(this.row('Volume', this.bound(this.slider(
      () => s().volume, (v) => void settings.update({ volume: v }),
      0, 1, 0.05, (v) => `${Math.round(v * 100)}%`,
    ))));

    const danger = el('div', 'set-actions');
    const exportBtn = el('button', 'btn', 'Export');
    exportBtn.type = 'button';
    exportBtn.title = 'Download settings as JSON';
    exportBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(s(), null, 2)], { type: 'application/json' });
      const a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hypertab-settings.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    const importBtn = el('button', 'btn', 'Import');
    importBtn.type = 'button';
    importBtn.title = 'Load settings from JSON';
    importBtn.addEventListener('click', () => {
      const inp = el('input') as HTMLInputElement;
      inp.type = 'file';
      inp.accept = 'application/json';
      inp.addEventListener('change', () => {
        const file = inp.files?.[0];
        if (!file) return;
        void file.text().then((text) => {
          try {
            const parsed = JSON.parse(text) as Partial<Settings>;
            void settings.update(parsed);
          } catch {
            /* invalid file — ignore */
          }
        });
      });
      inp.click();
    });
    const resetBtn = el('button', 'btn btn-danger', 'Reset');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => {
      void settings.update({ ...DEFAULT_SETTINGS });
    });
    danger.append(exportBtn, importBtn, resetBtn);
    sysSec.appendChild(danger);
    scroll.appendChild(sysSec);

    const footer = el('footer', 'set-footer');
    footer.appendChild(el('span', '', 'HyprTab v1.0 — handcrafted, offline, yours.'));
    scroll.appendChild(footer);

    this.panel.appendChild(scroll);
  }
}
