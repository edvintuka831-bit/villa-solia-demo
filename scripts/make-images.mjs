// One-off: renders PNG versions of our own SVG artwork (Apple touch icon and
// Open Graph image) with the preinstalled Chromium. Output is committed.
//   node scripts/make-images.mjs
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const IMG = fileURLToPath(new URL("../src/assets/img/", import.meta.url));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();

async function shot(html, width, height, out) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0">${html}</body></html>`);
  await page.screenshot({ path: join(IMG, out) });
}

const favicon = await readFile(join(IMG, "favicon.svg"), "utf8");
await shot(`<div style="width:180px;height:180px;background:#c0673f">${favicon.replace("<svg", '<svg width="180" height="180"')}</div>`, 180, 180, "apple-touch-icon.png");

const hero = await readFile(join(IMG, "hero.svg"), "utf8");
await shot(
  `<div style="position:relative;width:1200px;height:630px;overflow:hidden">${hero.replace("<svg", '<svg width="1200" height="630"')}
   <div style="position:absolute;left:60px;bottom:60px;color:#fff;font:600 72px Georgia,serif;text-shadow:0 2px 20px rgba(0,0,0,.4)">Villa Solia<div style="font:500 30px system-ui,sans-serif;letter-spacing:.2em">BLAGAJ · DEMO</div></div></div>`,
  1200, 630, "og-image.png",
);
await browser.close();
console.log("PNG images written to src/assets/img/");
