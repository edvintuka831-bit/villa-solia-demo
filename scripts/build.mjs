// Static build: renders src/templates/index.html once per language into
// dist/{bs,en,de}/index.html, copies assets and writes SEO files.
//
// SITE_URL sets the absolute URL used for canonical/hreflang/sitemap.

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../src/lib/booking.js";
import { ICONS } from "./icons.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const SITE_URL = (process.env.SITE_URL || "https://demo.villasolia.example").replace(/\/$/, "");
export const LANGS = ["bs", "en", "de"];
const DEFAULT_LANG = "bs";

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function lookup(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function render(template, vars, raw) {
  return template.replace(/\{\{([\w.:]+)\}\}/g, (match, key) => {
    if (key.startsWith("icon:")) {
      const icon = ICONS[key.slice(5)];
      if (!icon) throw new Error(`Unknown icon ${key}`);
      return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
    }
    if (key in raw) return raw[key];
    const value = lookup(vars, key);
    if (value === undefined) throw new Error(`Missing translation for "${key}"`);
    return escapeHtml(value);
  });
}

function jsonLd(t, lang) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: "Villa Solia Blagaj",
    description: t.meta.description,
    url: `${SITE_URL}/${lang}/`,
    image: `${SITE_URL}/assets/img/og-image.png`,
    telephone: "+387 00 000 000",
    email: "info@example.com",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Blagaj",
      postalCode: "88201",
      addressRegion: "Mostar",
      addressCountry: "BA",
    },
    geo: { "@type": "GeoCoordinates", latitude: 43.2567, longitude: 17.8889 },
    amenityFeature: ["pool", "wifi", "ac", "parking", "kitchen", "bbq"].map((k) => ({
      "@type": "LocationFeatureSpecification",
      name: t.amenities[k],
      value: true,
    })),
    availableLanguage: ["bs", "en", "de"],
  }).replace(/</g, "\\u003c");
}

function langSwitcher(current, t) {
  const items = LANGS.map((l) => {
    const attrs = l === current ? ' aria-current="true"' : "";
    return `<li><a href="../${l}/" hreflang="${l}" lang="${l}"${attrs}>${l.toUpperCase()}</a></li>`;
  }).join("");
  return `        <ul class="lang-switch" aria-label="${escapeHtml(t.nav.language)}">${items}</ul>`;
}

function alternates() {
  const links = LANGS.map((l) => `  <link rel="alternate" hreflang="${l}" href="${SITE_URL}/${l}/">`);
  links.push(`  <link rel="alternate" hreflang="x-default" href="${SITE_URL}/${DEFAULT_LANG}/">`);
  return links.join("\n");
}

function clientStrings(t) {
  return JSON.stringify({
    lang: t.meta.htmlLang,
    booking: t.booking,
    errors: t.errors,
    nav: { menu: t.nav.menu, close: t.nav.close },
    config: CONFIG,
  }).replace(/</g, "\\u003c");
}

async function main() {
  const template = await readFile(join(SRC, "templates", "index.html"), "utf8");
  const translations = Object.fromEntries(
    await Promise.all(LANGS.map(async (l) => [l, JSON.parse(await readFile(join(SRC, "i18n", `${l}.json`), "utf8"))])),
  );
  checkKeysMatch(translations);

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const lang of LANGS) {
    const t = translations[lang];
    const guestOptions = Array.from({ length: CONFIG.maxGuests }, (_, i) => {
      const n = i + 1;
      return `<option value="${n}"${n === 2 ? " selected" : ""}>${n}</option>`;
    }).join("");
    const html = render(template, t, {
      lang,
      siteUrl: SITE_URL,
      year: String(new Date().getFullYear()),
      alternates: alternates(),
      langSwitcher: langSwitcher(lang, t),
      jsonLd: jsonLd(t, lang),
      i18nJson: clientStrings(t),
      guestOptions,
    });
    await mkdir(join(DIST, lang), { recursive: true });
    await writeFile(join(DIST, lang, "index.html"), html);
  }

  await cp(join(SRC, "assets"), join(DIST, "assets"), { recursive: true });
  await cp(join(SRC, "lib"), join(DIST, "assets", "lib"), { recursive: true });
  await cp(join(SRC, "admin"), join(DIST, "admin"), { recursive: true });
  for (const f of ["index.html", "404.html", "site.webmanifest", "_headers", "_redirects", "netlify.toml"]) {
    await cp(join(SRC, "root", f), join(DIST, f));
  }

  // DEMO: disallow crawling. For production use "Allow: /" and keep the sitemap line.
  await writeFile(join(DIST, "robots.txt"), `User-agent: *\nDisallow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  await writeFile(join(DIST, "sitemap.xml"), sitemap());

  console.log(`Build OK → dist/ (${LANGS.join(", ")}) SITE_URL=${SITE_URL}`);
}

function sitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const alt = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE_URL}/${l}/"/>`).join("\n");
  const urls = LANGS.map(
    (l) => `  <url>\n    <loc>${SITE_URL}/${l}/</loc>\n    <lastmod>${today}</lastmod>\n${alt}\n  </url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

function flatKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

export function checkKeysMatch(translations) {
  const [base, ...rest] = LANGS;
  const baseKeys = flatKeys(translations[base]).sort().join("\n");
  for (const l of rest) {
    if (flatKeys(translations[l]).sort().join("\n") !== baseKeys) {
      throw new Error(`Translation keys in ${l}.json differ from ${base}.json`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
