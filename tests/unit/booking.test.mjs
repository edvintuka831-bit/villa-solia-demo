import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG,
  addDays,
  bookedNights,
  isIsoDate,
  isRangeFree,
  nightsBetween,
  occupiedRanges,
  validateBlock,
  validateInquiry,
} from "../../src/lib/booking.js";

const today = "2026-10-19";
const valid = {
  arrival: "2026-11-02",
  departure: "2026-11-06",
  guests: "4",
  name: "Test Gost",
  email: "Test@Example.com",
  phone: "+387 61 123 456",
  lang: "bs",
};

test("date helpers", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  assert.equal(nightsBetween("2026-10-25", "2026-10-26"), 1); // across DST change
  assert.ok(isIsoDate("2026-02-28"));
  assert.ok(!isIsoDate("2026-02-30"));
  assert.ok(!isIsoDate("19.10.2026"));
});

test("valid inquiry is accepted and normalized", () => {
  const r = validateInquiry(valid, { today });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.value.email, "test@example.com");
  assert.equal(r.value.guests, 4);
});

test("inquiry field errors", () => {
  const r = validateInquiry({ ...valid, arrival: "2026-10-01", guests: "0", name: "A", email: "x@", phone: "abc" }, { today });
  assert.deepEqual(r.errors, { arrival: "past", guests: "guests", name: "name", email: "email", phone: "phone" });
  assert.equal(validateInquiry({ ...valid, departure: valid.arrival }, { today }).errors.departure, "beforeArrival");
  assert.equal(validateInquiry({ ...valid, departure: "2026-11-03" }, { today }).errors.departure, "minNights");
  assert.equal(validateInquiry({ ...valid, guests: String(CONFIG.maxGuests + 1) }, { today }).errors.guests, "guests");
  assert.equal(validateInquiry({}, { today }).errors.arrival, "required");
});

test("overlap rules use nights (departure day may be next arrival)", () => {
  const ranges = [{ start: "2026-11-06", end: "2026-11-10" }];
  assert.ok(isRangeFree("2026-11-02", "2026-11-06", ranges));
  assert.ok(isRangeFree("2026-11-10", "2026-11-12", ranges));
  assert.ok(!isRangeFree("2026-11-05", "2026-11-07", ranges));
  assert.ok(!isRangeFree("2026-11-01", "2026-11-20", ranges));
  const r = validateInquiry({ ...valid, departure: "2026-11-08" }, { today, ranges });
  assert.equal(r.errors.arrival, "unavailable");
});

test("only blocks and confirmed inquiries occupy dates", () => {
  const db = {
    blocks: [{ start: "2026-11-01", end: "2026-11-03" }],
    inquiries: [
      { arrival: "2026-11-05", departure: "2026-11-07", status: "confirmed" },
      { arrival: "2026-11-10", departure: "2026-11-12", status: "new" },
      { arrival: "2026-11-15", departure: "2026-11-17", status: "declined" },
    ],
  };
  const nights = [...bookedNights(occupiedRanges(db))].sort();
  assert.deepEqual(nights, ["2026-11-01", "2026-11-02", "2026-11-05", "2026-11-06"]);
});

test("block validation", () => {
  assert.ok(validateBlock({ start: "2026-11-01", end: "2026-11-02", note: " x " }).ok);
  assert.equal(validateBlock({ start: "2026-11-02", end: "2026-11-01" }).errors.end, "beforeArrival");
  assert.equal(validateBlock({}).errors.start, "required");
});
