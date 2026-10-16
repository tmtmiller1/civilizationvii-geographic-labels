import test from "node:test";
import assert from "node:assert/strict";

import { allowLayerOnUnitLenses, UNIT_LENSES } from "../ui/geo-labels-lenses.js";

const LABELS = "tmt-geo-labels-layer";

// The lenses as base-standard/ui/lenses/lens/*.js define them in 1.5.0 (founder outside the tutorial).
function baseLenses() {
  return {
    "fxs-default-lens": {
      activeLayers: new Set(["fxs-culture-borders-layer", "fxs-operation-target-layer"]),
      allowedLayers: new Set(["fxs-hexgrid-layer", "fxs-resource-layer", "fxs-yields-layer", "fxs-conquest-layer"]),
      blendEnabledLayersOnTransition: false,
    },
    "fxs-founder-lens": {
      activeLayers: new Set(["fxs-settlement-recommendations-layer"]),
      allowedLayers: new Set(["fxs-hexgrid-layer", "fxs-resource-layer", "fxs-yields-layer"]),
      skipCachingEnabledLayers: true,
    },
    "fxs-settler-lens": {
      activeLayers: new Set(["fxs-appeal-layer", "fxs-resource-layer", "fxs-random-events-layer",
        "fxs-settlement-recommendations-layer", "fxs-yields-layer", "fxs-culture-borders-layer"]),
      allowedLayers: new Set(["fxs-hexgrid-layer"]),
    },
    "fxs-trade-lens": {
      activeLayers: new Set(["fxs-hexgrid-layer", "fxs-resource-layer", "fxs-culture-borders-layer", "fxs-trade-layer"]),
      allowedLayers: new Set([]),
    },
    "fxs-continent-lens": {
      activeLayers: new Set(["fxs-continent-layer", "fxs-hexgrid-layer", "fxs-culture-borders-layer",
        "fxs-resource-layer"]),
      allowedLayers: new Set([]),
    },
    "fxs-discovery-lens": {
      activeLayers: new Set(["fxs-discovery-layer", "fxs-culture-borders-layer", "fxs-operation-target-layer"]),
      allowedLayers: new Set(["fxs-hexgrid-layer", "fxs-resource-layer", "fxs-yields-layer", "fxs-conquest-layer",
        "fxs-radial-measure-layer"]),
      skipCachingEnabledLayers: true,
    },
    "fxs-diplomacy-lens": { activeLayers: new Set([]), allowedLayers: new Set(["fxs-hexgrid-layer"]) },
    "fxs-cinematic-lens": { activeLayers: new Set([]), allowedLayers: new Set([]) },
  };
}

// The layer-switching part of core/ui/lenses/lens-manager.js setActiveLens in 1.5.0, without the user-config
// options and events: cache the old lens's enabled layers, then turn off every enabled layer the new lens doesn't
// list (active, or allowed when it blends), and turn on its active (or cached) layers.
class FakeLensManager {
  constructor(lenses, layers) {
    this.lenses = new Map(Object.entries(lenses));
    this.layers = new Map(layers.map((l) => [l, {}]));
    this.enabledLayers = new Set();
    this.activeLens = undefined;
  }

  getEnabledLayers() {
    return new Set(this.enabledLayers);
  }

  setActiveLens(type) {
    if (type === this.activeLens) return true;
    const lens = this.lenses.get(type);
    if (lens == undefined) return false;
    if (this.activeLens !== undefined) {
      const prevLens = this.lenses.get(this.activeLens);
      if (prevLens && !prevLens.skipCachingEnabledLayers) prevLens.lastEnabledLayers = this.getEnabledLayers();
    }
    this.activeLens = type;
    const nextLensLayers = new Set(lens.lastEnabledLayers ?? lens.activeLayers);
    const canBlend = lens.blendEnabledLayersOnTransition !== false || lens.lastEnabledLayers == null;
    for (const layerType of [...this.enabledLayers]) {
      if (!nextLensLayers.has(layerType) && (!canBlend || !lens.allowedLayers.has(layerType))) {
        this.enabledLayers.delete(layerType);
      }
    }
    for (const layerType of nextLensLayers) {
      if (this.layers.has(layerType)) this.enabledLayers.add(layerType);
    }
    return true;
  }
}

function layerNames(lenses) {
  const names = new Set([LABELS]);
  for (const lens of Object.values(lenses)) {
    for (const l of lens.activeLayers) names.add(l);
    for (const l of lens.allowedLayers ?? []) names.add(l);
  }
  return [...names];
}

function gameWithLabelsOn(lenses = baseLenses()) {
  const lm = new FakeLensManager(lenses, layerNames(lenses));
  lm.setActiveLens("fxs-default-lens");
  lm.enabledLayers.add(LABELS);
  return lm;
}

test("without the fix the labels go off on a unit lens (the watched behaviour)", () => {
  const lm = gameWithLabelsOn();
  lm.setActiveLens("fxs-discovery-lens");
  assert.equal(lm.enabledLayers.has(LABELS), false);
  lm.setActiveLens("fxs-default-lens");
  assert.equal(lm.enabledLayers.has(LABELS), true);
});

