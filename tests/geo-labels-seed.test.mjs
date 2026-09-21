import test from "node:test";
import assert from "node:assert/strict";

import {
  computeLabels,
  getLastComputedLabels,
  hasGameSeed,
  resetSeedCache,
  setCustomLabelName,
} from "../ui/geo-labels-compute.js";
import { resetStoreCache } from "../ui/geo-labels-store.js";

// --- fakes -------------------------------------------------------------------

// Configuration whose seed field reads back whatever `seed` currently holds.
// `null` models the engine handing out no seed yet (seen at load timing).
function fakeConfiguration(seedBox) {
  const kv = new Map();
  return {
    _kv: kv,
    getGame: () => ({
      gameSeed: seedBox.value,
      getValue: (k) => (kv.has(k) ? kv.get(k) : null),
    }),
    editGame: () => ({ setValue: (k, v) => kv.set(k, v) }),
  };
}

// A one-tile map is enough: these tests are about whether generation runs at
// all, not about what it produces.
function fakeGameplayMap() {
  return {
    getGridWidth: () => 1,
    getGridHeight: () => 1,
    getIndexFromXY: (x, y) => y * 1 + x,
    getPlotDistance: () => 0,
    getAdjacentPlotLocation: () => ({ x: 0, y: 0 }),
    isWater: () => false,
    isLake: () => false,
    isMountain: () => false,
    isNavigableRiver: () => false,
    isNaturalWonder: () => false,
    getRiverName: () => null,
    getOwner: () => -1,
    getFeatureType: () => -1,
    getBiomeType: () => -1,
    getContinentType: () => -1,
    getAreaId: () => -1,
    getPlotLatitude: () => 0,
  };
}

function setup(seedBox) {
  resetSeedCache();
  resetStoreCache();
  globalThis.Configuration = fakeConfiguration(seedBox);
  globalThis.GameplayMap = fakeGameplayMap();
  globalThis.Players = { get: () => null };
  globalThis.GameInfo = {};
}

// --- tests -------------------------------------------------------------------

test("no seed: reports no seed and generates nothing", () => {
  const seed = { value: null };
  setup(seed);

  assert.equal(hasGameSeed(), false);
  assert.deepEqual(computeLabels(), []);
});

test("no seed: writes nothing to the per-game store", () => {
  const seed = { value: null };
  setup(seed);

  computeLabels();
  // The old fallback generated a full name set under the shared `1` bucket and
  // persisted it. Nothing must be stored without a real seed.
  assert.equal(globalThis.Configuration._kv.size, 0);
});

test("no seed: a rename is refused rather than keyed to a bucket that is never read back", () => {
  const seed = { value: null };
  setup(seed);

  assert.equal(setCustomLabelName("region:0", "Anywhere"), false);
  assert.equal(globalThis.Configuration._kv.size, 0);
});

test("seed arrives after a deferred compute: generation resumes", () => {
  const seed = { value: null };
  setup(seed);

  assert.equal(computeLabels().length, 0);
  seed.value = 12345;
  assert.equal(hasGameSeed(), true);
  // Deferral must not be sticky: the next compute runs for real.
  assert.notEqual(getLastComputedLabels(), null);
  assert.equal(Array.isArray(computeLabels()), true);
});

test("intermittent null read after a good seed still reuses the last good seed", () => {
  const seed = { value: 777 };
  setup(seed);

  assert.equal(hasGameSeed(), true);
  seed.value = null; // transient null read on a later compute
  assert.equal(hasGameSeed(), true);
});
