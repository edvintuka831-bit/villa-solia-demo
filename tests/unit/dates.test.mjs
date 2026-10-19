import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLong, formatMonth, formatShort } from "../../src/assets/js/dates.js";

test("dates are formatted per language without Intl", () => {
  assert.equal(formatMonth("bs", 2026, 11), "novembar 2026");
  assert.equal(formatShort("en", "2026-11-03"), "3 Nov 2026");
  assert.equal(formatShort("de", "2026-03-03"), "3. März 2026");
  assert.equal(formatLong("bs", "2026-11-02"), "ponedjeljak, 2. novembar 2026");
  assert.equal(formatLong("de", "2026-11-08"), "Sonntag, 8. November 2026");
});
