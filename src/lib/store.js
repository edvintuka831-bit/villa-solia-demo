// Demo data operations on a plain in-memory "db" object:
//   { inquiries: [...], blocks: [...] }
// The server persists it to data/db.json; the static fallback in the browser
// persists it to localStorage. Both share these functions.

import {
  addDays,
  newId,
  occupiedRanges,
  todayIso,
  validateBlock,
  validateInquiry,
} from "./booking.js";

export const INQUIRY_STATUSES = ["new", "confirmed", "declined"];

/** Test data relative to today, so the calendar always shows upcoming bookings. */
export function createSeed(today = todayIso()) {
  const at = (n) => addDays(today, n);
  const created = (n) => `${addDays(today, n)}T10:15:00.000Z`;
  return {
    inquiries: [
      {
        id: "inq_demo1",
        arrival: at(18),
        departure: at(23),
        guests: 4,
        name: "Test Gost (demo)",
        email: "gost.demo@example.com",
        phone: "+387 61 000 001",
        message: "Ovo je testni upit. Dolazimo autom.",
        lang: "bs",
        status: "new",
        createdAt: created(-1),
      },
      {
        id: "inq_demo2",
        arrival: at(40),
        departure: at(47),
        guests: 6,
        name: "Anna Muster (demo)",
        email: "anna.demo@example.com",
        phone: "+49 151 0000000",
        message: "Testanfrage – Familie mit zwei Kindern.",
        lang: "de",
        status: "confirmed",
        createdAt: created(-6),
      },
      {
        id: "inq_demo3",
        arrival: at(9),
        departure: at(12),
        guests: 2,
        name: "John Sample (demo)",
        email: "john.demo@example.com",
        phone: "+44 7700 900000",
        message: "Test inquiry, is late check-in possible?",
        lang: "en",
        status: "declined",
        createdAt: created(-3),
      },
    ],
    blocks: [
      { id: "blk_demo1", start: at(3), end: at(8), note: "Booking.com (test)" },
      { id: "blk_demo2", start: at(25), end: at(29), note: "Vlasnik – privatno (test)" },
      { id: "blk_demo3", start: at(60), end: at(67), note: "Airbnb (test)" },
    ],
  };
}

export function publicAvailability(db) {
  return { ranges: occupiedRanges(db).sort((a, b) => a.start.localeCompare(b.start)) };
}

export function addInquiry(db, input, { today } = {}) {
  const result = validateInquiry(input, { ranges: occupiedRanges(db), today });
  if (!result.ok) return { ok: false, errors: result.errors };
  const inquiry = {
    id: newId("inq"),
    ...result.value,
    status: "new",
    createdAt: new Date().toISOString(),
  };
  db.inquiries.push(inquiry);
  return { ok: true, inquiry };
}

export function setInquiryStatus(db, id, status) {
  if (!INQUIRY_STATUSES.includes(status)) return { ok: false, errors: { status: "invalid" } };
  const inquiry = db.inquiries.find((i) => i.id === id);
  if (!inquiry) return { ok: false, errors: { id: "notFound" } };
  if (status === "confirmed" && inquiry.status !== "confirmed") {
    // Confirming must not double-book against blocks or other confirmed stays.
    const others = occupiedRanges({
      blocks: db.blocks,
      inquiries: db.inquiries.filter((i) => i.id !== id),
    });
    const clash = others.some((r) => inquiry.arrival < r.end && r.start < inquiry.departure);
    if (clash) return { ok: false, errors: { status: "conflict" } };
  }
  inquiry.status = status;
  return { ok: true, inquiry };
}

export function deleteInquiry(db, id) {
  const before = db.inquiries.length;
  db.inquiries = db.inquiries.filter((i) => i.id !== id);
  return { ok: db.inquiries.length < before };
}

export function addBlock(db, input) {
  const result = validateBlock(input);
  if (!result.ok) return { ok: false, errors: result.errors };
  const block = { id: newId("blk"), ...result.value };
  db.blocks.push(block);
  return { ok: true, block };
}

export function removeBlock(db, id) {
  const before = db.blocks.length;
  db.blocks = db.blocks.filter((b) => b.id !== id);
  return { ok: db.blocks.length < before };
}
