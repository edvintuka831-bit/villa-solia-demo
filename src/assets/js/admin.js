import { nightsBetween, occupiedRanges, validateBlock } from "../lib/booking.js";
import { admin, getMode } from "./api.js";
import { AvailabilityCalendar } from "./calendar.js";
import { formatShort } from "./dates.js";

const PW_KEY = "villaSoliaAdminPw";
const STATUS_LABEL = { new: "Novi", confirmed: "Potvrđen", declined: "Odbijen" };
const LANG_LABEL = { bs: "Bosanski", en: "Engleski", de: "Njemački" };
const ERROR_LABEL = {
  conflict: "Termin se preklapa s blokom ili potvrđenim upitom.",
  notFound: "Stavka više ne postoji.",
  required: "Obavezno polje.",
  beforeArrival: "Datum završetka mora biti nakon početka.",
  invalid: "Neispravan zahtjev.",
  server: "Greška na serveru.",
};

const fmtIso = (iso) => formatShort("bs", iso);
const fmtStamp = (stamp) => {
  const d = new Date(stamp);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const $ = (id) => document.getElementById(id);
let password = sessionStorage.getItem(PW_KEY) || "";
let db = { inquiries: [], blocks: [] };
let filter = "all";
let calendar;

init();

async function init() {
  $("login-form").addEventListener("submit", onLogin);
  $("logout").addEventListener("click", () => {
    sessionStorage.removeItem(PW_KEY);
    location.reload();
  });
  if (password && (await admin.login(password))) showAdmin();
}

async function onLogin(e) {
  e.preventDefault();
  const pw = e.target.elements.password.value;
  if (await admin.login(pw)) {
    password = pw;
    try {
      sessionStorage.setItem(PW_KEY, pw);
    } catch {
      // storage unavailable: stay logged in for this page view only
    }
    showAdmin();
  } else {
    $("password-error").textContent = "Pogrešna lozinka.";
  }
}

async function showAdmin() {
  $("login-view").hidden = true;
  $("admin-view").hidden = false;
  $("logout").hidden = false;
  $("mode-note").hidden = (await getMode()) !== "local";

  calendar = new AvailabilityCalendar($("admin-calendar"), {
    locale: "bs",
    labels: { free: "slobodno", booked: "zauzeto" },
    onChange: ({ start, end }) => {
      $("block-start").value = start || "";
      $("block-end").value = end || "";
    },
  });

  document.querySelectorAll("[data-filter]").forEach((btn) =>
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      renderInquiries();
    }),
  );
  $("inquiries").addEventListener("click", onInquiryAction);
  $("blocks").addEventListener("click", onBlockAction);
  $("block-form").addEventListener("submit", onAddBlock);
  $("reset").addEventListener("click", async () => {
    if (!confirm("Resetovati sve testne podatke?")) return;
    await admin.reset(password);
    toast("Testni podaci su resetovani.");
    refresh();
  });

  await refresh();
}

