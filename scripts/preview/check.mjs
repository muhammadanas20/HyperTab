/** Run `npm run build && npm run preview` first.
 * Optional PUPPETEER_EXECUTABLE_PATH for an installed Chromium binary.
 */
import puppeteer from "puppeteer";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-zygote",
    "--single-process",
  ],
  defaultViewport: { width: 1440, height: 900 },
});
try {
  const page = await browser.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Test offline. All curated icons must still load; weather is optional.
  await page.setRequestInterception(true);
  page.on("request", (r) =>
    r.url().startsWith("http") && !r.url().includes("localhost:4173")
      ? r.abort()
      : r.continue(),
  );
  await page.goto("http://localhost:4173", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.__spider);
  assert.equal(await page.$$eval(".link-tile", (ns) => ns.length), 11);
  assert.ok(
    await page.$$eval(".link-icon img", (ns) =>
      ns.every((n) => n.complete && n.naturalWidth > 0),
    ),
  );
  await page.keyboard.press("/");
  assert.equal(
    await page.$eval("#search-input", (el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  await page.$eval("#search-input", (el) => el.blur());
  // Deterministic contact and pose rendering for every behavior, in-browser.
  const behaviorChecks = await page.evaluate(() => {
    const s = window.__spider;
    s.stop();
    s.fleeCooldown = 999;
    s.globalEggGap = 999;
    let frames = 0,
      start = performance.now();
    for (const kind of [
      "walk",
      "run",
      "hop",
      "swing",
      "hang",
      "sitGround",
      "perch",
      "crouch",
      "crawlWall",
      "peek",
      "hide",
      "sleep",
      "hammock",
      "watch",
      "wave",
      "salute",
      "idle",
    ]) {
      s.rope.detach();
      s.mode = "ground";
      s.pos = { x: 700, y: innerHeight - 14 };
      s.vel = { x: 0, y: 0 };
      s.alpha = 1;
      s.behavior = null;
      s.idleGap = 999;
      s.rotation = s.targetRotation = 0;
      s.dispatch(kind);
      for (let i = 0; i < 45; i++) {
        s.update(1 / 60);
        s.draw();
        frames++;
      }
      if (![s.pos.x, s.pos.y, s.rotation].every(Number.isFinite))
        throw Error(kind + " invalid state");
    }
    return { frames, ms: Math.round(performance.now() - start) };
  });
  console.log("Browser rendering:", behaviorChecks);
  // Actual settings path applies preset, changes links live, persists on reload.
  await page.click("#settings-gear");
  assert.equal(
    await page.$eval("#settings-panel", (e) => e.getAttribute("aria-hidden")),
    "false",
  );
  await page.evaluate(async () => {
    const key = "hypertab:settings";
    await chrome.storage.sync.set({
      [key]: {
        wallpaper: "forest",
        shortcuts: [
          {
            id: "custom",
            title: "My link",
            url: "https://example.com",
            enabled: true,
          },
        ],
        spiderEnabled: false,
        userName: "Anas",
      },
    });
  });
  assert.equal(
    await page.$$eval(".link-label", (ns) =>
      ns.map((n) => n.textContent).join(","),
    ),
    "My link",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__spider);
  assert.equal(
    await page.$$eval(".link-label", (ns) =>
      ns.map((n) => n.textContent).join(","),
    ),
    "My link",
  );
  assert.equal(await page.evaluate(() => window.__spider.enabled), false);
  await page.click("#settings-gear");
  page.once("dialog", (d) => d.accept());
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((n) => n.textContent === "Apply particle preset")
      .click(),
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".link-tile").length === 11,
  );
  const saved = await page.evaluate(
    async () =>
      (await chrome.storage.sync.get("hypertab:settings"))["hypertab:settings"],
  );
  assert.equal(saved.userName, "Anas");
  assert.equal(saved.spiderEnabled, false);
  assert.equal(saved.wallpaper, "particles");
  // A saved disabled character can be re-enabled from the actual panel control.
  await page.click('button[aria-label="Toggle the spider"]');
  assert.equal(await page.evaluate(() => window.__spider.enabled), true);
  await page.click(".set-close");
  await page.keyboard.press("/");
  assert.equal(
    await page.$eval("#search-input", (el) => el === document.activeElement),
    true,
  );
  await page.$eval("#search-input", (el) => el.blur());
  // Clean screenshot at default appearance and a posed hero at actual desktop size.
  await page.evaluate(async () => {
    const key = "hypertab:settings",
      s = (await chrome.storage.sync.get(key))[key];
    await chrome.storage.sync.set({
      [key]: { ...s, userName: "", weatherEnabled: false },
    });
    const sp = window.__spider;
    sp.stop();
    sp.rope.detach();
    sp.mode = "ground";
    sp.pos = { x: 1070, y: innerHeight - 14 };
    sp.rotation = sp.targetRotation = 0;
    sp.behavior = null;
    sp.poseTweak = null;
    sp.walkPhase = -1;
    sp.headTilt = sp.headTiltTarget = 0;
    sp.idleGap = 999;
    sp.alpha = 1;
    sp.setPose("stand", 12);
    for (let i = 0; i < 90; i++) sp.update(1 / 60);
    sp.draw();
  });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".settings-backdrop")).opacity ===
      "0",
  );
  await mkdir("docs", { recursive: true });
  await page.screenshot({
    path: "docs/particle-default.jpg",
    type: "jpeg",
    quality: 88,
  });
  await page.setViewport({ width: 390, height: 700, deviceScaleFactor: 2 });
  await page.evaluate(() => window.__spider.draw());
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  // Reduced motion remains visible but does not roam/gesture.
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__spider);
  const motion = await page.evaluate(() => {
    const s = window.__spider;
    s.stop();
    const before = JSON.stringify(s.pos);
    for (let i = 0; i < 120; i++) s.update(1 / 60);
    s.draw();
    return {
      before,
      after: JSON.stringify(s.pos),
      alpha: s.alpha,
      walk: s.walkPhase,
    };
  });
  assert.equal(motion.before, motion.after);
  assert.equal(motion.alpha, 1);
  assert.equal(motion.walk, -1);
  assert.deepEqual(errors, []);
  console.log(
    "✓ Offline icons, 17 rendered behaviors, keyboard, preset, persistence, enable toggle, mobile DPR 2, reduced motion; no page errors",
  );
} finally {
  await browser.close();
}
