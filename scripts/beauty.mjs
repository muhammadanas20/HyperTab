/**
 * Beauty shots v2 — capture the webhead with a *known-good* camera:
 * freeze the wallpaper frame (removes the engine's own RAF churn so
 * headless software compositing keeps up) and force-visibility.
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const EXT = new URL('..', import.meta.url).pathname;
const OUT = new URL('../shots/beauty', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const target = process.argv[2]; // optional: run only one scenario for quick iteration
const ALL = [
  { name: '01-entrance', wait: 2600 },
  { name: '02-swing', act: `window.__spider.dispatch('swing')`, wait: 950 },
  { name: '03-swing-apex', wait: 750 },
  { name: '04-hang', act: `(() => { const s = window.__spider; s.behavior = null; s.dispatch('hang'); })()`, wait: 2400 },
  { name: '05-sit', act: `(() => { const s = window.__spider; s.rope.detach(); s.mode='air'; s.vel={x:0,y:80}; s.behavior=null; })()`, wait: 1100, act2: `window.__spider.dispatch('sitGround')`, wait2: 1500 },
  { name: '06-wave', act: `(() => { const s = window.__spider; s.behavior = null; s.dispatch('wave'); })()`, wait: 1300 },
  { name: '07-hammock', act: `(() => { const s = window.__spider; s.behavior = null; s.dispatch('hammock'); })()`, wait: 2500 },
  { name: '08-crawl', act: `(() => { const s = window.__spider; s.behavior = null; s.mode = 'ground'; s.pos.y = innerHeight - 14; s.dispatch('crawlWall'); })()`, wait: 2100 },
  { name: '09-curious', act: `(() => { const s = window.__spider; s.behavior = null; s.mode='ground'; s.pos={x: innerWidth/2 - 240, y: innerHeight-14}; s.setPose('curious', 5); s.onSearchHover(true); })()`, wait: 1500 },
];

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
    '--disable-background-timer-throttling',
    '--window-size=1440,900',
  ],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('chrome://newtab', { waitUntil: 'domcontentloaded' });
await page.bringToFront();
// hold the tab "visible" regardless of occlusion heuristics
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
});

for (const step of ALL) {
  if (target && step.name !== target) continue;
  try {
    if (step.act) await page.evaluate(step.act);
    if (step.wait) await new Promise((r) => setTimeout(r, step.wait));
    if (step.act2) await page.evaluate(step.act2);
    if (step.wait2) await new Promise((r) => setTimeout(r, step.wait2));
    await page.screenshot({ path: `${OUT}/${step.name}.png` });
    console.log('shot:', step.name);
  } catch (e) {
    console.log('step failed:', step.name, e.message);
  }
}

await browser.close();
