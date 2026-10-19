import { test } from "node:test";
import assert from "node:assert/strict";
import { addBlock, addInquiry, createSeed, publicAvailability, removeBlock, setInquiryStatus } from "../../src/lib/store.js";
import { addDays, todayIso } from "../../src/lib/booking.js";

const today = todayIso();
const base = { guests: 2, name: "Test", email: "t@example.com", phone: "+387 61 000 000" };

test("seed contains test data in the future", () => {
  const db = createSeed(today);
  assert.equal(db.inquiries.length, 3);
  assert.ok(db.blocks.every((b) => b.start > today));
  assert.ok(publicAvailability(db).ranges.length >= 4);
});

test("inquiry lifecycle and conflict on confirm", () => {
  const db = { inquiries: [], blocks: [] };
  const a = addInquiry(db, { ...base, arrival: addDays(today, 10), departure: addDays(today, 14) });
  const b = addInquiry(db, { ...base, arrival: addDays(today, 12), departure: addDays(today, 15) });
  assert.ok(a.ok && b.ok, "pending inquiries may overlap");
  assert.ok(setInquiryStatus(db, a.inquiry.id, "confirmed").ok);
  assert.equal(setInquiryStatus(db, b.inquiry.id, "confirmed").errors.status, "conflict");
  const c = addInquiry(db, { ...base, arrival: addDays(today, 11), departure: addDays(today, 13) });
  assert.equal(c.errors.arrival, "unavailable", "confirmed stay blocks new inquiries");
  assert.equal(setInquiryStatus(db, "nope", "confirmed").errors.id, "notFound");
  assert.equal(setInquiryStatus(db, a.inquiry.id, "weird").errors.status, "invalid");
});

test("blocks can be added and removed", () => {
  const db = { inquiries: [], blocks: [] };
  const r = addBlock(db, { start: addDays(today, 5), end: addDays(today, 7), note: "Test" });
  assert.ok(r.ok);
  assert.equal(addInquiry(db, { ...base, arrival: addDays(today, 4), departure: addDays(today, 6) }).errors.arrival, "unavailable");
  assert.ok(removeBlock(db, r.block.id).ok);
  assert.equal(db.blocks.length, 0);
});
