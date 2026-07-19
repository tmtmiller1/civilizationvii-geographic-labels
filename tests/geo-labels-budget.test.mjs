import test from "node:test";
import assert from "node:assert/strict";

import { budgetLabels, LABEL_BUDGET } from "../ui/geo-labels-compute.js";

const mk = (n, text = "AAAAA") =>
  Array.from({ length: n }, (_, i) => ({ text, _i: i }));

test("keeps every label when the list fits the budget", () => {
  const labels = mk(10);
  const { kept, dropped } = budgetLabels(labels, { maxLabels: 100, maxGlyphs: 1000 });
  assert.equal(kept.length, 10);
  assert.equal(dropped, 0);
});

test("caps by label count and keeps the highest-priority prefix", () => {
  const labels = mk(500);
  const { kept, dropped } = budgetLabels(labels, { maxLabels: 300, maxGlyphs: Infinity });
  assert.equal(kept.length, 300);
  assert.equal(dropped, 200);
  // Order preserved: the tail is what gets dropped, not a random subset.
  assert.equal(kept[0]._i, 0);
  assert.equal(kept[299]._i, 299);
});

test("caps by glyph budget using the injected cost fn", () => {
  const labels = mk(1000, "AB"); // trivial cost fn below charges 2 glyphs each
  const { kept, glyphs } = budgetLabels(
    labels,
    { maxLabels: Infinity, maxGlyphs: 10 },
    (l) => l.text.length,
  );
  assert.equal(kept.length, 5); // 5 * 2 = 10, a 6th would exceed
  assert.equal(glyphs, 10);
});

test("never overflows even with a pathological label list", () => {
  // 5,000 max-length-ish names must still be bounded by the real budget.
  const labels = mk(5000, "MEDITERRANEAN");
  const { kept, glyphs } = budgetLabels(labels);
  assert.ok(kept.length <= LABEL_BUDGET.maxLabels);
  assert.ok(glyphs <= LABEL_BUDGET.maxGlyphs);
});

test("real budget is a small slice of the engine's ~49152 resource cap", () => {
  assert.ok(LABEL_BUDGET.maxGlyphs <= 49152 * 0.25);
});
