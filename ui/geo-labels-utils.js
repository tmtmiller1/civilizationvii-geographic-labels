/**
 * Shared runtime utilities for Geographic Labels.
 */

export const STORE_KEY = "tmt-geo-labels";

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

export function loadStore() {
  const raw = safe(() => localStorage.getItem(STORE_KEY));
  return raw ? (safe(() => JSON.parse(raw)) || {}) : {};
}

export function saveStore(data) {
  safe(() => localStorage.setItem(STORE_KEY, JSON.stringify(data)));
}

export function getGlobalSettings() {
  const all = loadStore();
  return all._settings || {};
}

export function setGlobalSettings(patch) {
  const all = loadStore();
  if (!all._settings) all._settings = {};
  all._settings = Object.assign({}, all._settings, patch);
  saveStore(all);
}

// Per-category visibility. A category is VISIBLE unless explicitly hidden, so a
// missing store (fresh install, or a category added in a later version) shows
// everything by default. Hidden ids live in `_settings.hidden` as { id: true }.
export function isCategoryVisible(id) {
  const s = getGlobalSettings();
  return !(s.hidden && s.hidden[id] === true);
}

export function setCategoryVisible(id, visible) {
  const all = loadStore();
  if (!all._settings) all._settings = {};
  if (!all._settings.hidden) all._settings.hidden = {};
  if (visible) delete all._settings.hidden[id];
  else all._settings.hidden[id] = true;
  saveStore(all);
}
