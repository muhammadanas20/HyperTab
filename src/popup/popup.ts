/**
 * Toolbar popup — quick status + the three most-used toggles.
 * Writes straight to the settings store; any open new tab reacts live.
 * Includes a button that opens a fresh tab with the settings panel out.
 */
import { settings } from '../settings/store';
import { SCENE_LABELS } from '../scene/scenes';
import { $, el } from '../utils/helpers';

const OPEN_PANEL_KEY = 'hypertab:openPanel';

function toggleRow(label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement {
  const row = el('div', 'pop-row');
  row.appendChild(el('span', 'pop-label', label));
  const btn = el('button', 'switch');
  btn.type = 'button';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-label', `Toggle ${label}`);
  btn.appendChild(el('span', 'switch-knob'));
  const paint = (): void => {
    btn.classList.toggle('on', get());
    btn.setAttribute('aria-checked', String(get()));
  };
  btn.addEventListener('click', () => {
    set(!get());
    paint();
  });
  paint();
  row.appendChild(btn);
  return row;
}

async function boot(): Promise<void> {
  const s = await settings.init();

  const statusText = (on: boolean): string => (on ? 'The webhead is roaming' : 'The webhead is off duty');
  $('#pop-scene').textContent = SCENE_LABELS[s.wallpaper];
  $('#pop-status').textContent = statusText(s.spiderEnabled);

  const list = $('#pop-toggles');
  list.append(
    toggleRow('Spider', () => settings.get().spiderEnabled, (v) => void settings.update({ spiderEnabled: v })),
    toggleRow('Rain', () => settings.get().rain, (v) => void settings.update({ rain: v })),
    toggleRow('Snow', () => settings.get().snow, (v) => void settings.update({ snow: v })),
    toggleRow('Sound', () => settings.get().sound, (v) => void settings.update({ sound: v })),
  );

  $('#pop-open-settings').addEventListener('click', () => {
    void chrome.storage.local.set({ [OPEN_PANEL_KEY]: true }).then(() => {
      void chrome.tabs.create({});
      window.close();
    });
  });

  $('#pop-newtab').addEventListener('click', () => {
    void chrome.tabs.create({});
    window.close();
  });

  // keep toggle labels truthful if another page changes settings meanwhile
  settings.subscribe((next) => {
    $('#pop-scene').textContent = SCENE_LABELS[next.wallpaper];
    $('#pop-status').textContent = statusText(next.spiderEnabled);
  });
}

void boot();
