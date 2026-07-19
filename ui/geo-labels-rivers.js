// Named-river labels. The engine names both river kinds — navigable rivers
// (their own water tiles, already scanned into navRiverTiles) and minor rivers
// (edges between LAND tiles, scanned into minorRiverTiles) — and exposes the
// name via GameplayMap.getRiverName(x,y). We bucket a kind's tiles by name and
// split each bucket into connected components, so one contiguous river system
// gets one label placed at its centroid and angled along its course (the same
// fixedName path estuaries use). Rivers with no engine name yield no label.

import { safe } from "./geo-labels-utils.js";
import { regionsOf, anchorIndex } from "./geo-labels-map.js";

// Smallest tile count that earns a label, per kind. Navigable rivers are
// prominent water channels, so even short ones read well; minor rivers touch
// many land tiles, so a higher floor keeps creeks from cluttering the map.
// Both are tunables that want checking against real maps.
const NAV_RIVER_MIN = 2;
const MINOR_RIVER_MIN = 5;

export function collectRivers(ctx) {
  const { navRiverTiles, minorRiverTiles, w, h } = ctx;
  return [
    ...collectKind(navRiverTiles, "rivernav", NAV_RIVER_MIN, w, h),
    ...collectKind(minorRiverTiles, "riverminor", MINOR_RIVER_MIN, w, h),
  ];
}

function collectKind(tiles, prefix, min, w, h) {
  if (!tiles || !tiles.size) return [];
  const feats = [];
  for (const [name, keys] of bucketByName(tiles)) {
    for (const plots of regionsOf(keys, w, h, false)) {
      if (plots.length < min) continue;
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

// Group tile keys by the engine river name they sit on; unnamed tiles drop out.
function bucketByName(tiles) {
  const byName = new Map();
  for (const key of tiles) {
    const [x, y] = splitKey(key);
    const name = riverNameAt(x, y);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name).add(key);
  }
  return byName;
}

// Engine river name at a plot, with a trailing "River" stripped so frame()
// ("<name> River") doesn't yield "Nile River River". Returns null when unnamed.
export function riverNameAt(x, y) {
  const nm = safe(() => GameplayMap.getRiverName(x, y));
  if (nm && typeof nm === "string" && nm.trim().length > 1) {
    return nm.trim().replace(/\s+River$/i, "").trim();
  }
  return null;
}

function splitKey(key) {
  const c = key.indexOf(",");
  return [+key.slice(0, c), +key.slice(c + 1)];
}
