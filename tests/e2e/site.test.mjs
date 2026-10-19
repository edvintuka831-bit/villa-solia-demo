// Browser tests on an emulated iPhone (390×844, touch, mobile UA) using the
// preinstalled Chromium. Saves screenshots to screenshots/.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SHOTS = join(ROOT, "screenshots");
const iPhone = { ...devices["iPhone 13"] };
delete iPhone.defaultBrowserType;

let browser, server, base, dir;

before(async () => {
  assert.ok(existsSync(join(ROOT, "dist", "bs", "index.html")), "run `npm run build` first");
  dir = await mkdtemp(join(tmpdir(), "solia-e2e-"));
  process.env.DB_FILE = join(dir, "db.json");
  const { start } = await import("../../server.mjs");
  server = await start({ port: 0, host: "127.0.0.1" });
  base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_PATH;
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  await mkdir(SHOTS, { recursive: true });
});

after(async () => {
  await browser?.close();
  server?.close();
  await rm(dir, { recursive: true, force: true });
});

async function newPage(options = iPhone) {
  const context = await browser.newContext({ ...options, locale: "bs-BA" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { page, context, errors };
}

/** Clicks through the calendar until it finds `nights` consecutive free nights. */
async function pickFreeRange(page, nights) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const days = await page.$$eval("#calendar .day", (els) =>
      els.map((b) => ({ date: b.dataset.date, free: !b.disabled && !b.classList.contains("booked") && !b.classList.contains("past") })),
    );
    for (let i = 0; i + nights < days.length; i++) {
      if (days.slice(i, i + nights).every((d) => d.free)) {
        await page.tap(`#calendar .day[data-date="${days[i].date}"]`);
        await page.tap(`#calendar .day[data-date="${days[i + nights].date}"]`);
        return { arrival: days[i].date, departure: days[i + nights].date };
      }
    }
    await page.tap('#calendar [data-cal="next"]');
  }
  throw new Error("no free range found");
}

for (const lang of ["bs", "en", "de"]) {
  test(`${lang}: mobile page renders without errors or horizontal scroll`, async () => {
    const { page, context, errors } = await newPage();
    await page.goto(`${base}/${lang}/`, { waitUntil: "networkidle" });
    assert.equal(await page.getAttribute("html", "lang"), lang);
    assert.equal(await page.locator('link[rel="alternate"][hreflang]').count(), 4);
    assert.ok((await page.title()).includes("Villa Solia"));
    assert.ok((await page.getAttribute('meta[name="description"]', "content")).length > 50);
    assert.equal(await page.locator("h1").count(), 1);
    const ld = JSON.parse(await page.textContent('script[type="application/ld+json"]'));
    assert.equal(ld["@type"], "LodgingBusiness");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `horizontal overflow ${overflow}px`);
    await page.waitForSelector("#calendar .day");
    assert.equal(await page.locator("#calendar .month").count(), 1, "one month on phones");
    assert.ok((await page.locator("#calendar .day.booked").count()) + (await page.locator("#calendar .day").count()) > 0);
    await page.screenshot({ path: join(SHOTS, `iphone-${lang}-top.png`) });
    await page.locator("#booking").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOTS, `iphone-${lang}-booking.png`), fullPage: false });
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("mobile menu opens, closes and switches language", async () => {
  const { page, context } = await newPage();
  await page.goto(`${base}/bs/`);
  assert.equal(await page.isVisible("#site-nav .nav-list"), false);
  await page.tap(".nav-toggle");
  await page.waitForSelector("#site-nav.open");
  await page.screenshot({ path: join(SHOTS, "iphone-menu.png") });
  await page.tap('#site-nav a[hreflang="de"]');
  await page.waitForURL(/\/de\/$/);
  assert.equal(await page.textContent("h1"), "Ruhe, Sonne und herzegowinischer Stein");
  await context.close();
});

