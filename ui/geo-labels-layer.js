/**
 * Geographic Labels — Civ VI-style names painted on the Civ VII map.
 *
 * Labels: CONTINENTS (engine names), ISLANDS, DESERTS, MOUNTAIN RANGES, TAIGA (tundra), JUNGLE (tropical),
 * and NATURAL WONDERS (engine names). Region/island names come from the nearest civilization's own city-name
 * list (GameInfo.CityNames) so a place near Rome gets a Roman name; unclaimed areas use a neutral pool.
 * Region labels carry a type clarifier ("Namib Desert", "Isle of ...", "... Mountains").
 *
 * Island vs mainland = ocean-crossing flood-fill (reachable from a large landmass across land/lake/river = not
 * an island). Player-set custom names (from the Rename Places panel) override generated names.
 *
 * Toggleable map-decoration layer (checkbox next to "Yields" in the mini-map lens menu).
 */

import LensManager from "/core/ui/lenses/lens-manager.js";

const TAG = "[GeoLabels]";
const LAYER_TYPE = "tmt-geo-labels-layer";
const STORE_KEY = "tmt-geo-labels"; // localStorage: { "<gameSeed>": { "<featureKey>": "<customName>" } }

// ---- locked-in look ---------------------------------------------------------------------------
const FONTS = ["TitleFont", "TitleFont-SC", "TitleFont-TC", "TitleFont-JP", "TitleFont-KR"];
const LABEL_ALPHA = 64, LABEL_STROKE = 0, FONT_SCALE = 1.0, FACE_CAMERA = true;
const WONDER_OFFSET = 8, MIN_LABEL_TILES = 3, CONTINENT_MIN_TILES = 80;
const NBSP = String.fromCharCode(0xa0);

// Region categories: biome (or mountain terrain) -> label suffix + min region size.
const BIOME_CATS = [
  { biome: "BIOME_DESERT", suffix: "Desert", min: 8 },
  { biome: "BIOME_TUNDRA", suffix: "Taiga", min: 10 },
  { biome: "BIOME_TROPICAL", suffix: "Jungle", min: 8 },
  { biome: "BIOME_GRASSLAND", suffix: "Plains", min: 20 },
  { biome: "BIOME_PLAINS", suffix: "Steppe", min: 20 },
];
const MOUNTAIN_CAT = { suffix: "Mountains", min: 5 };

const NEUTRAL_POOL = [
  "Avalon", "Thule", "Hesperia", "Zephyra", "Calypso", "Meridian", "Halcyon", "Nerida", "Corvenna",
  "Sable", "Marisol", "Verdant", "Coral", "Ashen", "Tempest", "Selkie", "Fenwick", "Drakemoor",
  "Windward", "Leeward", "Sunder", "Kestrel", "Petrel", "Osprey", "Stormhold", "Mistral", "Tarshish",
  "Ophir", "Erytheia", "Antilla", "Aurelia", "Cormorant", "Skerry", "Holm", "Ness", "Fell", "Barra",
  "Rona", "Foula", "Iona", "Lundy", "Herm", "Sark", "Ushant", "Solvenn", "Karnholm", "Vindr", "Eldsey",
  "Grimsey", "Talara", "Chincha", "Sechura", "Guanay", "Redonda", "Aves", "Tortuga", "Orchila", "Coche",
];

