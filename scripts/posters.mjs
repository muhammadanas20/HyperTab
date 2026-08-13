/**
 * Poster capture — renders each wallpaper scene headlessly in bare mode
 * and saves a small, compressed still into assets/wallpapers/.
 * These posters back the settings-panel chips and the first-paint layer.
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const EXT = new URL('..', import.meta.url).pathname;

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
    '--window-size=1280,720',
  ],
  defaultViewport: { width: 1280, height: 720 },
});

const page = await browser.newPage();
await page.goto('chrome://newtab#bare', { waitUntil: 'domcontentloaded' });
await page.bringToFront();
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  // stop the webhead from photobombing the posters
  const s = window.__spider;
  if (s) { s.enabled = false; s.stop(); }
});
await new Promise((r) => setTimeout(r, 1200));

const scenes = ['cityRain', 'neonStreet', 'mountains', 'forest', 'space', 'aurora', 'particles'];
mkdirSync(new URL('../assets/wallpapers', import.meta.url).pathname, { recursive: true });

for (const scene of scenes) {
  await page.evaluate(async (id) => {
    const KEY = 'hypertab:settings';
    const stored = await chrome.storage.sync.get(KEY);
    const s = stored[KEY];
    s.wallpaper = id;
    s.rain = id === 'cityRain' || id === 'neonStreet';
    s.snow = id === 'mountains';
    await chrome.storage.sync.set({ [KEY]: s });
  }, scene);
  await new Promise((r) => setTimeout(r, 2400));
  await page.screenshot({
    path: new URL(`../assets/wallpapers/${scene}.jpg`, import.meta.url).pathname,
    type: 'jpeg',
    quality: 84,
  });
  console.log('poster:', scene);
}

await browser.close();
