/**
 * Geographic Labels — per-game name store.
 *
 * Per-game state (auto-generated names + the player's renames) lives in the
 * GameConfiguration key-value store: `Configuration.editGame().setValue` /
 * `Configuration.getGame().getValue`. That surface is saved with the game,
 * survives quit→load and the age transition, and holds well over 4MB (validated
 * for the demographics mod, 2026-06-08).
 *
 * It replaces Gameface's shared localStorage for per-game data. localStorage's
 * tiny quota is why the original Rename Places feature failed: every past game's
 * generated names accumulated under one key until a player's rename silently
 * failed to write, and the redraw (which re-read the store) showed the old name.
 *
 * Global settings (flat labels, hidden categories) stay in localStorage — they
 * are player-wide, tiny, and must survive across games.
 *
 * The store also keeps an in-session cache: a rename is visible to the very
 * next compute even if the durable write throws (which is logged, never silent).
 */

import { retireLegacyStore, safe, STORE_KEY } from "./geo-labels-utils.js";

export const GAME_KEY = "TmtGeoLabels__names";
// Schema stamp the localStorage FALLBACK writer maintains (mirrors the old
// migrateStore). NOT required on import — see readLegacyGame.
export const LEGACY_SCHEMA_MIN = 2;

let cache = null; // { seed, custom, auto }
let lastWriteError = null;

function emptyState() {
  return { custom: {}, auto: {} };
}

function normalize(game) {
  if (!game || typeof game !== "object") return emptyState();
  return {
    custom: (game.custom && typeof game.custom === "object") ? game.custom : {},
    auto: (game.auto && typeof game.auto === "object") ? game.auto : {},
  };
}

// --- GameConfiguration backend ---------------------------------------------

function configAvailable() {
  return (
    typeof Configuration !== "undefined" &&
    typeof Configuration.getGame === "function" &&
    typeof Configuration.editGame === "function"
  );
}

function configRead() {
  const g = safe(() => Configuration.getGame());
  const v = g && typeof g.getValue === "function" ? safe(() => g.getValue(GAME_KEY)) : null;
  return typeof v === "string" && v ? v : null;
}

// Unguarded on purpose: the caller records a throw as a write failure.
function configWrite(text) {
  const e = Configuration.editGame();
  if (!e || typeof e.setValue !== "function") throw new Error("editGame().setValue unavailable");
  e.setValue(GAME_KEY, text);
}

function parseConfig(seed) {
  const raw = configRead();
  if (!raw) return null;
  const o = safe(() => JSON.parse(raw));
  if (!o || typeof o !== "object") return null;
  // A stale record from another game on this config surface is ignored, not
  // reused: names would otherwise leak between games.
  if (String(o.seed) !== String(seed)) return null;
  return normalize(o);
}

// --- legacy localStorage backend (import source + fallback) -----------------

function readLegacyStore() {
  const raw = safe(() => localStorage.getItem(STORE_KEY));
  const o = raw ? safe(() => JSON.parse(raw)) : null;
  return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
}

function writeLegacyStore(all) {
  safe(() => localStorage.setItem(STORE_KEY, JSON.stringify(all)));
}

// Import this game's entry from the legacy private key. Deliberately does NOT
// require the `_schema` stamp: the shared localStorage has been seen to lose
// our `_schema`/`_settings` fields (another mod's envelope smeared across every
// key), and a lost stamp must not cost the player this game's names. The
// worst case for a pre-geometry-key entry (v1.0.2, July 2026) is a different
// auto name; custom names never shipped in those builds.
function readLegacyGame(seed) {
  const game = readLegacyStore()[String(seed)];
  if (!game || typeof game !== "object") return null;
  if (!game.auto && !game.custom) return null;
  return normalize(game);
}

// Fallback-only writer (no config API). Mirrors the old migrateStore: a store
// below the geometry-key schema is reset once and stamped, so stale entries
// keyed on volatile engine ids can never surface the wrong name.
function writeLegacyGame(seed, state) {
  const all = readLegacyStore();
  if ((all._schema || 1) < LEGACY_SCHEMA_MIN) {
    for (const k of Object.keys(all)) if (k[0] !== "_") delete all[k];
    all._schema = LEGACY_SCHEMA_MIN;
  }
  all[String(seed)] = { custom: state.custom, auto: state.auto };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch (_e) {
    // Over quota: keep the player's renames, drop the regenerable auto names.
    all[String(seed)] = { custom: state.custom, auto: {} };
    writeLegacyStore(all);
  }
}

// --- public API -------------------------------------------------------------

/** Per-game state for `seed`: { custom, auto }. Never throws, never null. */
export function readGameState(seed) {
  if (cache && String(cache.seed) === String(seed)) {
    return { custom: cache.custom, auto: cache.auto };
  }
  let state = null;
  if (configAvailable()) {
    state = parseConfig(seed);
    if (!state) {
      const legacy = readLegacyGame(seed);
      if (legacy) {
        state = legacy;
        writeGameState(seed, legacy);
      }
    }
    // Once names are durable, the private key has nothing left to offer:
    // retire it (settings were imported by geo-labels-utils) so the mod holds
    // no second top-level localStorage key.
    retireLegacyStore();
  } else {
    state = readLegacyGame(seed);
  }
  state = state || emptyState();
  cache = { seed, custom: state.custom, auto: state.auto };
  return { custom: cache.custom, auto: cache.auto };
}

/** Persist per-game state. Updates the in-session cache first so a failed
 *  durable write is still visible this session (and reported via
 *  getLastWriteError). */
export function writeGameState(seed, state) {
  const s = normalize(state);
  cache = { seed, custom: s.custom, auto: s.auto };
  if (!configAvailable()) {
    writeLegacyGame(seed, s);
    return true;
  }
  try {
    configWrite(JSON.stringify({ seed: String(seed), custom: s.custom, auto: s.auto }));
    lastWriteError = null;
    return true;
  } catch (e) {
    lastWriteError = e;
    return false;
  }
}

/** Set (or, with a blank name, clear) the player's name for a label key. */
export function setCustomName(seed, key, name) {
  const state = readGameState(seed);
  const v = String(name == null ? "" : name).trim();
  if (v) state.custom[key] = v;
  else delete state.custom[key];
  return writeGameState(seed, state);
}

export function getLastWriteError() {
  return lastWriteError;
}

/** Test hook: forget the in-session cache. */
export function resetStoreCache() {
  cache = null;
  lastWriteError = null;
}