// ---- helpers ----------------------------------------------------------------------------------
function log() { try { console.error.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
function safe(fn) { try { return fn(); } catch (_e) { return undefined; } }
function dims() { return { w: GameplayMap.getGridWidth(), h: GameplayMap.getGridHeight() }; }

function centroid(plots) {
  let sx = 0, sy = 0;
  for (const p of plots) { sx += p.x; sy += p.y; }
  const cx = sx / plots.length, cy = sy / plots.length;
  let best = plots[0], bd = Infinity;
  for (const p of plots) { const d = (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy); if (d < bd) { bd = d; best = p; } }
  return best;
}
function scaledFont(size) {
  const f = (3 + 1.15 * Math.log(Math.max(2, size))) * FONT_SCALE;
  return Math.max(5, Math.min(16, Math.round(f * 10) / 10));
}
function styleText(s) {
  const up = String(s).toUpperCase();
  const wg = NBSP + NBSP + NBSP + NBSP;
  return up.split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/([A-Z0-9])(?=[A-Z0-9])/g, "$1" + NBSP))
    .join(wg);
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function gameSeed() { return (safe(() => Configuration.getGame().gameSeed) || 1) >>> 0; }

// Custom names set by the player (Rename Places panel), keyed by gameSeed -> featureKey.
function loadOverrides() {
  return safe(() => {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw);
    return all[String(gameSeed())] || {};
  }) || {};
}
function saveOverride(key, name) {
  safe(() => {
    const raw = localStorage.getItem(STORE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const g = String(gameSeed());
    if (!all[g]) all[g] = {};
    const v = (name || "").trim();
    if (v) all[g][key] = v; else delete all[g][key]; // empty -> revert to generated name
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  });
}

// Hex neighbors via the engine (correct offset-hex adjacency).
function neighbors(p, w, h) {
  const out = [];
  for (let d = 0; d < 6; d++) {
    const n = safe(() => GameplayMap.getAdjacentPlotLocation({ x: p.x, y: p.y }, d));
    if (n && typeof n.x === "number" && n.x >= 0 && n.y >= 0 && n.x < w && n.y < h) out.push(n);
  }
  return out;
}

// ---- civ name pools + nearest-civ attribution -------------------------------------------------
function buildCivPools(rand) {
  const byType = new Map();
  safe(() => {
    for (const row of GameInfo.CityNames) {
      const ct = row.CivilizationType;
      const nm = safe(() => Locale.compose(row.CityName));
      if (!ct || !nm) continue;
      if (!byType.has(ct)) byType.set(ct, []);
      byType.get(ct).push(nm);
    }
  });
  const pools = new Map();
  for (const [ct, names] of byType) pools.set(ct, { names: shuffled(names, rand), idx: 0 });
  return pools;
}

// Nearest owning civ's CivilizationType string (or null), scanning rings out from the feature.
function nearestCivType(plots, w, h) {
  const c = centroid(plots);
  const R = 12;
  for (let r = 0; r <= R; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const x = c.x + dx, y = c.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (safe(() => GameplayMap.getPlotDistance(c.x, c.y, x, y)) !== r) continue;
        const owner = safe(() => GameplayMap.getOwner(x, y));
        if (typeof owner !== "number" || owner < 0) continue;
        const pl = safe(() => Players.get(owner));
        const civHash = pl && pl.civilizationType;
        if (civHash == null) continue;
        const def = safe(() => GameInfo.Civilizations.lookup(civHash));
        const ct = def && def.CivilizationType;
        if (ct && ct !== "CIVILIZATION_INDEPENDENT" && ct !== "CIVILIZATION_NONE") return ct;
      }
    }
  }
  return null;
}

