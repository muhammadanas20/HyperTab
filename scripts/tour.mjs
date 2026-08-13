/**
 * Scene tour — switch wallpapers through the settings store and capture
 * each one, then the settings panel, then the popup page.
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const EXT = new URL('..', import.meta.url).pathname;
const OUT = new URL('../shots/tour', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 45000,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--window-size=1440,900',
  ],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('chrome://newtab', { waitUntil: 'domcontentloaded' });
await page.bringToFront();
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
});
await new Promise((r) => setTimeout(r, 1500));

const scenes = ['neonStreet', 'mountains', 'forest', 'space', 'aurora', 'particles'];
for (const scene of scenes) {
  await page.evaluate(async (id) => {
    const KEY = 'hypertab:settings';
    const stored = await chrome.storage.sync.get(KEY);
    const s = stored[KEY];
    s.wallpaper = id;
    if (id === 'mountains' || id === 'aurora') s.snow = true;
    await chrome.storage.sync.set({ [KEY]: s });
  }, scene);
  await new Promise((r) => setTimeout(r, 2600));
  await page.screenshot({ path: `${OUT}/scene-${scene}.png` });
  console.log('scene:', scene);
}

/* settings panel open */
await page.click('#settings-gear');
await new Promise((r) => setTimeout(r, 1400));
await page.screenshot({ path: `${OUT}/settings-panel.png` });
console.log('settings panel');
await page.click('.set-close');

/* popup (open as a page inside the extension origin) */
const extId = await page.evaluate(() => chrome.runtime.id);
const popup = await browser.newPage();
popup.on('pageerror', (e) => console.log('[popup pageerror]', e.message));
await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 900));
await popup.screenshot({ path: `${OUT}/popup.png` });
console.log('popup');

await browser.close();
