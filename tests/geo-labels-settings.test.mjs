import test from "node:test";
import assert from "node:assert/strict";

import {
  getGlobalSettings,
  isCategoryVisible,
  MOD_SLICE,
  resetSettingsCache,
  ROOT_KEY,
  setCategoryVisible,
  setGlobalSettings,
  STORE_KEY,
} from "../ui/geo-labels-utils.js";

function fakeLocalStorage({ flakyFirstRead = false } = {}) {
  const m = new Map();
  let reads = 0;
  return {
    getItem: (k) => {
      reads += 1;
      if (flakyFirstRead && reads === 1) return null; // Coherent transient empty read
      return m.has(k) ? m.get(k) : null;
    },
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

function root() {
  return JSON.parse(globalThis.localStorage.getItem(ROOT_KEY));
}

test("defaults: nothing hidden, labels billboard", () => {
  resetSettingsCache();
  globalThis.localStorage = fakeLocalStorage();
  assert.equal(isCategoryVisible("wonder"), true);
  assert.equal(getGlobalSettings().flat, false);
});

test("writes only our slice and preserves sibling mods' slices", () => {
  resetSettingsCache();
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem(ROOT_KEY, JSON.stringify({ demographics: { a: 1 }, "sib-x": { b: 2 } }));
  setCategoryVisible("taiga", false);
  setGlobalSettings({ flat: true });
  const r = root();
  assert.deepEqual(r.demographics, { a: 1 });
  assert.deepEqual(r["sib-x"], { b: 2 });
  assert.deepEqual(r[MOD_SLICE], { flat: true, hidden: { taiga: true } });
  resetSettingsCache();
  assert.equal(isCategoryVisible("taiga"), false);
  assert.equal(isCategoryVisible("jungle"), true);
  assert.equal(getGlobalSettings().flat, true);
});

test("refuses to write over an unparseable blob but still serves in-memory values", () => {
  resetSettingsCache();
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem(ROOT_KEY, "s{not json");
  assert.equal(setCategoryVisible("isle", false), false);
  assert.equal(globalThis.localStorage.getItem(ROOT_KEY), "s{not json");
  assert.equal(isCategoryVisible("isle"), false);
});

test("a transient empty read does not clobber siblings", () => {
  resetSettingsCache();
  globalThis.localStorage = fakeLocalStorage({ flakyFirstRead: true });
  globalThis.localStorage._map.set(ROOT_KEY, JSON.stringify({ "bz-map-trix": { keep: 1 } }));
  setGlobalSettings({ flat: true });
  assert.deepEqual(root()["bz-map-trix"], { keep: 1 });
  assert.equal(root()[MOD_SLICE].flat, true);
});

test("imports settings from the legacy private key on first use", () => {
  resetSettingsCache();
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem(STORE_KEY, JSON.stringify({ _settings: { flat: true, hidden: { seas: true } } }));
  assert.equal(isCategoryVisible("seas"), false);
  assert.equal(getGlobalSettings().flat, true);
  assert.deepEqual(root()[MOD_SLICE], { flat: true, hidden: { seas: true } });
});
