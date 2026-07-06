/**
 * Geographic Labels — Civ VI-style names painted on the Civ VII map.
 *
 * Labels CONTINENTS (engine names), ISLANDS (generated names), and NATURAL WONDERS (engine names),
 * as a toggleable map-decoration layer (checkbox next to "Yields" in the mini-map lens menu).
 *
 * Island vs. mainland is decided by pure tile connectivity (flood-fill from large landmasses across
 * land / lakes / navigable rivers, but NEVER ocean): anything the flood can't reach is a real island.
 * No distance/continent-label heuristics.
 *
 * Rendering uses WorldUI.SpriteGrid.addText (the only path that honors opacity + no outline), placed at
 * each region's centroid. Settings below are the values dialed in during probe tuning.
 */

import LensManager from "/core/ui/lenses/lens-manager.js";

const TAG = "[GeoLabels]";
const LAYER_TYPE = "tmt-geo-labels-layer";

// ---- locked-in look (from probe tuning) --------------------------------------------------------
const FONTS = ["TitleFont", "TitleFont-SC", "TitleFont-TC", "TitleFont-JP", "TitleFont-KR"];
const LABEL_ALPHA = 64;        // text opacity 0..255 (ABGR high byte) — soft/translucent
const LABEL_STROKE = 0;        // no outline (the "blocky" look)
const FONT_SCALE = 1.0;
const FACE_CAMERA = true;      // upright/billboard
const WONDER_OFFSET = 8;       // world-space nudge so wonder names float off their art
const MIN_LABEL_TILES = 3;     // don't label islands smaller than this (clutter floor)
const CONTINENT_MIN_TILES = 80; // a land area this big is a "large landmass" (continent seed)
const NBSP = String.fromCharCode(0xa0);

const NAME_POOL = [
  "Avalon", "Thule", "Hesperia", "Cathay", "Zephyra", "Calypso", "Meridian", "Halcyon", "Nerida",
  "Corvenna", "Sable", "Marisol", "Verdant Isle", "Coral Reach", "Ashen Isle", "Tempest Isle",
  "Selkie", "Fenwick", "Drakemoor", "Windward", "Leeward", "Sunder", "Kestrel", "Petrel", "Osprey",
  "Stormhold", "Mistral", "Tarshish", "Ophir", "Erytheia", "Antilla", "Brasil", "Estotiland",
  "Frisland", "Mayda", "Buss", "Saxemberg", "Pactolus", "Aurelia", "Halbard", "Cormorant", "Gannet",
  "Skerry", "Holm", "Ness", "Fell", "Barra", "Rona", "Foula", "Sanda", "Colla", "Iona", "Lundy",
  "Herm", "Sark", "Alderney", "Ushant", "Belle Isle", "Anticosti", "Miquelon", "Sable Isle",
  "Providencia", "San Telmo", "Cayo Verde", "Isla Mora", "Punta Blanca", "Vela", "Mareterra",
  "Solvenn", "Karnholm", "Vindr", "Eldsey", "Grimsey", "Surtsey", "Heimaey", "Fugloy", "Nolsoy",
  "Mykines", "Koltur", "Hestur", "Sandoy", "Vagar", "Kunoy", "Bordoy", "Svinoy", "Dimun",
  "Talara", "Chincha", "Lobos", "Sechura", "Guanay", "Ballestas", "Foca", "Asia Isle", "Palomino",
  "Redonda", "Aves", "Blanquilla", "Tortuga", "Orchila", "Roques", "Coche", "Cubagua", "Patos",
  "Mariel", "Cortes", "Zapata", "Romano", "Sabinal", "Turiguano", "Cayo Largo", "Guajaba",
];

// ---- map helpers ------------------------------------------------------------------------------
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

// UPPERCASE + non-breaking-space letter spacing (regular spaces collapse in Gameface world text).
function styleText(s) {
  const up = String(s).toUpperCase();
  const lg = NBSP;
  const wg = lg + NBSP + NBSP + lg;
  return up.split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/([A-Z0-9])(?=[A-Z0-9])/g, "$1" + lg))
    .join(wg);
}

