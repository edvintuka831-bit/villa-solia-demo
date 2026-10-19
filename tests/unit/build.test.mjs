import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkKeysMatch, render } from "../../scripts/build.mjs";

test("render escapes translations and fails on missing keys", () => {
  assert.equal(render("<p>{{a.b}}</p>", { a: { b: '<x> & "y"' } }, {}), "<p>&lt;x&gt; &amp; &quot;y&quot;</p>");
  assert.throws(() => render("{{missing}}", {}, {}), /Missing translation/);
});

test("all languages have the same translation keys", async () => {
  const load = async (l) => JSON.parse(await readFile(new URL(`../../src/i18n/${l}.json`, import.meta.url), "utf8"));
  const all = { bs: await load("bs"), en: await load("en"), de: await load("de") };
  assert.doesNotThrow(() => checkKeysMatch(all));
});
