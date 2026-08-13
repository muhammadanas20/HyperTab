/**
 * Smoke test v2 — run the page ~40s, log every spider state change via
 * an in-page watcher, and keep trying screenshots. A freeze will make
 * CDP calls time out; the last logged state identifies the culprit.
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const EXT = new URL('..', import.meta.url).pathname;
const OUT = new URL('../shots', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  dumpio: false,
  protocolTimeout: 8000,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1440,900',
  ],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  window.addEventListener('error', (e) => console.log('ONERR:', e.message, '@', e.filename, e.lineno));
  window.addEventListener('unhandledrejection', (e) => console.log('ONREJ:', e.reason?.message ?? String(e.reason)));
});
const logs = [];
page.on('console', (m) => {
  const t = m.text();
  logs.push(t);
  if (t.startsWith('[console.error]') || t.startsWith('SPIDER ERR')) console.log(t);
});
page.on('pageerror', (e) => { logs.push(`[pageerror] ${e.message}`); console.log('[pageerror]', e.message); });
page.on('error', (e) => console.log('PAGE CRASH:', e.message));

await page.goto('chrome://newtab', { waitUntil: 'domcontentloaded', timeout: 30000 });

await page.evaluate(() => {
  const sp = window.__spider;
  let last = '';
  let rafN = 0;
  const countRaf = () => { rafN++; requestAnimationFrame(countRaf); };
  requestAnimationFrame(countRaf);
  setInterval(() => {
    try {
      const b = sp.behavior;
      const s = `raf=${rafN}|${sp.mode}|${b ? b.kind : '-'}|t=${b ? b.t.toFixed(1) : '-'}|${Math.round(sp.pos.x)},${Math.round(sp.pos.y)}|gap=${sp.idleGap?.toFixed?.(1)}`;
      if (s !== last) { last = s; console.log('SPIDER', s); }
      if (!s.startsWith(last)) console.log('SPIDER ERR');
      last = s;
    } catch (e) { console.log('SPIDER ERR watcher', e.message); }
  }, 250);
});

await new Promise((r) => setTimeout(r, 9000));
try {
  await page.evaluate(() => window.__spider.onDoubleClick(700, 300));
  console.log('dblclick issued');
} catch (e) { console.log('dblclick eval issue:', e.constructor.name); }

let alive = true;
for (let sec = 2; sec <= 46; sec += 2) {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    await page.screenshot({ path: `${OUT}/f-${String(sec).padStart(2, '0')}.png` });
    if (sec % 10 === 0) console.log(`alive at ${sec}s`);
  } catch (e) {
    console.log(`FROZEN at ~${sec}s: ${e.constructor.name}`);
    alive = false;
    break;
  }
}
if (alive) console.log('still alive at 46s');
const diag = await page.evaluate(() => ({
  vis: document.visibilityState,
  hidden: document.hidden,
  running: window.__spider.running,
  spiderRaf: window.__spider.raf,
  matchMedia: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
})).catch((e) => ({ evalErr: e.message }));
console.log('diag:', JSON.stringify(diag));
console.log('--- spider trace (last 25) ---');
logs.slice(-25).forEach((l) => console.log(l));
await browser.close().catch(() => {});
process.exit(0);
