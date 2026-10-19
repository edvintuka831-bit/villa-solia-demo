// Shared booking logic used by the browser (calendar, form, admin) and by the
// demo server. Pure functions only, no DOM or Node APIs.
//
// Dates are ISO strings "YYYY-MM-DD". A stay occupies the NIGHTS from arrival
// (inclusive) to departure (exclusive), so a departure day can be the next
// guest's arrival day.

export const CONFIG = {
  maxGuests: 8,
  minNights: 2,
  maxNights: 30,
  bookingWindowDays: 540,
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()/-]{6,20}$/;

export function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const d = parseIso(value);
  return toIso(d) === value;
}

export function parseIso(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function nightsBetween(arrival, departure) {
  return Math.round((parseIso(departure) - parseIso(arrival)) / 86400000);
}

export function todayIso(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Every night (as ISO date) covered by [start, end). */
export function eachNight(start, end) {
  const out = [];
  for (let d = start; d < end; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Ranges that make dates unavailable: manual blocks plus confirmed inquiries.
 * Pending/declined inquiries never block the calendar.
 */
export function occupiedRanges(db) {
  const blocks = (db.blocks || []).map((b) => ({ start: b.start, end: b.end }));
  const confirmed = (db.inquiries || [])
    .filter((i) => i.status === "confirmed")
    .map((i) => ({ start: i.arrival, end: i.departure }));
  return [...blocks, ...confirmed];
}

export function bookedNights(ranges) {
  const set = new Set();
  for (const r of ranges) for (const n of eachNight(r.start, r.end)) set.add(n);
  return set;
}

export function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function isRangeFree(arrival, departure, ranges) {
  return !ranges.some((r) => rangesOverlap({ start: arrival, end: departure }, r));
}

/**
 * Validates a reservation inquiry. Returns { ok, errors } where errors maps a
 * field name to an error code; codes are translated in the UI.
 */
export function validateInquiry(input, { ranges = [], today = todayIso() } = {}) {
  const errors = {};
  const v = normalizeInquiry(input);

  if (!isIsoDate(v.arrival)) errors.arrival = "required";
  else if (v.arrival < today) errors.arrival = "past";
  else if (v.arrival > addDays(today, CONFIG.bookingWindowDays)) errors.arrival = "tooFar";

  if (!isIsoDate(v.departure)) errors.departure = "required";
  else if (!errors.arrival && v.departure <= v.arrival) errors.departure = "beforeArrival";

  if (!errors.arrival && !errors.departure) {
    const nights = nightsBetween(v.arrival, v.departure);
    if (nights < CONFIG.minNights) errors.departure = "minNights";
    else if (nights > CONFIG.maxNights) errors.departure = "maxNights";
    else if (!isRangeFree(v.arrival, v.departure, ranges)) errors.arrival = "unavailable";
  }

  if (!Number.isInteger(v.guests) || v.guests < 1 || v.guests > CONFIG.maxGuests) {
    errors.guests = "guests";
  }
  if (v.name.length < 2 || v.name.length > 80) errors.name = "name";
  if (!EMAIL_RE.test(v.email) || v.email.length > 120) errors.email = "email";
  if (!PHONE_RE.test(v.phone)) errors.phone = "phone";
  if (v.message.length > 1000) errors.message = "tooLong";

  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

export function normalizeInquiry(input = {}) {
  const str = (x) => (typeof x === "string" ? x.trim() : "");
  return {
    arrival: str(input.arrival),
    departure: str(input.departure),
    guests: Number.parseInt(input.guests, 10),
    name: str(input.name),
    email: str(input.email).toLowerCase(),
    phone: str(input.phone),
    message: str(input.message),
    lang: ["bs", "en", "de"].includes(input.lang) ? input.lang : "bs",
  };
}

export function validateBlock(input) {
  const errors = {};
  const start = typeof input?.start === "string" ? input.start : "";
  const end = typeof input?.end === "string" ? input.end : "";
  if (!isIsoDate(start)) errors.start = "required";
  if (!isIsoDate(end)) errors.end = "required";
  if (!errors.start && !errors.end && end <= start) errors.end = "beforeArrival";
  const note = typeof input?.note === "string" ? input.note.trim().slice(0, 120) : "";
  return { ok: Object.keys(errors).length === 0, errors, value: { start, end, note } };
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
