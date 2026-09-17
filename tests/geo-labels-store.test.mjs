import test from "node:test";
import assert from "node:assert/strict";

import {
  GAME_KEY,
  getLastWriteError,
  readGameState,
  resetStoreCache,
  setCustomName,
  writeGameState,
} from "../ui/geo-labels-store.js";
import { MOD_SLICE, ROOT_KEY, resetSettingsCache, STORE_KEY } from "../ui/geo-labels-utils.js";

// --- fakes -------------------------------------------------------------------

function fakeLocalStorage(quota = Infinity) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > quota) throw new Error("QuotaExceededError");
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

function fakeConfiguration({ failWrites = false } = {}) {
  const kv = new Map();
  return {
    _kv: kv,
    getGame: () => ({ getValue: (k) => (kv.has(k) ? kv.get(k) : null) }),
    editGame: () => ({
      setValue: (k, v) => {
        if (failWrites) throw new Error("write refused");
        kv.set(k, v);
      },
    }),
  };
}

function setup(opts = {}) {
  resetStoreCache();
  resetSettingsCache();
  globalThis.localStorage = fakeLocalStorage(opts.quota);
  if (opts.config === false) delete globalThis.Configuration;
  else globalThis.Configuration = fakeConfiguration(opts);
}

// --- tests -------------------------------------------------------------------

test("round-trips per-game state through the game config store", () => {
  setup();
  writeGameState(42, { custom: { "isle:7": "Thule" }, auto: { "deserts:3": { n: "Sahra", c: "" } } });
  resetStoreCache(); // force a durable read
  const s = readGameState(42);
  assert.equal(s.custom["isle:7"], "Thule");
  assert.equal(s.auto["deserts:3"].n, "Sahra");
  const raw = JSON.parse(globalThis.Configuration._kv.get(GAME_KEY));
  assert.equal(raw.seed, "42");
  assert.equal(globalThis.localStorage.getItem(STORE_KEY), null, "nothing per-game goes to localStorage");
});

test("a record stamped with another game's seed is ignored", () => {
  setup();
  writeGameState(1, { custom: { "cont:1": "Mu" }, auto: {} });
  resetStoreCache();
  const s = readGameState(2);
  assert.deepEqual(s.custom, {});
  assert.deepEqual(s.auto, {});
});

test("setCustomName persists, and a blank name clears it", () => {
  setup();
  assert.equal(setCustomName(9, "mountains:5", "  Zagrus  "), true);
  resetStoreCache();
  assert.equal(readGameState(9).custom["mountains:5"], "Zagrus");
  setCustomName(9, "mountains:5", "");
  resetStoreCache();
  assert.equal(readGameState(9).custom["mountains:5"], undefined);
});

test("imports this game's legacy entry, carries settings over, then retires the private key", () => {
  setup();
  globalThis.localStorage.setItem(ROOT_KEY, JSON.stringify({ "bz-map-trix": { keep: 1 } }));
  globalThis.localStorage.setItem(STORE_KEY, JSON.stringify({
    _schema: 2,
    _settings: { flat: true, hidden: { taiga: true } },
    "77": { custom: { "isle:1": "Avalon" }, auto: { "taiga:2": { n: "Pohjola", c: "" } } },
  }));
  const s = readGameState(77);
  assert.equal(s.custom["isle:1"], "Avalon");
  assert.equal(s.auto["taiga:2"].n, "Pohjola");
  assert.ok(globalThis.Configuration._kv.get(GAME_KEY).includes("Avalon"));
  // Private key gone; settings landed in our modSettings slice; sibling intact.
  assert.equal(globalThis.localStorage.getItem(STORE_KEY), null);
  const root = JSON.parse(globalThis.localStorage.getItem(ROOT_KEY));
  assert.deepEqual(root[MOD_SLICE], { flat: true, hidden: { taiga: true } });
  assert.deepEqual(root["bz-map-trix"], { keep: 1 });
});

test("imports a legacy entry even when the schema stamp was lost to another mod's smear", () => {
  setup();
  globalThis.localStorage.setItem(STORE_KEY, JSON.stringify({
    v: 2, updated: 1784329667306, games: {}, // foreign envelope seen in the field
    "5": { custom: {}, auto: { "isle:3": { n: "Kept", c: "" } } },
  }));
  assert.equal(readGameState(5).auto["isle:3"].n, "Kept");
  assert.equal(globalThis.localStorage.getItem(STORE_KEY), null);
});

test("retires the private key even when it holds nothing for this game", () => {
  setup();
  globalThis.localStorage.setItem(STORE_KEY, JSON.stringify({ "999": { custom: {}, auto: {} } }));
  readGameState(1);
  assert.equal(globalThis.localStorage.getItem(STORE_KEY), null);
});

test("a rename stays visible in-session even when the durable write throws", () => {
  setup({ failWrites: true });
  assert.equal(setCustomName(3, "cont:2", "Lemuria"), false);
  assert.ok(getLastWriteError() instanceof Error);
  // No cache reset: this is what the very next compute sees.
  assert.equal(readGameState(3).custom["cont:2"], "Lemuria");
});

test("falls back to per-game localStorage when the config API is absent", () => {
  setup({ config: false });
  writeGameState(11, { custom: { "isle:4": "Ys" }, auto: {} });
  resetStoreCache();
  assert.equal(readGameState(11).custom["isle:4"], "Ys");
  const all = JSON.parse(globalThis.localStorage.getItem(STORE_KEY));
  assert.equal(all["11"].custom["isle:4"], "Ys");
});

test("localStorage fallback keeps renames and drops auto names when over quota", () => {
  setup({ config: false, quota: 120 });
  const bigAuto = {};
  for (let i = 0; i < 20; i++) bigAuto["deserts:" + i] = { n: "Name" + i, c: "ROME" };
  writeGameState(12, { custom: { "isle:1": "Kept" }, auto: bigAuto });
  const all = JSON.parse(globalThis.localStorage.getItem(STORE_KEY));
  assert.equal(all["12"].custom["isle:1"], "Kept");
  assert.deepEqual(all["12"].auto, {});
});
