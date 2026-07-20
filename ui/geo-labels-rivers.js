// Named-river labels. A river in Civ VII is an EDGE, and the engine reports its
// name (via GameplayMap.getRiverName) on any tile it touches — the bank tiles of
// both minor and navigable rivers, water tiles, etc. — not just tiles a river
// TYPE flag classifies. So the scan queries getRiverName on every tile
// (scanned.namedRiverTiles: "x,y" -> raw LOC key); here we compose the names,
// group tiles into connected river systems, and emit one label per system placed
// at its centroid and angled along its course (the fixedName path estuaries use).
// A system is tagged navigable if any of its tiles is a navigable river, else
// minor — driving the two visibility toggles.

import { safe } from "./geo-labels-utils.js";
import { regionsOf, anchorIndex } from "./geo-labels-map.js";

// Smallest connected tile count that earns a label — drops 1-tile name specks.
const RIVER_MIN = 2;

export function collectRivers(ctx) {
  const { namedRiverTiles, w, h } = ctx;
  if (!namedRiverTiles || !namedRiverTiles.size) return [];
  const feats = [];
  for (const [name, keys] of bucketByName(namedRiverTiles)) {
    for (const plots of regionsOf(keys, w, h, false)) {
      if (plots.length < RIVER_MIN) continue;
      const prefix = componentIsNavigable(plots) ? "rivernav" : "riverminor";
      feats.push({
        key: prefix + ":" + anchorIndex(plots, w),
        typeKey: "rivers",
        plots,
        fixedName: name,
      });
    }
  }
  return feats;
}

// Group tile keys by composed river name. `named` is a Map "x,y" -> raw LOC key.
function bucketByName(named) {
  const byName = new Map();
  for (const [key, raw] of named) {
    const name = composeRiverName(raw);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name).add(key);
  }
  return byName;
}

function componentIsNavigable(plots) {
  for (const p of plots) {
    if (safe(() => GameplayMap.isNavigableRiver(p.x, p.y)) === true) return true;
  }
  return false;
}

// getRiverName returns a localization KEY (e.g. "LOC_RIVER_WADI_HANIFA_NAME"),
// NOT display text — verified live in UI.log — so it must be composed.
// Locale.compose passes a plain string through unchanged, so this stays correct
// if a build ever hands back an already-composed name. A trailing "River" is
// stripped so frame() ("<name> River") doesn't double it.
export function composeRiverName(raw) {
  if (!raw || typeof raw !== "string" || raw.trim().length < 2) return null;
  const composed = safe(() => Locale.compose(raw.trim())) || raw.trim();
  return composed.replace(/\s+River$/i, "").trim();
}

// Composed river name at a plot (or null). Kept for the compute-side census.
export function riverNameAt(x, y) {
  return composeRiverName(safe(() => GameplayMap.getRiverName(x, y)));
}