test("booking inquiry end-to-end: validation, submit, admin confirm, calendar blocked", async () => {
  const { page, context, errors } = await newPage();
  await page.goto(`${base}/en/#booking`);
  await page.waitForSelector("#calendar .day");

  await page.tap('#inquiry-form button[type="submit"]');
  await page.waitForSelector("#form-error:not([hidden])");
  assert.match(await page.textContent("#name-error"), /full name/);

  const range = await pickFreeRange(page, 3);
  assert.equal(await page.inputValue("#arrival"), range.arrival);
  assert.equal(await page.inputValue("#departure"), range.departure);
  assert.match(await page.textContent("#nights-summary"), /3 nights/);

  await page.fill("#name", "E2E Tester");
  await page.fill("#email", "e2e@example.com");
  await page.fill("#phone", "+387 61 555 444");
  await page.selectOption("#guests", "5");
  await page.tap('#inquiry-form button[type="submit"]');
  await page.waitForSelector("#form-success:not([hidden])");
  await page.screenshot({ path: join(SHOTS, "iphone-inquiry-success.png") });

  // Admin
  const adminPage = await context.newPage();
  await adminPage.goto(`${base}/admin/`);
  await adminPage.fill("#password", "wrong");
  await adminPage.tap('#login-form button[type="submit"]');
  await adminPage.waitForSelector("#password-error:has-text('Pogrešna')");
  await adminPage.fill("#password", "demo1234");
  await adminPage.tap('#login-form button[type="submit"]');
  const card = adminPage.locator(".inquiry", { hasText: "E2E Tester" });
  await card.waitFor();
  assert.match(await card.textContent(), /e2e@example.com/);
  await adminPage.screenshot({ path: join(SHOTS, "iphone-admin.png"), fullPage: false });
  await card.locator('[data-act="confirmed"]').tap();
  await adminPage.waitForSelector(".inquiry.status-confirmed:has-text('E2E Tester')");

  // Public calendar now shows those nights as booked
  await page.reload();
  await page.waitForSelector("#calendar .day");
  await page.evaluate((d) => document.getElementById("arrival").value = d, range.arrival);
  await page.dispatchEvent("#arrival", "change");
  await page.waitForSelector(`#calendar .day.booked[data-date="${range.arrival}"]`);
  assert.deepEqual(errors, []);
  await context.close();
});

test("admin can manually block a period", async () => {
  const { page, context, errors } = await newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/admin/`);
  await page.fill("#password", "demo1234");
  await page.click('#login-form button[type="submit"]');
  await page.waitForSelector("#admin-view:not([hidden])");
  const before = Number(await page.textContent("#stat-blocks"));
  const start = new Date(Date.now() + 300 * 864e5).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 303 * 864e5).toISOString().slice(0, 10);
  await page.fill("#block-start", start);
  await page.fill("#block-end", end);
  await page.fill("#block-note", "E2E blok");
  await page.click('#block-form button[type="submit"]');
  await page.waitForFunction((n) => Number(document.getElementById("stat-blocks").textContent) === n + 1, before);
  assert.ok(await page.isVisible(".blocks li:has-text('E2E blok')"));
  await page.screenshot({ path: join(SHOTS, "desktop-admin.png"), fullPage: true });
  await page.click(".blocks li:has-text('E2E blok') button");
  await page.waitForFunction((n) => Number(document.getElementById("stat-blocks").textContent) === n, before);
  assert.deepEqual(errors, []);
  await context.close();
});

test("desktop layout shows two months", async () => {
  const { page, context, errors } = await newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto(`${base}/bs/`);
  await page.waitForSelector("#calendar .day");
  assert.equal(await page.locator("#calendar .month").count(), 2);
  await page.screenshot({ path: join(SHOTS, "desktop-bs.png") });
  assert.deepEqual(errors, []);
  await context.close();
});

test("static hosting fallback works without the API (localStorage)", async () => {
  const DIST = join(ROOT, "dist");
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
  const staticServer = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    try {
      const body = await readFile(join(DIST, p));
      res.writeHead(200, { "Content-Type": types[extname(p)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("nf");
    }
  });
  await new Promise((r) => staticServer.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${staticServer.address().port}`;
  const { page, context } = await newPage();
  await page.goto(`${url}/bs/`);
  await page.waitForSelector("#data-status:not([hidden])");
  await page.waitForSelector("#calendar .day.booked");
  await pickFreeRange(page, 2);
  await page.fill("#name", "Static Test");
  await page.fill("#email", "s@example.com");
  await page.fill("#phone", "+387 61 000 999");
  await page.tap('#inquiry-form button[type="submit"]');
  await page.waitForSelector("#form-success:not([hidden])");
  await context.close();
  staticServer.close();
});
