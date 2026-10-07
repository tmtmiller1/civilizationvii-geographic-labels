// The whole compute path in another language: labels in the display language, names saved as language-neutral
// stems, a rename in Japanese saved and read back after the store is reloaded.
import test from "node:test";
import assert from "node:assert/strict";

import { computeLabels, getLastPlaces, resetSeedCache, setCustomLabelName } from "../ui/geo-labels-compute.js";
import { GAME_KEY, resetStoreCache } from "../ui/geo-labels-store.js";

const W = 8; // one row of eight desert tiles: one desert region

function fakeEngine(locale) {
  const kv = new Map();
  globalThis.Configuration = {
    _kv: kv,
    getGame: () => ({ gameSeed: 4242, getValue: (k) => (kv.has(k) ? kv.get(k) : null) }),
    editGame: () => ({ setValue: (k, v) => kv.set(k, v) }),
  };
  globalThis.GameplayMap = {
    getGridWidth: () => W,
    getGridHeight: () => 1,
    getIndexFromXY: (x, y) => y * W + x,
    getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
    getAdjacentPlotLocation: ({ x, y }, d) => [{ x: x - 1, y }, { x: x + 1, y }][d] || { x: -1, y: -1 },
    isWater: () => false,
    isLake: () => false,
    isMountain: () => false,
    isNavigableRiver: () => false,
    isNaturalWonder: () => false,
    getRiverName: () => null,
    getOwner: () => -1,
    getFeatureType: () => -1,
    getBiomeType: () => 1,
    getContinentType: () => -1,
    getAreaId: () => -1,
    getPlotLatitude: () => 0,
  };
  globalThis.Players = { get: () => null };
  globalThis.GameInfo = { Biomes: { lookup: () => ({ BiomeType: "BIOME_DESERT" }) } };
  globalThis.Locale = locale;
  resetSeedCache();
  resetStoreCache();
  return kv;
}

// Japanese for every desert name: whole labels "<name>砂漠", bare names "<name>（ja）".
const ja = {
  compose(tag, ...args) {
    let m = /^LOC_GEO_NAME_DESERTS_(.+)$/.exec(tag);
    if (m) return m[1] + "砂漠";
    m = /^LOC_GEO_PLACE_(.+)$/.exec(tag);
    if (m) return m[1] + "（ja）";
    return args.length ? tag + args.join() : tag;
  },
  getCurrentDisplayLocale: () => "ja_JP",
};

test("pipeline: a generated label is drawn in the display language and saved as its stem", () => {
  const kv = fakeEngine(ja);
  const [label] = computeLabels();
  assert.match(label.key, /^deserts:/);
  assert.match(label.text, /^[A-Z_]+砂漠$/);
  const saved = JSON.parse(kv.get(GAME_KEY));
  const stem = saved.auto[label.key].n;
  assert.match(stem, /^[A-Za-z' -]+$/, "the saved name is the pool stem, not the Japanese");
  // What the National Parks mod names a park after: the bare name in the display language.
  assert.match(getLastPlaces().find((p) => p.key === label.key).toponym, /（ja）$/);

  // The same game in English draws the English label for the same stem.
  globalThis.Locale = undefined;
  resetStoreCache();
  globalThis.Configuration = { ...globalThis.Configuration };
  const [en] = computeLabels();
  assert.equal(en.text, stem + " Desert");
});

test("pipeline: a rename in Japanese is saved as ASCII and reads back the same after a reload", () => {
  const kv = fakeEngine(ja);
  const [label] = computeLabels();
  assert.equal(setCustomLabelName(label.key, "鳥取砂丘"), true);
  assert.match(kv.get(GAME_KEY), /^[\x20-\x7e]*$/);
  resetStoreCache();
  resetSeedCache();
  const after = computeLabels().find((l) => l.key === label.key);
  assert.equal(after.text, "鳥取砂丘");
  assert.equal(after.cust, true);
});
