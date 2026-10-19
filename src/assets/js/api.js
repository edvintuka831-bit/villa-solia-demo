// Data access for the public site and the demo admin.
//
// Uses the demo server's JSON API when it is running (`npm start`). If the
// site is opened from plain static hosting, it falls back to a localStorage
// copy of the same test data so the demo still works (per browser only).

import {
  addBlock,
  addInquiry,
  createSeed,
  deleteInquiry,
  publicAvailability,
  removeBlock,
  setInquiryStatus,
} from "../lib/store.js";

const API = new URL("../../api/", import.meta.url);
const LS_KEY = "villaSoliaDemoDb";
const LOCAL_PASSWORD = "demo1234";

let mode = null; // "server" | "local"

async function detectMode() {
  if (mode) return mode;
  try {
    const res = await fetch(new URL("health", API), { cache: "no-store" });
    const body = res.ok ? await res.json() : null;
    mode = body?.ok ? "server" : "local";
  } catch {
    mode = "local";
  }
  return mode;
}

export async function getMode() {
  return detectMode();
}

function loadLocal() {
  try {
    const db = JSON.parse(localStorage.getItem(LS_KEY));
    if (db && Array.isArray(db.inquiries) && Array.isArray(db.blocks)) return db;
  } catch {
    // ignore corrupt or unavailable storage
  }
  const seed = createSeed();
  saveLocal(seed);
  return seed;
}

function saveLocal(db) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  } catch {
    // private mode etc.: keep working in memory for this page view
  }
}

async function request(path, { method = "GET", body, password } = {}) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (password) headers["X-Admin-Password"] = password;
  const res = await fetch(new URL(path, API), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ ok: false, errors: { form: "server" } }));
  return { status: res.status, ...data };
}

/** Wraps a local store mutation so it is persisted and shaped like an API reply. */
function local(fn) {
  const db = loadLocal();
  const result = fn(db);
  if (result.ok) saveLocal(db);
  return result;
}

export async function getAvailability() {
  if ((await detectMode()) === "server") return request("availability");
  return { ok: true, ...publicAvailability(loadLocal()) };
}

export async function sendInquiry(data) {
  if ((await detectMode()) === "server") return request("inquiries", { method: "POST", body: data });
  if (data.website) return { ok: true };
  return local((db) => addInquiry(db, data));
}

export const admin = {
  async login(password) {
    if ((await detectMode()) === "server") {
      const res = await request("admin/data", { password });
      return res.status !== 401;
    }
    return password === LOCAL_PASSWORD;
  },
  async data(password) {
    if ((await detectMode()) === "server") return request("admin/data", { password });
    return { ok: true, ...loadLocal() };
  },
  async setStatus(password, id, status) {
    if ((await detectMode()) === "server") {
      return request(`admin/inquiries/${encodeURIComponent(id)}`, { method: "PATCH", body: { status }, password });
    }
    return local((db) => setInquiryStatus(db, id, status));
  },
  async deleteInquiry(password, id) {
    if ((await detectMode()) === "server") {
      return request(`admin/inquiries/${encodeURIComponent(id)}`, { method: "DELETE", password });
    }
    return local((db) => deleteInquiry(db, id));
  },
  async addBlock(password, block) {
    if ((await detectMode()) === "server") return request("admin/blocks", { method: "POST", body: block, password });
    return local((db) => addBlock(db, block));
  },
  async removeBlock(password, id) {
    if ((await detectMode()) === "server") {
      return request(`admin/blocks/${encodeURIComponent(id)}`, { method: "DELETE", password });
    }
    return local((db) => removeBlock(db, id));
  },
  async reset(password) {
    if ((await detectMode()) === "server") return request("admin/reset", { method: "POST", password });
    saveLocal(createSeed());
    return { ok: true };
  },
};
