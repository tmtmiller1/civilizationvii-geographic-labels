import test from "node:test";
import assert from "node:assert/strict";

import { CATEGORIES, CATEGORY_GROUPS, groupedCategories } from "../ui/geo-labels-categories.js";

test("every category lands in exactly one section", () => {
  const placed = groupedCategories().flatMap((g) => g.members.map((c) => c.id));
  assert.equal(placed.length, CATEGORIES.length);
  assert.deepEqual([...placed].sort(), CATEGORIES.map((c) => c.id).sort());
  const groupIds = new Set(CATEGORY_GROUPS.map((g) => g.id));
  for (const c of CATEGORIES) assert.ok(groupIds.has(c.group), `${c.id} has unknown group ${c.group}`);
});

test("sections keep display order and sort members by displayed label", () => {
  const labels = { LOC_GEO_LABELS_VIS_DESERTS: "Deserts", LOC_GEO_LABELS_VIS_CONT: "Continents",
    LOC_GEO_LABELS_VIS_MOUNTAINS: "Mountain ranges", LOC_GEO_LABELS_VIS_TAIGA: "Taiga",
    LOC_GEO_LABELS_VIS_JUNGLE: "Jungle", LOC_GEO_LABELS_VIS_WONDER: "Natural wonders" };
  const groups = groupedCategories((loc) => labels[loc] ?? loc);
  assert.deepEqual(groups.map((g) => g.id), CATEGORY_GROUPS.map((g) => g.id));
  const land = groups.find((g) => g.id === "land");
  assert.deepEqual(land.members.map((c) => labels[c.loc]),
    ["Continents", "Deserts", "Jungle", "Mountain ranges", "Natural wonders", "Taiga"]);
});

test("every section is non-empty", () => {
  for (const g of groupedCategories()) assert.ok(g.members.length > 0, g.id);
});
