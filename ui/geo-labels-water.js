// Phase 2/3 water & coastal features that need geometry, not just tile-type
// matching: estuaries (river mouths), archipelagos/keys (island groups), and
// enclosure-classified basins (seas/gulfs/bays/sounds/inlets/fjords).
//
// The engine has NO semantic tag for sea vs gulf vs bay vs sound vs inlet vs
// fjord — they are all just water. We infer them from a water region's
// enclosure (how surrounded by land it is) and shape (size + elongation), and
// the classification is intentionally a flavor heuristic. Every threshold below
// is a tunable; they want tuning against real maps. Fjords are additionally
// latitude-gated so they only appear in the polar/subpolar bands.

import { safe } from "./geo-labels-utils.js";
import { neighbors, regionsOf, anchorIndex } from "./geo-labels-map.js";

// --- enclosure / basin tunables ---
const ENCLOSE_RADIUS = 3; // half-width of the box sampled around a water tile
const SEXT_MIN_SAMPLES = 2; // land tiles in a 60° sextant for it to count as "land there"
const ENCLOSE_MIN_SEXTANTS = 4; // land in >= this many of 6 sextants => enclosed (bay/gulf/sea)
const BASIN_MIN = 4; // smallest enclosed basin (tiles) that earns a label
const SEA_MIN = 40; // basin tiles >= this -> "sea"
const GULF_MIN = 14; // -> "gulf"
const BAY_MIN = 6; // -> "bay"; smaller -> "inlet"
const ELONGATION_MIN = 3.0; // major/minor axis ratio at/above which a basin is "narrow"
const FJORD_LAT_MIN = 50; // |latitude| (deg); fjords only poleward of this band

// --- island-group tunables ---
const ARCH_LINK_DIST = 4; // hex distance linking two islands into one group
const ARCH_MIN_ISLANDS = 3; // islands in a group needed to name it
const ARCH_MAX_ISLAND_TILES = 24; // islands larger than this stand alone, not grouped
const KEYS_MAX_AVG_TILES = 2; // group whose islands average this small -> "keys"

// --- estuary tunables ---
const ESTUARY_MIN = 1; // smallest river-mouth cluster to label

export function collectWaterFeatures(ctx) {
  return [
    ...collectBasins(ctx),
    ...collectEstuaries(ctx),
    ...collectArchipelagos(ctx),
  ];
}

// ---------------------------------------------------------------------------
// Enclosed basins -> seas / gulfs / bays / sounds / inlets / fjords
// ---------------------------------------------------------------------------

function collectBasins(ctx) {
  const { seaTiles, landSet, mountainTiles, w, h } = ctx;
  if (!seaTiles || !seaTiles.size) return [];
  const landGrid = gridFromSet(landSet, w, h);
  const enclosed = enclosedTiles(seaTiles, landGrid, w, h);
  const feats = [];
  for (const plots of regionsOf(enclosed, w, h, true)) {
    if (plots.length < BASIN_MIN) continue;
    const typeKey = classifyBasin({
      area: plots.length,
      elongation: elongation(plots, w),
      latAbs: latAbsAt(plots),
      mountainAdjacent: touchesSet(plots, mountainTiles, w, h),
    });
    feats.push({ key: typeKey + ":" + anchorIndex(plots, w), typeKey, plots });
  }
  return feats;
}

// Pure classifier (kept side-effect free so it is unit-testable). Order matters:
// a narrow basin becomes a sound/fjord before size buckets apply, and fjords
// require both the polar latitude band and adjacent mountains.
export function classifyBasin({ area, elongation, latAbs, mountainAdjacent }) {
  if (area >= SEA_MIN) return "seas";
  if (elongation >= ELONGATION_MIN) {
    if (latAbs >= FJORD_LAT_MIN && mountainAdjacent) return "fjords";
    return "sounds";
  }
  if (area >= GULF_MIN) return "gulfs";
  if (area >= BAY_MIN) return "bays";
  return "inlets";
}

function gridFromSet(set, w, h) {
  const grid = new Uint8Array(w * h);
  if (!set) return grid;
  for (const key of set) {
    const [x, y] = splitKey(key);
    grid[x + y * w] = 1;
  }
  return grid;
}

// Directional enclosure (engine-call-free, over the x-wrapped/y-clamped land
// grid). A raw land *fraction* can't tell a bay from a straight open coast —
// both are ~half land — so instead we bin surrounding land into six 60°
// sextants and ask on how many SIDES land sits. Open coast fills one ~180° arc
// (~3 sextants); a bay/gulf/sea-interior has land on 3+ sides (>=4 sextants); a
// narrow channel (sound/fjord/strait) has land on two OPPOSITE sides. A sextant
// only counts if it holds >= SEXT_MIN_SAMPLES land tiles, so a stray corner tile
// on a straight shore doesn't read as enclosure.
export function isEnclosed(x, y, landGrid, w, h) {
  const sides = sextantCounts(x, y, landGrid, w, h).map((c) => c >= SEXT_MIN_SAMPLES);
  const active = sides.filter(Boolean).length;
  const opposite = (sides[0] && sides[3]) || (sides[1] && sides[4]) || (sides[2] && sides[5]);
  return active >= ENCLOSE_MIN_SEXTANTS || opposite;
}

// Bin surrounding land tiles (x-wrapped/y-clamped box) into six 60° sextants.
function sextantCounts(x, y, landGrid, w, h) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (let dy = -ENCLOSE_RADIUS; dy <= ENCLOSE_RADIUS; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= h) continue;
    for (let dx = -ENCLOSE_RADIUS; dx <= ENCLOSE_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue;
      const xx = ((x + dx) % w + w) % w;
      if (!landGrid[xx + yy * w]) continue;
      const ang = (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI);
      counts[Math.min(5, Math.floor(ang / (Math.PI / 3)))]++;
    }
  }
  return counts;
}