// Seeded PRNG so island names are stable across a save/reload but vary per game.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- classification ---------------------------------------------------------------------------
// Returns { labels: [{ plot:{x,y}, text, fontSize, offset }] } computed once for this game.
function computeLabels() {
  const { w, h } = dims();
  const land = new Map();      // areaId -> { id, plots, continent }
  const continents = new Map(); // continentType -> { type, name, areas:[areaRef] }
  const wonders = new Map();   // featureType -> { name, plots }

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
      }
      if (safe(() => GameplayMap.isNaturalWonder(x, y)) === true) {
        const ft = safe(() => GameplayMap.getFeatureType(x, y));
        if (typeof ft === "number" && ft !== -1) {
          let wr = wonders.get(ft);
          if (!wr) {
            const def = safe(() => GameInfo.Features.lookup(ft));
            const nm = def && def.Name ? safe(() => Locale.compose(def.Name)) : null;
            wr = { name: nm || "Wonder", plots: [] }; wonders.set(ft, wr);
          }
          wr.plots.push({ x, y });
        }
      }
    }
  }

  const areas = [...land.values()];

  // Flood-fill from large landmasses across land/lake/navigable-river (never ocean/coast).
  const NUM_DIR = 6;
  const neighbors = (p) => {
    const out = [];
    for (let d = 0; d < NUM_DIR; d++) {
      const n = safe(() => GameplayMap.getAdjacentPlotLocation({ x: p.x, y: p.y }, d));
      if (n && typeof n.x === "number" && n.x >= 0 && n.y >= 0 && n.x < w && n.y < h) out.push(n);
    }
    return out;
  };
  const crossable = (x, y) => {
    if (safe(() => GameplayMap.isWater(x, y)) !== true) return true;
    if (safe(() => GameplayMap.isLake(x, y)) === true) return true;
    if (safe(() => GameplayMap.isNavigableRiver(x, y)) === true) return true;
    return false;
  };
  const reached = new Set();
  const queue = [];
  for (const a of areas) {
    if (a.plots.length >= CONTINENT_MIN_TILES) for (const p of a.plots) { const k = p.x + "," + p.y; if (!reached.has(k)) { reached.add(k); queue.push(p); } }
  }
  while (queue.length) {
    const p = queue.pop();
    for (const n of neighbors(p)) {
      const k = n.x + "," + n.y;
      if (reached.has(k) || !crossable(n.x, n.y)) continue;
      reached.add(k); queue.push(n);
    }
  }

  const labels = [];

  // Continents: label each large landmass once with its engine continent name.
  for (const a of areas) {
    if (a.plots.length < CONTINENT_MIN_TILES) continue;
    let nm = null;
    if (typeof a.continent === "number" && a.continent !== -1) {
      const def = safe(() => GameInfo.Continents.lookup(a.continent));
      if (def && def.Description) nm = safe(() => Locale.compose(def.Description));
    }
    if (nm) labels.push({ plot: centroid(a.plots), text: nm, fontSize: scaledFont(a.plots.length) });
  }

  // Islands: areas the flood couldn't reach (ocean-separated) and big enough. Deterministic names.
  const seed = safe(() => Configuration.getGame().gameSeed) || 1;
  const rand = mulberry32(seed >>> 0);
  const pool = NAME_POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  const islands = areas
    .filter((a) => a.plots.length >= MIN_LABEL_TILES && !a.plots.some((p) => reached.has(p.x + "," + p.y)))
    .sort((a, b) => a.id - b.id); // stable order for stable name assignment
  islands.forEach((a, i) => {
    const text = pool[i % pool.length];
    labels.push({ plot: centroid(a.plots), text, fontSize: scaledFont(a.plots.length) });
  });

  // Natural wonders: engine names, nudged above their art.
  for (const wr of wonders.values()) {
    labels.push({ plot: centroid(wr.plots), text: wr.name, fontSize: scaledFont(wr.plots.length), offset: { x: 0, y: WONDER_OFFSET, z: 8 + WONDER_OFFSET } });
  }

  log("computed", labels.length, "labels (" + islands.length + " islands)");
  return labels;
}

// ---- lens layer -------------------------------------------------------------------------------
class GeoLabelsLayer {
  constructor() {
    this._group = null;
    this._grid = null;
    this._drawn = false;
  }
  _ensure() {
    if (this._grid) return true;
    return safe(() => {
      this._group = WorldUI.createOverlayGroup("GeoLabelsOverlay", 10);
      this._grid = WorldUI.createSpriteGrid("GeoLabelsGrid", true);
      return true;
    }) === true;
  }
  _draw() {
    if (this._drawn || !this._ensure()) return;
    const labels = computeLabels();
    const fill = (LABEL_ALPHA & 0xff) * 0x1000000 + 0xffffff;
    for (const l of labels) {
      const idx = safe(() => GameplayMap.getIndexFromXY(l.plot.x, l.plot.y));
      const ref = (typeof idx === "number") ? idx : l.plot;
      const off = l.offset || { x: 0, y: 0, z: 8 };
      safe(() => this._grid.addText(ref, styleText(l.text), off, { fonts: FONTS, fontSize: l.fontSize, stroke: LABEL_STROKE, fill, faceCamera: FACE_CAMERA }));
    }
    this._drawn = true;
  }
  initLayer() { /* compute lazily on first apply */ }
  applyLayer() { this._draw(); safe(() => this._grid && this._grid.setVisible(true)); }
  removeLayer() { safe(() => this._grid && this._grid.setVisible(false)); }
}

const instance = new GeoLabelsLayer();
safe(() => LensManager.registerLensLayer(LAYER_TYPE, instance));
try { if (typeof window !== "undefined") window.__geoLabels = { type: LAYER_TYPE, recompute: () => { instance._drawn = false; instance._draw(); } }; } catch (_e) {}
log("layer registered:", LAYER_TYPE);

export { LAYER_TYPE };