// ---- classification + labels ------------------------------------------------------------------
function computeLabels() {
  const { w, h } = dims();
  const overrides = loadOverrides();
  const rand = mulberry32(gameSeed());
  const civPools = buildCivPools(rand);
  const neutral = { names: shuffled(NEUTRAL_POOL, rand), idx: 0 };

  function pick(civType) {
    const pool = (civType && civPools.get(civType)) || neutral;
    const nm = pool.names[pool.idx % pool.names.length];
    pool.idx++;
    return nm;
  }
  function nameFor(key, plots, suffix) {
    if (overrides[key]) return overrides[key];                      // player-set name wins, verbatim
    const civ = nearestCivType(plots, w, h);
    const base = pick(civ);
    if (!suffix) return base;
    return suffix === "Isle" ? ("Isle of " + base) : (base + " " + suffix);
  }

  const land = new Map();     // areaId -> { id, plots, continent }
  const wonders = new Map();  // featureType -> { name, plots }
  const biomeTiles = new Map(); // biomeStr -> Set("x,y")
  const mountainTiles = new Set();
  const biomeName = new Map(); // biome id -> BiomeType string (cache)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const water = safe(() => GameplayMap.isWater(x, y)) === true;
      if (!water) {
        const a = safe(() => GameplayMap.getAreaId(x, y));
        if (typeof a === "number" && a > -1) {
          let rec = land.get(a);
          if (!rec) { rec = { id: a, plots: [], continent: safe(() => GameplayMap.getContinentType(x, y)) }; land.set(a, rec); }
          rec.plots.push({ x, y });
        }
        if (safe(() => GameplayMap.isMountain(x, y)) === true) mountainTiles.add(x + "," + y);
        const bt = safe(() => GameplayMap.getBiomeType(x, y));
        if (typeof bt === "number") {
          let bs = biomeName.get(bt);
          if (bs === undefined) { const d = safe(() => GameInfo.Biomes.lookup(bt)); bs = (d && d.BiomeType) || null; biomeName.set(bt, bs); }
          if (bs) { if (!biomeTiles.has(bs)) biomeTiles.set(bs, new Set()); biomeTiles.get(bs).add(x + "," + y); }
        }
      }
      if (safe(() => GameplayMap.isNaturalWonder(x, y)) === true) {
        const ft = safe(() => GameplayMap.getFeatureType(x, y));
        if (typeof ft === "number" && ft !== -1) {
          let wr = wonders.get(ft);
          if (!wr) { const def = safe(() => GameInfo.Features.lookup(ft)); wr = { name: (def && def.Name && safe(() => Locale.compose(def.Name))) || "Wonder", plots: [] }; wonders.set(ft, wr); }
          wr.plots.push({ x, y });
        }
      }
    }
  }

  const areas = [...land.values()];

  // Ocean-crossing flood-fill from large landmasses -> islands are what it can't reach.
  const reached = new Set();
  const queue = [];
  for (const a of areas) if (a.plots.length >= CONTINENT_MIN_TILES) for (const p of a.plots) { const k = p.x + "," + p.y; if (!reached.has(k)) { reached.add(k); queue.push(p); } }
  const crossable = (x, y) => {
    if (safe(() => GameplayMap.isWater(x, y)) !== true) return true;
    if (safe(() => GameplayMap.isLake(x, y)) === true) return true;
    if (safe(() => GameplayMap.isNavigableRiver(x, y)) === true) return true;
    return false;
  };
  while (queue.length) {
    const p = queue.pop();
    for (const n of neighbors(p, w, h)) { const k = n.x + "," + n.y; if (reached.has(k) || !crossable(n.x, n.y)) continue; reached.add(k); queue.push(n); }
  }

  // Contiguous regions within a set of "x,y" tile keys.
  function regionsOf(tileSet) {
    const remaining = new Set(tileSet), regions = [];
    for (const start of tileSet) {
      if (!remaining.has(start)) continue;
      const plots = [], stack = [start]; remaining.delete(start);
      while (stack.length) {
        const k = stack.pop(); const c = k.indexOf(","); const p = { x: +k.slice(0, c), y: +k.slice(c + 1) };
        plots.push(p);
        for (const n of neighbors(p, w, h)) { const nk = n.x + "," + n.y; if (remaining.has(nk)) { remaining.delete(nk); stack.push(nk); } }
      }
      regions.push(plots);
    }
    return regions;
  }

  const labels = [];
  let nIsle = 0, nRegion = 0;

  // Continents (engine names).
  for (const a of areas) {
    if (a.plots.length < CONTINENT_MIN_TILES) continue;
    let nm = null;
    if (typeof a.continent === "number" && a.continent !== -1) { const def = safe(() => GameInfo.Continents.lookup(a.continent)); if (def && def.Description) nm = safe(() => Locale.compose(def.Description)); }
    const key = "cont:" + a.id;
    const text = overrides[key] || nm;
    if (text) labels.push({ key, plot: centroid(a.plots), text, fontSize: scaledFont(a.plots.length) });
  }

  // Islands (nearest-civ names, "Isle of ...").
  const islands = areas.filter((a) => a.plots.length >= MIN_LABEL_TILES && !a.plots.some((p) => reached.has(p.x + "," + p.y))).sort((a, b) => a.id - b.id);
  for (const a of islands) { const key = "isle:" + a.id; labels.push({ key, plot: centroid(a.plots), text: nameFor(key, a.plots, "Isle"), fontSize: scaledFont(a.plots.length) }); nIsle++; }

  // Biome regions + mountain ranges (nearest-civ names + type clarifier).
  const cats = BIOME_CATS.map((c) => ({ suffix: c.suffix, min: c.min, tiles: biomeTiles.get(c.biome) || new Set() }));
  cats.push({ suffix: MOUNTAIN_CAT.suffix, min: MOUNTAIN_CAT.min, tiles: mountainTiles });
  for (const cat of cats) {
    for (const plots of regionsOf(cat.tiles)) {
      if (plots.length < cat.min) continue;
      const cen = centroid(plots);
      const key = cat.suffix.toLowerCase() + ":" + Math.min.apply(null, plots.map((p) => p.x + p.y * w)); // stable region key
      labels.push({ key, plot: cen, text: nameFor(key, plots, cat.suffix), fontSize: scaledFont(plots.length) });
      nRegion++;
    }
  }

  // Natural wonders (engine names, floated above their art).
  for (const [ft, wr] of wonders) { const key = "wonder:" + ft; labels.push({ key, plot: centroid(wr.plots), text: overrides[key] || wr.name, fontSize: scaledFont(wr.plots.length), offset: { x: 0, y: WONDER_OFFSET, z: 8 + WONDER_OFFSET } }); }

  log("computed", labels.length, "labels:", nIsle, "islands,", nRegion, "regions,", wonders.size, "wonders");
  return labels;
}

