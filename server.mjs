// Demo server: serves the built site from dist/ and a small JSON API backed by
// data/db.json. No external services, no e-mail, no real bookings.
//
//   node server.mjs               start on PORT (default 5173), all interfaces
//   node server.mjs --reset-only  regenerate test data and exit

import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addBlock,
  addInquiry,
  createSeed,
  deleteInquiry,
  publicAvailability,
  removeBlock,
  setInquiryStatus,
} from "./src/lib/store.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DIST = resolve(ROOT, "dist");
const DB_FILE = process.env.DB_FILE || join(ROOT, "data", "db.json");
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || "0.0.0.0";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "demo1234";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

let db;
let writeChain = Promise.resolve();

async function loadDb() {
  try {
    db = JSON.parse(await readFile(DB_FILE, "utf8"));
    if (!Array.isArray(db.inquiries) || !Array.isArray(db.blocks)) throw new Error("bad db");
  } catch {
    db = createSeed();
    await saveDb();
  }
}

function saveDb() {
  writeChain = writeChain.then(async () => {
    await mkdir(join(DB_FILE, ".."), { recursive: true });
    await writeFile(DB_FILE, JSON.stringify(db, null, 2));
  });
  return writeChain;
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...(isJson ? { "Content-Type": MIME[".json"], "Cache-Control": "no-store" } : {}),
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw Object.assign(new Error("too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("bad json"), { status: 400 });
  }
}

// Very small per-IP limiter for the public inquiry endpoint.
const hits = new Map();
function rateLimited(ip, limit = 10, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > limit;
}

function isAdmin(req) {
  return req.headers["x-admin-password"] === ADMIN_PASSWORD;
}

async function handleApi(req, res, url) {
  const path = url.pathname;
  const method = req.method;

  if (path === "/api/health" && method === "GET") return send(res, 200, { ok: true, mode: "demo" });

  if (path === "/api/availability" && method === "GET") return send(res, 200, publicAvailability(db));

  if (path === "/api/inquiries" && method === "POST") {
    if (rateLimited(req.socket.remoteAddress || "?")) return send(res, 429, { ok: false, errors: { form: "rate" } });
    const body = await readJson(req);
    if (body.website) return send(res, 201, { ok: true }); // honeypot: pretend success
    const result = addInquiry(db, body);
    if (!result.ok) return send(res, 422, result);
    await saveDb();
    // DEMO: no e-mail is sent; the inquiry only appears in the demo admin.
    return send(res, 201, { ok: true, id: result.inquiry.id });
  }

  if (!path.startsWith("/api/admin/")) return send(res, 404, { ok: false });
  if (!isAdmin(req)) return send(res, 401, { ok: false, errors: { auth: "invalid" } });

  if (path === "/api/admin/data" && method === "GET") return send(res, 200, { ok: true, ...db });

  const inquiryMatch = path.match(/^\/api\/admin\/inquiries\/([\w-]+)$/);
  if (inquiryMatch && method === "PATCH") {
    const body = await readJson(req);
    const result = setInquiryStatus(db, inquiryMatch[1], body.status);
    if (!result.ok) return send(res, result.errors.id ? 404 : 409, result);
    await saveDb();
    return send(res, 200, result);
  }
  if (inquiryMatch && method === "DELETE") {
    const result = deleteInquiry(db, inquiryMatch[1]);
    if (!result.ok) return send(res, 404, result);
    await saveDb();
    return send(res, 200, result);
  }

  if (path === "/api/admin/blocks" && method === "POST") {
    const result = addBlock(db, await readJson(req));
    if (!result.ok) return send(res, 422, result);
    await saveDb();
    return send(res, 201, result);
  }
  const blockMatch = path.match(/^\/api\/admin\/blocks\/([\w-]+)$/);
  if (blockMatch && method === "DELETE") {
    const result = removeBlock(db, blockMatch[1]);
    if (!result.ok) return send(res, 404, result);
    await saveDb();
    return send(res, 200, result);
  }

  if (path === "/api/admin/reset" && method === "POST") {
    db = createSeed();
    await saveDb();
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { ok: false });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const filePath = normalize(join(DIST, pathname));
  if (!filePath.startsWith(DIST + sep)) return send(res, 403, "Forbidden");

  let target = filePath;
  try {
    const s = await stat(target);
    if (s.isDirectory()) {
      res.writeHead(301, { Location: `${url.pathname}/` });
      return res.end();
    }
  } catch {
    target = join(DIST, "404.html");
    const body = await readFile(target).catch(() => "Not found");
    return send(res, 404, body, { "Content-Type": MIME[".html"] });
  }
  const body = await readFile(target);
  const ext = extname(target);
  const cache = ext === ".html" ? "no-cache" : "public, max-age=300";
  return send(res, 200, body, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": cache });
}

export async function start({ port = PORT, host = HOST } = {}) {
  await loadDb();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
      return await serveStatic(req, res, url);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      return send(res, status, { ok: false, errors: { form: "server" } });
    }
  });
  await new Promise((r) => server.listen(port, host, r));
  return server;
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--reset-only")) {
    db = createSeed();
    await saveDb();
    console.log(`Testni podaci regenerisani u ${DB_FILE}`);
  } else {
    const server = await start();
    const { port } = server.address();
    console.log(`\nVilla Solia DEMO radi:`);
    console.log(`  Lokalno:   http://localhost:${port}/`);
    for (const ip of lanAddresses()) console.log(`  iPhone/LAN: http://${ip}:${port}/`);
    console.log(`  Admin:     http://localhost:${port}/admin/  (lozinka: ${ADMIN_PASSWORD})\n`);
  }
}