function enclosedTiles(seaTiles, landGrid, w, h) {
  const out = new Set();
  for (const key of seaTiles) {
    const [x, y] = splitKey(key);
    if (isEnclosed(x, y, landGrid, w, h)) out.add(key);
  }
  return out;
}

// Elongation = ratio of the principal-axis standard deviations (major/minor) of
// the plot cloud, wrap-aware in x. ~1 is round; large is a long thin channel.
function elongation(plots, w) {
  const { sxx, syy, sxy } = covariance(plots, w);
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  if (l2 <= 1e-6) return l1 > 1e-6 ? Infinity : 1;
  return Math.sqrt(l1 / l2);
}

function covariance(plots, w) {
  const mx = wrapMeanX(plots, w);
  let my = 0;
  for (const p of plots) my += p.y;
  my /= plots.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of plots) {
    const dx = wrapDelta(p.x, mx, w);
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const n = plots.length;
  return { sxx: sxx / n, syy: syy / n, sxy: sxy / n };
}

function latAbsAt(plots) {
  const p = plots[Math.floor(plots.length / 2)];
  const lat = safe(() => GameplayMap.getPlotLatitude(p.x, p.y));
  return typeof lat === "number" ? Math.abs(lat) : 0;
}

function touchesSet(plots, set, w, h) {
  if (!set || !set.size) return false;
  for (const p of plots) {
    for (const n of neighbors(p, w, h)) {
      if (set.has(n.x + "," + n.y)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Estuaries — navigable-river mouths meeting the sea
// ---------------------------------------------------------------------------

function collectEstuaries(ctx) {
  const { navRiverTiles, seaTiles, w, h } = ctx;
  if (!navRiverTiles || !navRiverTiles.size) return [];
  const mouths = new Set();
  for (const key of navRiverTiles) {
    const [x, y] = splitKey(key);
    if (adjacentToSea(x, y, seaTiles, w, h)) mouths.add(key);
  }
  const feats = [];
  for (const plots of regionsOf(mouths, w, h, false)) {
    if (plots.length < ESTUARY_MIN) continue;
    feats.push({
      key: "estuaries:" + anchorIndex(plots, w),
      typeKey: "estuaries",
      plots,
      fixedName: riverNameAt(plots), // engine river name -> "Nile Estuary" when known
    });
  }
  return feats;
}

function adjacentToSea(x, y, seaTiles, w, h) {
  if (!seaTiles) return false;
  for (const n of neighbors({ x, y }, w, h)) {
    if (seaTiles.has(n.x + "," + n.y)) return true;
  }
  return false;
}

function riverNameAt(plots) {
  for (const p of plots) {
    const raw = safe(() => GameplayMap.getRiverName(p.x, p.y));
    if (raw && typeof raw === "string" && raw.trim().length > 1) {
      // getRiverName returns a localization KEY (e.g. "LOC_RIVER_..._NAME"), so
      // compose it; Locale.compose passes plain strings through. Drop a trailing
      // "River" so frame() doesn't yield "Nile River Estuary".
      const composed = safe(() => Locale.compose(raw.trim())) || raw.trim();
      return composed.replace(/\s+River$/i, "").trim();
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Archipelagos & keys — clusters of nearby islands
// ---------------------------------------------------------------------------

function collectArchipelagos(ctx) {
  const { islets, w } = ctx;
  if (!islets || islets.length < ARCH_MIN_ISLANDS) return [];
  // Only small landmasses cluster into archipelagos; a large island stands alone.
  const members = islets.filter((a) => a.plots.length <= ARCH_MAX_ISLAND_TILES);
  if (members.length < ARCH_MIN_ISLANDS) return [];
  const nodes = members.map((a) => ({ plots: a.plots, c: plainCentroid(a.plots) }));
  const feats = [];
  for (const group of clusterByDistance(nodes)) {
    if (group.length < ARCH_MIN_ISLANDS) continue;
    const plots = group.flatMap((n) => n.plots);
    const avgTiles = plots.length / group.length;
    const typeKey = avgTiles <= KEYS_MAX_AVG_TILES ? "keys" : "archipelagos";
    feats.push({ key: typeKey + ":" + anchorIndex(plots, w), typeKey, plots });
  }
  return feats;
}

// Single-linkage grouping: islands within ARCH_LINK_DIST (hex) of each other
// join the same group. O(n^2) over islands, which is a modest count.
function clusterByDistance(nodes) {
  const parent = nodes.map((_n, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (hexDist(nodes[i].c, nodes[j].c) <= ARCH_LINK_DIST) {
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(nodes[i]);
  }
  return [...groups.values()];
}

function hexDist(a, b) {
  const d = safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y));
  return typeof d === "number" ? d : Infinity;
}

function plainCentroid(plots) {
  let sx = 0;
  let sy = 0;
  for (const p of plots) {
    sx += p.x;
    sy += p.y;
  }
  const cx = sx / plots.length;
  const cy = sy / plots.length;
  let best = plots[0];
  let bd = Infinity;
  for (const p of plots) {
    const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function splitKey(key) {
  const c = key.indexOf(",");
  return [+key.slice(0, c), +key.slice(c + 1)];
}

function wrapDelta(a, b, w) {
  let d = (a - b) % w;
  if (d > w / 2) d -= w;
  else if (d < -w / 2) d += w;
  return d;
}

function wrapMeanX(plots, w) {
  const k = (2 * Math.PI) / w;
  let ss = 0;
  let sc = 0;
  for (const p of plots) {
    ss += Math.sin(p.x * k);
    sc += Math.cos(p.x * k);
  }
  return (((Math.atan2(ss, sc) / k) % w) + w) % w;
}
