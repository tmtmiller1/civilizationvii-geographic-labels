import {
  axisAngleDeg,
  circularMeanX,
  frame,
  typeFont,
  wrapDeltaX,
} from "./geo-labels-format.js";
import { CIV_NAMES, GENERIC, NEUTRAL } from "./geo-labels-toponyms.js";
import { isCategoryVisible, safe, STORE_KEY } from "./geo-labels-utils.js";
import {
  anchorIndex,
  buildNearField,
  buildReachable,
  collectFeatures,
  scanMap,
} from "./geo-labels-map.js";
import { collectWaterFeatures } from "./geo-labels-water.js";
import { collectRivers } from "./geo-labels-rivers.js";

const WONDER_OFFSET = 8;
const CONTINENT_MIN_TILES = 80;

// Bump when a change makes previously-stored label keys unmappable, so
// migrateStore() can reset stale per-game state exactly once.
//   1 -> 2: label keys moved from volatile engine area ids to stable geometry
//           anchors (v1.0.3). Old auto/custom entries can't be remapped.
const SCHEMA_VERSION = 2;
const HEARTLAND_RADIUS = 4;

function dims() {
  return {
    w: GameplayMap.getGridWidth(),
    h: GameplayMap.getGridHeight(),
  };
}

function gameSeed() {
  return (safe(() => Configuration.getGame().gameSeed) || 1) >>> 0;
}

function gridW() {
  return safe(() => GameplayMap.getGridWidth()) || 0;
}

