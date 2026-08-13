/**
 * Final verification: console must stay silent, panel chips must have
 * poster images, wallpaper switching must apply, spider toggle must work.
 */
import puppeteer from 'puppeteer';

const EXT = new URL('..', import.meta.url).pathname;
const OUT = new URL('../shots', import.meta.url).pathname;

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
const issues = [];
page.on('console', (m) => { if (m.type() === 'error') issues.push(m.text()); });
page.on('pageerror', (e) => issues.push(e.message));

await page.goto('chrome://newtab', { waitUntil: 'domcontentloaded' });
await page.bringToFront();
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
});
await new Promise((r) => setTimeout(r, 2500));

/* open settings → verify poster chips → switch wallpaper via UI */
await page.click('#settings-gear');
await new Promise((r) => setTimeout(r, 900));
const checks = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('.wall-chip')];
  const withPosters = chips.filter((c) => c.style.background.includes('assets/wallpapers')).length;
  return {
    chipCount: chips.length,
    withPosters,
    switches: document.querySelectorAll('.switch').length,
    sliders: document.querySelectorAll('input[type=range]').length,
    sections: document.querySelectorAll('.set-title').length,
  };
});
console.log('panel checks:', JSON.stringify(checks));

/* switch wallpaper to "space" through the actual UI button */
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.wall-option')];
  const target = btns.find((b) => b.textContent?.includes('Deep Space'));
  target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 2000));
const posterVar = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--scene-poster'));
console.log('scene-poster var after switch:', posterVar.trim());

/* close panel — spider should swing back in */
await page.click('.set-close');
await new Promise((r) => setTimeout(r, 1600));
await page.screenshot({ path: `${OUT}/final-hero.png` });

console.log(issues.length ? `❌ console issues:\n${issues.join('\n')}` : '✅ console clean');
await browser.close();
