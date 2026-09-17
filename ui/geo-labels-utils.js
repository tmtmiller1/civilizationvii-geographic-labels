/**
 * Shared runtime utilities for Geographic Labels, plus the player-wide settings
 * store (terrain-following labels, hidden categories).
 *
 * Settings live in the shared `modSettings` localStorage blob, one slice per
 * mod, which is the convention the ModOptions ecosystem (sib / trixie /
 * beezany / demographics) enforces — several of those mods treat any OTHER
 * top-level localStorage key as corruption and wipe the blob. The mod's old
 * private key (`tmt-geo-labels`) is imported once and then removed.
 *
 * Coherent's localStorage is flaky (transient empty reads, other mods' values
 * smeared across keys, occasional unparseable values), so:
 *   - the in-memory bucket is authoritative after the first read;
 *   - an empty read is re-read once before it is believed;
 *   - a present-but-unparseable blob is never overwritten (siblings would die);
 *   - only this mod's slice is ever written; the blob is never reset to `{}`.
 * Per-game names are NOT here — see geo-labels-store.js (GameConfiguration).
 */

export const STORE_KEY = "tmt-geo-labels"; // legacy private key, retired after import
export const ROOT_KEY = "modSettings";
export const MOD_SLICE = "tmt-geographic-labels";

export function safe(fn) {
  try {
    return fn();
  } catch (_e) {
    return undefined;
  }
}

export function createLogger(tag, isEnabled) {
  return function log() {
    if (!isEnabled()) return;
    try {
      console.error.apply(console, [tag].concat([].slice.call(arguments)));
    } catch (_e) {}
  };
}

function hasLocalStorage() {
  return typeof localStorage !== "undefined" && !!localStorage;
}

function readRaw(key) {
  if (!hasLocalStorage()) return null;
  return safe(() => localStorage.getItem(key)) || null;
}

function parseObject(raw) {
  if (!raw) return null;
  const o = safe(() => JSON.parse(raw));
  return (o && typeof o === "object" && !Array.isArray(o)) ? o : null;
}

/** Legacy private-key store (read-only; the key is retired after import). */
export function loadStore() {
  return parseObject(readRaw(STORE_KEY)) || {};
}

// --- settings bucket ---------------------------------------------------------

let memory = null; // { flat: boolean, hidden: { [categoryId]: true } }

function applySlice(slice) {
  if (!slice || typeof slice !== "object") return false;
  memory.flat = !!slice.flat;
  memory.hidden = (slice.hidden && typeof slice.hidden === "object") ? { ...slice.hidden } : {};
  return true;
}

function bucket() {
  if (memory) return memory;
  memory = { flat: false, hidden: {} };
  const root = parseObject(readRaw(ROOT_KEY));
  if (applySlice(root && root[MOD_SLICE])) return memory;
  // First run on this slice: adopt the legacy private key's settings, if any.
  const legacy = loadStore();
  if (applySlice(legacy._settings)) persist();
  return memory;
}

// Read the shared blob for a WRITE, guaranteeing sibling slices survive.
/**
 * Whether a parsed value actually looks like the shared settings root: an object whose
 * every top-level value is itself an object (one slice per mod id).
 *
 * Coherent's `localStorage.getItem()` in this UI context IGNORES the key it is given and
 * returns the value of the FIRST key in the store (watched 2026-09-16), so a read of
 * `modSettings` routinely hands back some other mod's blob. Such a blob parses fine and is
 * an object, so parseObject() passes it through — and writing it back would copy that blob
 * into the shared settings key and grow it without bound. Three ~370KB copies of one history
 * archive were found spread across `!chronicle`, `htlData` and `modSettings` from exactly
 * this. Real settings roots have only object values; the foreign blobs carry scalars
 * (`v: 2`, `updated: 178…`). On a mismatch decline to persist — never delete or rewrite.
 * @param {*} root A parsed candidate root.
 * @returns {boolean} True when it is shaped like a settings root.
 */
function looksLikeSettingsRoot(root) {
  return Object.keys(root).every((k) => {
    const v = root[k];
    return !!v && typeof v === "object" && !Array.isArray(v);
  });
}

function readRootForWrite() {
  if (!hasLocalStorage()) return { root: null, ok: false };
  let raw = readRaw(ROOT_KEY);
  if (!raw) raw = readRaw(ROOT_KEY); // defeat a transient empty read
  if (!raw) return { root: {}, ok: true }; // genuinely empty store
  const root = parseObject(raw);
  if (!root) return { root: null, ok: false };
  if (!looksLikeSettingsRoot(root)) return { root: null, ok: false };
  return { root, ok: true };
}

function persist() {
  const { root, ok } = readRootForWrite();
  if (!ok) return false;
  root[MOD_SLICE] = { flat: memory.flat, hidden: memory.hidden };
  return safe(() => {
    localStorage.setItem(ROOT_KEY, JSON.stringify(root));
    return true;
  }) === true;
}

export function getGlobalSettings() {
  const b = bucket();
  return { flat: b.flat, hidden: { ...b.hidden } };
}

export function setGlobalSettings(patch) {
  const b = bucket();
  if (patch && "flat" in patch) b.flat = !!patch.flat;
  if (patch && patch.hidden && typeof patch.hidden === "object") b.hidden = { ...patch.hidden };
  return persist();
}

// Per-category visibility. A category is VISIBLE unless explicitly hidden, so a
// missing store (fresh install, or a category added in a later version) shows
// everything by default.
export function isCategoryVisible(id) {
  return bucket().hidden[id] !== true;
}

export function setCategoryVisible(id, visible) {
  const b = bucket();
  if (visible) delete b.hidden[id];
  else b.hidden[id] = true;
  return persist();
}

/** Remove the legacy private key once its contents have been imported (settings
 *  here, this game's names in geo-labels-store.js). Other games' generated names
 *  in that key are not carried over; they regenerate once on next load. */
export function retireLegacyStore() {
  bucket(); // make sure settings were imported first
  if (readRaw(STORE_KEY) === null) return false;
  safe(() => localStorage.removeItem(STORE_KEY));
  return true;
}

/** Test hook. */
export function resetSettingsCache() {
  memory = null;
}
