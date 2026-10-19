import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addDays, todayIso } from "../../src/lib/booking.js";

let server, base, dir;
const today = todayIso();

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "solia-"));
  process.env.DB_FILE = join(dir, "db.json");
  const { start } = await import("../../server.mjs");
  server = await start({ port: 0, host: "127.0.0.1" });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const json = (path, opts = {}) =>
  fetch(base + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
const adminHeaders = { "X-Admin-Password": "demo1234" };

test("public availability and inquiry", async () => {
  const av = await json("/api/availability");
  assert.equal(av.status, 200);
  assert.ok(Array.isArray(av.body.ranges));

  const bad = await json("/api/inquiries", { method: "POST", body: { name: "x" } });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.errors.email);

  const ok = await json("/api/inquiries", {
    method: "POST",
    body: { arrival: addDays(today, 100), departure: addDays(today, 103), guests: 3, name: "API Test", email: "api@example.com", phone: "+387 61 111 222" },
  });
  assert.equal(ok.status, 201);
});

test("admin requires password", async () => {
  assert.equal((await json("/api/admin/data")).status, 401);
  const data = await json("/api/admin/data", { headers: adminHeaders });
  assert.equal(data.status, 200);
  assert.ok(data.body.inquiries.some((i) => i.name === "API Test"));
});

test("admin can block dates, which then reject inquiries", async () => {
  const blk = await json("/api/admin/blocks", { method: "POST", headers: adminHeaders, body: { start: addDays(today, 200), end: addDays(today, 205), note: "t" } });
  assert.equal(blk.status, 201);
  const clash = await json("/api/inquiries", {
    method: "POST",
    body: { arrival: addDays(today, 201), departure: addDays(today, 204), guests: 2, name: "Clash", email: "c@example.com", phone: "+387 61 111 333" },
  });
  assert.equal(clash.status, 422);
  assert.equal(clash.body.errors.arrival, "unavailable");
  const del = await json(`/api/admin/blocks/${blk.body.block.id}`, { method: "DELETE", headers: adminHeaders });
  assert.equal(del.status, 200);
});

test("static files, security headers and path traversal", async () => {
  const page = await fetch(`${base}/bs/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
  const html = await page.text();
  assert.match(html, /hreflang="de"/);
  assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 403);
  assert.equal((await fetch(`${base}/nope/`)).status, 404);
});
