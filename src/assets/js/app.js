import { CONFIG, addDays, nightsBetween, todayIso, validateInquiry } from "../lib/booking.js";
import { getAvailability, getMode, sendInquiry } from "./api.js";
import { AvailabilityCalendar } from "./calendar.js";
import { formatShort } from "./dates.js";

const t = JSON.parse(document.getElementById("i18n").textContent);
const fill = (str, vars = {}) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
const errorText = (code) =>
  fill(t.errors[code] || t.errors.required, { min: CONFIG.minNights, max: code === "guests" ? CONFIG.maxGuests : CONFIG.maxNights });

setupNav();
setupMobileCta();
setupBooking();

function setupNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  const label = toggle.querySelector(".nav-toggle-label");
  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
    label.textContent = open ? toggle.dataset.labelClose : toggle.dataset.labelOpen;
  };
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
}

function setupMobileCta() {
  const cta = document.querySelector(".mobile-cta");
  const targets = [document.querySelector(".hero"), document.getElementById("booking")];
  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
    cta.classList.toggle("hidden", visible.size > 0);
  });
  targets.forEach((el) => io.observe(el));
}

async function setupBooking() {
  const form = document.getElementById("inquiry-form");
  const arrival = form.elements.arrival;
  const departure = form.elements.departure;
  const summary = document.getElementById("nights-summary");
  const hint = document.getElementById("calendar-hint");
  const status = document.getElementById("data-status");
  const fmtIso = (iso) => formatShort(t.lang, iso);
  let ranges = [];

  const today = todayIso();
  arrival.min = today;
  departure.min = addDays(today, 1);
  hint.textContent = fill(t.booking.hint, { min: CONFIG.minNights });

  const calendar = new AvailabilityCalendar(document.getElementById("calendar"), {
    locale: t.lang,
    labels: { free: t.booking.legendFree, booked: t.booking.legendBooked },
    onChange: ({ start, end }) => {
      arrival.value = start || "";
      departure.value = end || "";
      clearFieldError("arrival");
      clearFieldError("departure");
      updateSummary();
    },
  });

  function updateSummary() {
    const a = arrival.value;
    const d = departure.value;
    if (a && d && d > a) {
      summary.textContent = `${fill(t.booking.selectedRange, { from: fmtIso(a), to: fmtIso(d) })} · ${fill(t.booking.nights, { n: nightsBetween(a, d) })}`;
    } else {
      summary.textContent = "";
    }
  }

  const syncFromInputs = () => {
    if (arrival.value) departure.min = addDays(arrival.value, 1);
    calendar.setSelection(arrival.value, departure.value > arrival.value ? departure.value : "", { silent: true });
    updateSummary();
  };
  arrival.addEventListener("change", syncFromInputs);
  departure.addEventListener("change", syncFromInputs);

  async function loadAvailability() {
    try {
      const res = await getAvailability();
      ranges = res.ranges || [];
      calendar.setBooked(ranges);
      if ((await getMode()) === "local") {
        status.textContent = t.booking.offline;
        status.hidden = false;
      }
    } catch {
      calendar.setBooked([]);
    }
  }
  await loadAvailability();

  form.addEventListener("input", (e) => {
    if (e.target.name) clearFieldError(e.target.name);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.lang = t.lang;
    const formError = document.getElementById("form-error");
    const success = document.getElementById("form-success");
    formError.hidden = true;
    success.hidden = true;

    const check = validateInquiry(data, { ranges });
    if (!check.ok) return showErrors(check.errors);

    const btn = form.querySelector('button[type="submit"]');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = btn.dataset.sending;
    try {
      const res = await sendInquiry(data);
      if (!res.ok) return showErrors(res.errors || { form: "server" });
      form.reset();
      calendar.setSelection(null, null, { silent: true });
      summary.textContent = "";
      success.textContent = t.booking.success;
      success.hidden = false;
      success.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      showErrors({ form: "server" });
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  function showErrors(errors) {
    const formError = document.getElementById("form-error");
    let first = null;
    for (const [field, code] of Object.entries(errors)) {
      const el = form.elements[field];
      const msg = document.getElementById(`${field}-error`);
      if (el && msg) {
        msg.textContent = errorText(code);
        el.closest(".field").classList.add("invalid");
        el.setAttribute("aria-invalid", "true");
        first ??= el;
      }
    }
    formError.textContent = errors.form ? errorText(errors.form) : t.booking.errorsTitle;
    formError.hidden = false;
    if (errors.arrival === "unavailable") loadAvailability();
    (first || formError).focus?.({ preventScroll: true });
    (first?.closest(".field") || formError).scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearFieldError(name) {
    const el = form.elements[name];
    const msg = document.getElementById(`${name}-error`);
    if (!el || !msg) return;
    msg.textContent = "";
    el.closest(".field")?.classList.remove("invalid");
    el.removeAttribute("aria-invalid");
  }
}