function centroid(plots) {
  const w = gridW();
  const cx = circularMeanX(plots, w); // wrap-aware so seam-straddling regions center correctly
  let sy = 0;
  for (const p of plots) sy += p.y;
  const cy = sy / plots.length;
  let best = plots[0];
  let bd = Infinity;
  for (const p of plots) {
    const dx = wrapDeltaX(p.x, cx, w);
    const d = dx * dx + (p.y - cy) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rand) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

function hash01(value) {
  let h = (2166136261 ^ gameSeed()) >>> 0;
  const str = String(value);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function readStore() {
  const raw = safe(() => localStorage.getItem(STORE_KEY));
  const o = raw ? safe(() => JSON.parse(raw)) : null;
  // Only ever return a plain object — a corrupted store that parses to a
  // primitive/array would otherwise throw on `all._schema = …` / Object.keys.
  return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
}

function writeStore(value) {
  safe(() => localStorage.setItem(STORE_KEY, JSON.stringify(value)));
}

// Unguarded variant so saveGame's quota fallback can actually catch a throw;
// writeStore swallows every error via safe(), which would defeat the retry.
function writeStoreRaw(value) {
  localStorage.setItem(STORE_KEY, JSON.stringify(value));
}

function loadGame() {
  const all = readStore();
  const key = String(gameSeed());
  const game = all[key] || {};
  return {
    custom: game.custom || {},
    auto: game.auto || {},
  };
}

function saveGame(state) {
  const key = String(gameSeed());
  // Merge into the existing store rather than rebuilding it, so saving one
  // game never drops other games' labels (which caused names to re-roll when
  // switching games) or the schema stamp.
  const all = readStore();
  all[key] = {
    custom: state.custom || {},
    auto: state.auto || {},
  };
  try {
    writeStoreRaw(all);
  } catch (_e) {
    // Over quota: drop the regenerable auto names (they recompute next pass)
    // and retry with only the user's custom renames preserved.
    all[key] = {
      custom: state.custom || {},
      auto: {},
    };
    writeStore(all);
  }
}

// One-time reset when the key scheme changes (see SCHEMA_VERSION). Old per-game
// auto/custom entries were keyed on engine area ids that can't be mapped to the
// new geometry anchors, and a stale key can even collide with a new one and
// surface the wrong name — so clear them once. Auto names regenerate
// deterministically; custom (manual) names revert to auto. Runs before any
// state is read, and only until the schema stamp is written.
function migrateStore() {
  const all = readStore();
  if ((all._schema || 1) >= SCHEMA_VERSION) return;
  for (const key of Object.keys(all)) {
    if (key === "_settings" || key === "_schema") continue;
    all[key] = { custom: {}, auto: {} };
  }
  all._schema = SCHEMA_VERSION;
  writeStore(all);
}

export function getFlatSetting() {
  const all = readStore();
  return !!(all._settings && all._settings.flat);
}

export function setFlatSetting(value) {
  const all = readStore();
  if (!all._settings) all._settings = {};
  all._settings.flat = !!value;
  writeStore(all);
}

function makeNamePicker(rand) {
  const used = new Set();
  const cursors = new Map();
  const shuffledPools = new Map();

  const getPool = (civ, typeKey) => {
    if (civ && CIV_NAMES[civ] && CIV_NAMES[civ][typeKey] && CIV_NAMES[civ][typeKey].length) {
      return CIV_NAMES[civ][typeKey];
    }
    return GENERIC[typeKey] || NEUTRAL;
  };

  const getShuffled = (civ, typeKey) => {
    const key = (civ || "_") + ":" + typeKey;
    let pool = shuffledPools.get(key);
    if (!pool) {
      pool = shuffled(getPool(civ, typeKey), rand);
      shuffledPools.set(key, pool);
    }
    return pool;
  };

  const nextName = (civ, typeKey) => {
    const pool = getShuffled(civ, typeKey);
    const key = (civ || "_") + ":" + typeKey;
    let i = cursors.get(key) || 0;

    for (let t = 0; t < pool.length; t++, i++) {
      const name = pool[i % pool.length];
      if (used.has(name)) continue;
      used.add(name);
      cursors.set(key, i + 1);
      return name;
    }

    for (const neutral of NEUTRAL) {
      if (used.has(neutral)) continue;
      used.add(neutral);
      return neutral;
    }

    cursors.set(key, i + 1);
    return pool[i % pool.length];
  };

  return { used, nextName };
}

function reserveExistingAutoNames(feats, auto, used) {
  for (const f of feats) {
    if (!auto[f.key] || !auto[f.key].n) continue;
    used.add(auto[f.key].n);
  }
}

function addContinentLabels(areas, custom, labels, w) {
  for (const area of areas) {
    if (area.plots.length < CONTINENT_MIN_TILES) continue;
    // Geometry-derived key (not the volatile engine area id) so custom
    // continent names stay attached across save/reload.
    const key = "cont:" + anchorIndex(area.plots, w);
    const text = custom[key] || continentName(area.continent);
    if (!text) continue;
    labels.push({
      key,
      plot: centroid(area.plots),
      text,
      fontSize: typeFont(key, area.plots.length),
      angle: axisAngleDeg(area.plots, w),
      cust: !!custom[key],
    });
  }
}

function continentName(continentType) {
  if (typeof continentType !== "number" || continentType === -1) return null;
  const def = safe(() => GameInfo.Continents.lookup(continentType));
  if (!def || !def.Description) return null;
  return safe(() => Locale.compose(def.Description)) || null;
}

function addWonderLabels(wonders, custom, labels) {
  for (const [featureType, wonder] of wonders) {
    labels.push({
      key: "wonder:" + featureType,
      plot: centroid(wonder.plots),
      text: custom["wonder:" + featureType] || wonder.name,
      fontSize: typeFont("wonder:", wonder.plots.length),
      offset: { x: 0, y: WONDER_OFFSET, z: 8 + WONDER_OFFSET },
      cust: !!custom["wonder:" + featureType],
    });
  }
}

function nearLookup(nearField, plots) {
  const c = centroid(plots);
  const found = nearField.get(c.x + "," + c.y);
  if (!found) return { civ: null, dist: 999 };
  return { civ: found.civ, dist: found.dist };
}

function shouldReflavor(prev, near, key) {
  if (!near.civ || near.dist > HEARTLAND_RADIUS) return false;
  const chance = Math.max(0, 1 - near.dist / (HEARTLAND_RADIUS + 1));
  return hash01(key) < chance;
}

function chooseToponym(feature, auto, near, nextName, used) {
  const prev = auto[feature.key];
  if (!prev) {
    const name = nextName(near.civ, feature.typeKey);
    auto[feature.key] = { n: name, c: near.civ || "" };
    return { toponym: name, flipped: false };
  }

  const sameCiv = (prev.c || "") === (near.civ || "");
  if (sameCiv || !shouldReflavor(prev, near, feature.key)) {
    return { toponym: prev.n, flipped: false };
  }

  used.delete(prev.n);
  const name = nextName(near.civ, feature.typeKey);
  auto[feature.key] = { n: name, c: near.civ };
  return { toponym: name, flipped: true };
}

function addFeatureLabels(ctx) {
  const {
    feats,
    custom,
    auto,
    nearField,
    picker,
    labels,
    w,
  } = ctx;
  let flips = 0;
  for (const feature of feats) {
    const customName = custom[feature.key];
    if (customName) {
      labels.push(customLabel(feature, customName, w));
      continue;
    }

    // A feature with an engine-supplied name (e.g. an estuary's river name)
    // skips the toponym picker and renders that name directly through frame().
    if (feature.fixedName) {
      labels.push({
        key: feature.key,
        plot: centroid(feature.plots),
        text: frame(feature.typeKey, feature.fixedName),
        fontSize: typeFont(feature.key, feature.plots.length),
        angle: axisAngleDeg(feature.plots, w),
      });
      continue;
    }

    const near = nearLookup(nearField, feature.plots);
    const chosen = chooseToponym(feature, auto, near, picker.nextName, picker.used);
    if (chosen.flipped) flips++;

    labels.push({
      key: feature.key,
      plot: centroid(feature.plots),
      text: frame(feature.typeKey, chosen.toponym),
      fontSize: typeFont(feature.key, feature.plots.length),
      angle: axisAngleDeg(feature.plots, w),
    });
  }
  return flips;
}

function customLabel(feature, name, w) {
  return {
    key: feature.key,
    plot: centroid(feature.plots),
    text: name,
    fontSize: typeFont(feature.key, feature.plots.length),
    angle: axisAngleDeg(feature.plots, w),
    cust: true,
  };
}

function pruneAuto(auto, feats) {
  const live = new Set(feats.map((f) => f.key));
  for (const key of Object.keys(auto)) {
    if (live.has(key)) continue;
    delete auto[key];
  }
}

function suppressOverlaps(labels) {
  const priority = {
    wonder: 6,
    cont: 5,
    seas: 5, // large water basins read like continents in prominence
    isle: 4,
    archipelagos: 4,
    mountains: 3,
    lakes: 3,
    rivernav: 3, // prominent water channels; outrank the minor-river label
    gulfs: 3,
    bays: 3,
    keys: 3,
    deserts: 2, // must match cat.typeKey "deserts" (the key prefix labelType extracts)
    taiga: 2,
    jungle: 2,
    reefs: 2,
    atolls: 2,
    sounds: 2,
    inlets: 2,
    fjords: 2,
    estuaries: 2,
    riverminor: 1, // faint valley labels sit below almost everything
  };

  labels.sort((a, b) => {
    const ac = a.cust ? 1 : 0;
    const bc = b.cust ? 1 : 0;
    if (bc !== ac) return bc - ac;
    const bp = priority[labelType(b)] || 0;
    const ap = priority[labelType(a)] || 0;
    if (bp !== ap) return bp - ap;
    return b.fontSize - a.fontSize;
  });

  const placed = [];
  const shown = [];
  for (const label of labels) {
    const radius = labelReach(label);
    // Rivers are linear features whose centroid almost always lands inside some
    // area label (a desert/continent), so ordinary overlap suppression hides
    // them every time. Let them bypass it — always shown, and NOT added to
    // `placed`, so they neither get suppressed nor suppress area labels. The
    // per-category toggle and the glyph budget still gate them.
    if (isRiverLabel(label)) {
      label._r = radius;
      shown.push(label);
      continue;
    }
    if (!label.cust && overlaps(label, radius, placed)) continue;
    label._r = radius;
    placed.push(label);
    shown.push(label);
  }
  return shown;
}

function isRiverLabel(label) {
  return label.key.startsWith("rivernav:") || label.key.startsWith("riverminor:");
}

function labelType(label) {
  return label.key.slice(0, label.key.indexOf(":"));
}

function labelReach(label) {
  const len = String(label.text).replace(/\s+/g, "").length;
  const raw = Math.round(len * label.fontSize * 0.05);
  return Math.max(2, Math.min(10, raw));
}

function overlaps(label, radius, placed) {
  for (const p of placed) {
    const d = safe(() =>
      GameplayMap.getPlotDistance(label.plot.x, label.plot.y, p.plot.x, p.plot.y),
    );
    if (typeof d !== "number") continue;
    if (d < Math.max(radius, p._r)) return true;
  }
  return false;
}

// --- Render-resource safety cap -------------------------------------------
// The engine's UI renderer holds at most ~49,152 draw resources per frame
// across the WHOLE UI (base-game unit flags, banners, panels, and our labels).
// Overflow it and the renderer segfaults — a real crash we traced to this exact
// limit ("ResourceList.AddResource(), attempting to add more than 49152 items"
// in Renderer.log at the crash second). Our labels persist in the sprite grid,
// so their glyph count is a fixed per-frame cost. Bound it to a small slice of
// the engine cap so this mod can never be the straw that overflows the list,
// regardless of map size or how many features it generates.
export const LABEL_BUDGET = { maxLabels: 300, maxGlyphs: 6000 };

// Trim a label list to fit the budget, keeping the highest-priority labels.
// Input MUST already be ordered most-important-first (suppressOverlaps does
// this) so the tail we drop is the least important. Pure; the glyph-cost fn is
// injectable so the layer can measure the actual painted (letter-spaced) string
// while tests use a trivial cost.
export function budgetLabels(
  labels,
  budget = LABEL_BUDGET,
  glyphCost = (l) => String(l.text).length,
) {
  const maxLabels = budget.maxLabels ?? Infinity;
  const maxGlyphs = budget.maxGlyphs ?? Infinity;
  const kept = [];
  let glyphs = 0;
  for (const label of labels) {
    const cost = glyphCost(label);
    if (kept.length >= maxLabels || glyphs + cost > maxGlyphs) break;
    kept.push(label);
    glyphs += cost;
  }
  return { kept, glyphs, dropped: labels.length - kept.length };
}

export function computeLabels(log = () => {}) {
  const prepared = prepareComputation();
  const {
    custom,
    auto,
    picker,
    scanned,
    areas,
    nearField,
    features,
    w,
  } = prepared;

  const labels = [];
  addContinentLabels(areas, custom, labels, w);
  addWonderLabels(scanned.wonders, custom, labels);
  const flips = addFeatureLabels({
    feats: features.feats,
    custom,
    auto,
    nearField,
    picker,
    labels,
    w,
  });

  pruneAuto(auto, features.feats);
  saveGame({ custom, auto });

  // Drop player-hidden categories BEFORE overlap suppression so a hidden label
  // can't crowd out a visible one it happens to sit near.
  const visible = labels.filter((label) => isCategoryVisible(labelType(label)));
  const shown = suppressOverlaps(visible);
  logSummary({ log, labels: visible, shown, features, scanned, flips });

  return shown;
}

function prepareComputation() {
  const { w, h } = dims();
  migrateStore();
  const state = loadGame();
  const custom = state.custom;
  const auto = state.auto;
  const picker = makeNamePicker(mulberry32(gameSeed()));
  const scanned = scanMap(w, h);
  const areas = [...scanned.land.values()];
  const nearField = buildNearField(scanned.seeds, w, h);
  const reached = buildReachable(areas, w, h);
  const features = collectFeatures({
    areas,
    reached,
    mountainTiles: scanned.mountainTiles,
    biomeTiles: scanned.biomeTiles,
    lakeTiles: scanned.lakeTiles,
    featureTiles: scanned.featureTiles,
    w,
    h,
  });

  // Phase 2/3 geometry-derived water features (basins, estuaries, island groups)
  // flow through the same feats pipeline as land regions.
  const waterFeats = collectWaterFeatures({
    seaTiles: scanned.seaTiles,
    landSet: scanned.landSet,
    navRiverTiles: scanned.navRiverTiles,
    mountainTiles: scanned.mountainTiles,
    islets: features.islets,
    w,
    h,
  });
  features.feats.push(...waterFeats);

  // Named rivers (navigable water channels + minor land-edge rivers). Like
  // estuaries they carry an engine name, so they ride the same fixedName path.
  const riverFeats = collectRivers({
    namedRiverTiles: scanned.namedRiverTiles,
    w,
    h,
  });
  features.feats.push(...riverFeats);

  reserveExistingAutoNames(features.feats, auto, picker.used);
  return {
    custom,
    auto,
    picker,
    scanned,
    areas,
    nearField,
    features,
    w,
  };
}

function logSummary(ctx) {
  const { log, labels, shown, features, scanned, flips } = ctx;
  const rivers = features.feats.filter((f) => f.typeKey === "rivers").length;
  const regions = features.feats.length - features.islands.length;
  log(`computed ${labels.length} labels -> ${shown.length} shown (`
    + `${features.islands.length} islands, ${regions} regions, ${scanned.wonders.size} wonders, `
    + `${rivers} rivers, ${flips} re-flavored, ${labels.length - shown.length} hidden by overlap)`);
}