// ---- lens layer -------------------------------------------------------------------------------
class GeoLabelsLayer {
  constructor() { this._group = null; this._grid = null; this._drawn = false; }
  _ensure() {
    if (this._grid) return true;
    return safe(() => { this._group = WorldUI.createOverlayGroup("GeoLabelsOverlay", 10); this._grid = WorldUI.createSpriteGrid("GeoLabelsGrid", true); return true; }) === true;
  }
  _draw() {
    if (this._drawn || !this._ensure()) return;
    const fill = (LABEL_ALPHA & 0xff) * 0x1000000 + 0xffffff;
    this._labels = computeLabels();
    for (const l of this._labels) {
      const idx = safe(() => GameplayMap.getIndexFromXY(l.plot.x, l.plot.y));
      const ref = (typeof idx === "number") ? idx : l.plot;
      const off = l.offset || { x: 0, y: 0, z: 8 };
      safe(() => this._grid.addText(ref, styleText(l.text), off, { fonts: FONTS, fontSize: l.fontSize, stroke: LABEL_STROKE, fill, faceCamera: FACE_CAMERA }));
    }
    this._drawn = true;
  }
  labels() { return this._labels || (this._labels = computeLabels()); }
  _redraw() { safe(() => this._grid && this._grid.clear()); this._drawn = false; this._draw(); }
  initLayer() {}
  applyLayer() { this._draw(); safe(() => this._grid && this._grid.setVisible(true)); }
  removeLayer() { safe(() => this._grid && this._grid.setVisible(false)); }
}

const instance = new GeoLabelsLayer();
safe(() => LensManager.registerLensLayer(LAYER_TYPE, instance));
try {
  if (typeof window !== "undefined") window.__geoLabels = {
    type: LAYER_TYPE,
    recompute: () => instance._redraw(),
    // For the Rename Places panel: list current labels, and set/clear a custom name.
    getLabels: () => instance.labels().map((l) => ({ key: l.key, text: l.text, type: l.key.slice(0, l.key.indexOf(":")) })),
    setName: (key, name) => { saveOverride(key, name); instance._redraw(); },
  };
} catch (_e) {}
// The Rename Places panel dispatches this after editing a name.
try { if (typeof window !== "undefined") window.addEventListener("tmt-geo-labels-changed", () => instance._redraw()); } catch (_e) {}
log("layer registered:", LAYER_TYPE);

export { LAYER_TYPE };
