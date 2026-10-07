// Named-river labels. A river in Civ VII is an edge, and the engine reports its
// name (GameplayMap.getRiverName) on any tile it touches, the bank tiles of
// minor and navigable rivers and water tiles alike, not just tiles a river type
// flag classifies. So the scan queries getRiverName on every tile
// (scanned.namedRiverTiles: "x,y" -> raw LOC key). This module composes the
// names, groups tiles into connected river systems, and emits one label per
// system at its centroid, angled along its course (the fixedName path estuaries
// use). A system is navigable if any of its tiles is a navigable river, else
// minor; the two visibility toggles key off that.

import { safe } from "./geo-labels-utils.js";
import { regionsOf, anchorIndex } from "./geo-labels-map.js";
import { firstForm } from "./geo-labels-l10n.js";

// Smallest connected tile count that earns a label; drops 1-tile name specks.
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

// getRiverName returns a localization key ("LOC_RIVER_WADI_HANIFA_NAME"), not
// display text, so it must be composed.
// Locale.compose passes a plain string through unchanged, so this stays correct
// if a build ever hands back an already-composed name. The composed text is the
// game's full display name and is shown as-is: most end in "River", but many
// carry their own form ("River Tay", "Wadi Hanifa", "Sông Hong", "Rio Negro",
// "Kolekole Stream", "Þjórsá"), so appending a generic doubled or mangled them.
// German, Polish and Russian names carry their case forms ("Волга|Волги|…"):
// only the first is the name.
export function composeRiverName(raw) {
  if (!raw || typeof raw !== "string" || raw.trim().length < 2) return null;
  const composed = safe(() => Locale.compose(raw.trim())) || raw.trim();
  return firstForm(composed).trim() || null;
}

// Composed river name at a plot (or null). Kept for the compute-side census.
export function riverNameAt(x, y) {
  return composeRiverName(safe(() => GameplayMap.getRiverName(x, y)));
}
