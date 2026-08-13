import puppeteer from 'puppeteer';
const EXT = '/home/user/hypertab';
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 45000,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('requestfailed', r => console.log('FAILED:', r.url(), r.failure()?.errorText));
page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
await page.goto('chrome://newtab', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 3000));
await browser.close();