for (const lensType of UNIT_LENSES) {
  test(`labels stay on through a switch to ${lensType} and back, twice`, () => {
    const lm = gameWithLabelsOn();
    allowLayerOnUnitLenses(lm, LABELS);
    for (let round = 0; round < 2; round++) {
      lm.setActiveLens(lensType);
      assert.equal(lm.enabledLayers.has(LABELS), true, `on ${lensType}, round ${round}`);
      lm.setActiveLens("fxs-default-lens");
      assert.equal(lm.enabledLayers.has(LABELS), true, `back on default, round ${round}`);
    }
  });
}

test("labels switched off stay off on a unit lens", () => {
  const lm = gameWithLabelsOn();
  allowLayerOnUnitLenses(lm, LABELS);
  lm.enabledLayers.delete(LABELS);
  lm.setActiveLens("fxs-founder-lens");
  assert.equal(lm.enabledLayers.has(LABELS), false);
  lm.setActiveLens("fxs-default-lens");
  assert.equal(lm.enabledLayers.has(LABELS), false);
});

// A lens that caches its layers (settler, trade, continent) brings back whatever was on when it was last left. The
// base game does the same with the hex grid on the settler lens; this pins down what a player would see.
test("labels switched off after a settler visit come back on the next settler visit, then off again on default", () => {
  const lm = gameWithLabelsOn();
  allowLayerOnUnitLenses(lm, LABELS);
  lm.setActiveLens("fxs-settler-lens");
  lm.setActiveLens("fxs-default-lens");
  lm.enabledLayers.delete(LABELS);
  lm.setActiveLens("fxs-settler-lens");
  assert.equal(lm.enabledLayers.has(LABELS), true);
  lm.setActiveLens("fxs-default-lens");
  assert.equal(lm.enabledLayers.has(LABELS), false);
});

test("labels stay on going from one unit lens straight to another", () => {
  const lm = gameWithLabelsOn();
  allowLayerOnUnitLenses(lm, LABELS);
  lm.setActiveLens("fxs-settler-lens");
  lm.setActiveLens("fxs-discovery-lens");
  lm.setActiveLens("fxs-founder-lens");
  assert.equal(lm.enabledLayers.has(LABELS), true);
});

test("a missing lens is skipped and the rest still get the labels", () => {
  const lenses = baseLenses();
  delete lenses["fxs-continent-lens"];
  delete lenses["fxs-trade-lens"];
  const lm = gameWithLabelsOn(lenses);
  const allowed = allowLayerOnUnitLenses(lm, LABELS);
  assert.deepEqual(allowed, ["fxs-founder-lens", "fxs-settler-lens", "fxs-discovery-lens"]);
  assert.equal(lm.lenses.has("fxs-continent-lens"), false);
  lm.setActiveLens("fxs-settler-lens");
  assert.equal(lm.enabledLayers.has(LABELS), true);
});

test("a lens without allowedLayers, or no lens manager at all, is skipped without throwing", () => {
  const lenses = baseLenses();
  lenses["fxs-trade-lens"] = { activeLayers: new Set([]) };
  const lm = gameWithLabelsOn(lenses);
  assert.equal(allowLayerOnUnitLenses(lm, LABELS).includes("fxs-trade-lens"), false);
  assert.deepEqual(allowLayerOnUnitLenses(undefined, LABELS), []);
  assert.deepEqual(allowLayerOnUnitLenses({}, LABELS), []);
});

test("diplomacy, cinematic, default and another mod's lens are left as they were", () => {
  const lenses = baseLenses();
  lenses["othermod-custom-lens"] = { activeLayers: new Set(["othermod-layer"]), allowedLayers: new Set(["x"]) };
  const before = {};
  for (const [k, v] of Object.entries(lenses)) before[k] = [...v.allowedLayers];
  const lm = gameWithLabelsOn(lenses);
  allowLayerOnUnitLenses(lm, LABELS);
  for (const k of ["fxs-diplomacy-lens", "fxs-cinematic-lens", "fxs-default-lens", "othermod-custom-lens"]) {
    assert.deepEqual([...lm.lenses.get(k).allowedLayers], before[k], k);
  }
  lm.setActiveLens("othermod-custom-lens");
  assert.equal(lm.enabledLayers.has(LABELS), false);
});

test("a unit lens another mod has changed keeps its changes and gains the labels", () => {
  const lenses = baseLenses();
  lenses["fxs-settler-lens"].allowedLayers.add("othermod-layer");
  const lm = gameWithLabelsOn(lenses);
  allowLayerOnUnitLenses(lm, LABELS);
  assert.deepEqual([...lm.lenses.get("fxs-settler-lens").allowedLayers],
    ["fxs-hexgrid-layer", "othermod-layer", LABELS]);
});

test("calling it again adds nothing twice", () => {
  const lm = gameWithLabelsOn();
  allowLayerOnUnitLenses(lm, LABELS);
  allowLayerOnUnitLenses(lm, LABELS);
  assert.equal([...lm.lenses.get("fxs-discovery-lens").allowedLayers].filter((l) => l === LABELS).length, 1);
});