async function refresh() {
  const res = await admin.data(password);
  if (!res.ok) return toast(ERROR_LABEL.server, true);
  db = { inquiries: res.inquiries, blocks: res.blocks };
  const count = (s) => db.inquiries.filter((i) => i.status === s).length;
  $("stat-new").textContent = count("new");
  $("stat-confirmed").textContent = count("confirmed");
  $("stat-declined").textContent = count("declined");
  $("stat-blocks").textContent = db.blocks.length;
  calendar.setBooked(occupiedRanges(db));
  renderInquiries();
  renderBlocks();
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

function renderInquiries() {
  const list = db.inquiries
    .filter((i) => filter === "all" || i.status === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const box = $("inquiries");
  if (!list.length) {
    box.replaceChildren(el("p", { class: "empty" }, "Nema upita za odabrani filter."));
    return;
  }
  box.replaceChildren(
    ...list.map((i) => {
      const nights = nightsBetween(i.arrival, i.departure);
      const actions = [];
      if (i.status !== "confirmed") actions.push(el("button", { type: "button", class: "act-confirm", "data-act": "confirmed" }, "Potvrdi"));
      if (i.status !== "declined") actions.push(el("button", { type: "button", "data-act": "declined" }, "Odbij"));
      if (i.status !== "new") actions.push(el("button", { type: "button", "data-act": "new" }, "Vrati u nove"));
      actions.push(el("button", { type: "button", class: "act-delete", "data-act": "delete" }, "Obriši"));
      return el(
        "article",
        { class: `inquiry status-${i.status}`, "data-id": i.id },
        el("div", { class: "inquiry-head" }, el("h3", {}, i.name), el("span", { class: `badge badge-${i.status}` }, STATUS_LABEL[i.status])),
        el(
          "dl",
          {},
          el("dt", {}, "Termin"),
          el("dd", {}, `${fmtIso(i.arrival)} – ${fmtIso(i.departure)} (${nights} noć.)`),
          el("dt", {}, "Gosti"),
          el("dd", {}, String(i.guests)),
          el("dt", {}, "Email"),
          el("dd", {}, el("a", { href: `mailto:${i.email}` }, i.email)),
          el("dt", {}, "Telefon"),
          el("dd", {}, el("a", { href: `tel:${i.phone.replace(/[^\d+]/g, "")}` }, i.phone)),
          el("dt", {}, "Jezik"),
          el("dd", {}, LANG_LABEL[i.lang] || i.lang),
          el("dt", {}, "Primljeno"),
          el("dd", {}, fmtStamp(i.createdAt)),
        ),
        i.message ? el("p", { class: "msg" }, i.message) : null,
        el("div", { class: "inquiry-actions" }, ...actions),
      );
    }),
  );
}

function renderBlocks() {
  const list = [...db.blocks].sort((a, b) => a.start.localeCompare(b.start));
  if (!list.length) {
    $("blocks").replaceChildren(el("li", { class: "muted" }, "Nema ručno blokiranih termina."));
    return;
  }
  $("blocks").replaceChildren(
    ...list.map((b) =>
      el(
        "li",
        { "data-id": b.id },
        el("div", {}, el("span", { class: "dates" }, `${fmtIso(b.start)} – ${fmtIso(b.end)}`), b.note ? el("span", { class: "note" }, b.note) : null),
        el("button", { type: "button", "data-act": "unblock", "aria-label": `Ukloni blok ${b.start} – ${b.end}` }, "Ukloni"),
      ),
    ),
  );
}

async function onInquiryAction(e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.closest("[data-id]").dataset.id;
  const act = btn.dataset.act;
  let res;
  if (act === "delete") {
    if (!confirm("Obrisati ovaj testni upit?")) return;
    res = await admin.deleteInquiry(password, id);
  } else {
    res = await admin.setStatus(password, id, act);
  }
  if (!res.ok) return toast(errorMessage(res.errors), true);
  toast(act === "delete" ? "Upit obrisan." : `Status: ${STATUS_LABEL[act]}.`);
  refresh();
}

async function onBlockAction(e) {
  const btn = e.target.closest("button[data-act='unblock']");
  if (!btn) return;
  const res = await admin.removeBlock(password, btn.closest("[data-id]").dataset.id);
  if (!res.ok) return toast(errorMessage(res.errors), true);
  toast("Blok uklonjen.");
  refresh();
}

async function onAddBlock(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  $("start-error").textContent = "";
  $("end-error").textContent = "";
  const check = validateBlock(data);
  const errors = check.ok ? null : check.errors;
  const res = errors ? { ok: false, errors } : await admin.addBlock(password, data);
  if (!res.ok) {
    for (const [k, code] of Object.entries(res.errors)) {
      const msg = $(`${k}-error`);
      if (msg) msg.textContent = ERROR_LABEL[code] || code;
    }
    return;
  }
  form.reset();
  calendar.setSelection(null, null, { silent: true });
  toast("Termin je blokiran.");
  refresh();
}

function errorMessage(errors = {}) {
  const code = Object.values(errors)[0];
  return ERROR_LABEL[code] || ERROR_LABEL.server;
}

let toastTimer;
function toast(text, isError = false) {
  const t = $("toast");
  t.textContent = text;
  t.classList.toggle("error", isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}
