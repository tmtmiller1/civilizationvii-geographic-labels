import { safe } from "./geo-labels-utils.js";
import { REGION_CATS, FEATURE_TO_TYPEKEY } from "./geo-labels-toponyms.js";

const MIN_LABEL_TILES = 3;
const CONTINENT_MIN_TILES = 80;

export function neighbors(p, w, h) {
  const out = [];
  for (let d = 0; d < 6; d++) {
    const n = safe(() =>
      GameplayMap.getAdjacentPlotLocation({ x: p.x, y: p.y }, d),
    );
    if (!n || typeof n.x !== "number") continue;
    if (n.x < 0 || n.y < 0 || n.x >= w || n.y >= h) continue;
    out.push(n);
  }
  return out;
}

function civForOwner(owner, cache) {
  if (cache.has(owner)) return cache.get(owner);
  let ct = null;
  const pl = safe(() => Players.get(owner));
  if (pl && pl.civilizationType != null) {
    const def = safe(() => GameInfo.Civilizations.lookup(pl.civilizationType));
    const civ = def && def.CivilizationType;
    if (civ && civ !== "CIVILIZATION_INDEPENDENT" && civ !== "CIVILIZATION_NONE") {
      ct = civ;
    }
  }
  cache.set(owner, ct);
  return ct;
}

export function buildNearField(seeds, w, h) {
  const field = new Map();
  let frontier = [];
  for (const s of seeds) {
    const key = s.x + "," + s.y;
    if (field.has(key)) continue;
    field.set(key, { civ: s.civ, dist: 0 });
    frontier.push({ x: s.x, y: s.y });
  }

  while (frontier.length) {
    const next = [];
    for (const p of frontier) {
      const base = field.get(p.x + "," + p.y);
      for (const n of neighbors(p, w, h)) {
        const key = n.x + "," + n.y;
        if (field.has(key)) continue;
        field.set(key, { civ: base.civ, dist: base.dist + 1 });
        next.push(n);
      }
    }
    frontier = next;
  }
  return field;
}

export function scanMap(w, h) {
  const ctx = {
    land: new Map(),
    wonders: new Map(),
    biomeTiles: new Map(),
    mountainTiles: new Set(),
    lakeTiles: new Set(),
    seaTiles: new Set(), // water && !lake (coast + ocean), for basin detection
    landSet: new Set(), // non-water tiles, for enclosure scoring
    navRiverTiles: new Set(), // navigable-river tiles, for estuaries + river labels
    minorRiverTiles: new Set(), // land tiles on a minor river, for river labels
    featureTiles: new Map(), // water typeKey ("reefs"/"atolls") -> Set of "x,y"
    featureTypeName: new Map(),
    biomeTypeName: new Map(),
    seeds: [],
    ownerCache: new Map(),
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      scanTile(x, y, ctx);
    }
  }

  return {
    land: ctx.land,
    wonders: ctx.wonders,
    biomeTiles: ctx.biomeTiles,
    mountainTiles: ctx.mountainTiles,
    lakeTiles: ctx.lakeTiles,
    seaTiles: ctx.seaTiles,
    landSet: ctx.landSet,
    navRiverTiles: ctx.navRiverTiles,
    minorRiverTiles: ctx.minorRiverTiles,
    featureTiles: ctx.featureTiles,
    seeds: ctx.seeds,
  };
}

function scanTile(x, y, ctx) {
  addSeed(x, y, ctx);
  const key = x + "," + y;
  if (safe(() => GameplayMap.isWater(x, y)) === true) {
    collectWaterTile(x, y, key, ctx);
  } else {
    ctx.landSet.add(key);
    collectLandTile({
      x, y,
      land: ctx.land,
      mountainTiles: ctx.mountainTiles,
      biomeTiles: ctx.biomeTiles,
      biomeTypeName: ctx.biomeTypeName,
    });
    if (isMinorRiver(x, y)) ctx.minorRiverTiles.add(key);
  }
  collectWaterFeatureTile({
    x, y,
    featureTiles: ctx.featureTiles,
    featureTypeName: ctx.featureTypeName,
  });
  collectWonderTile(x, y, ctx.wonders);
}

function addSeed(x, y, ctx) {
  const owner = safe(() => GameplayMap.getOwner(x, y));
  if (typeof owner !== "number" || owner < 0) return;
  const civ = civForOwner(owner, ctx.ownerCache);
  if (civ) ctx.seeds.push({ x, y, civ });
}

function collectWaterTile(x, y, key, ctx) {
  if (safe(() => GameplayMap.isLake(x, y)) === true) {
    ctx.lakeTiles.add(key);
  } else if (safe(() => GameplayMap.isNavigableRiver(x, y)) === true) {
    // Navigable rivers are water but NOT sea — keep them out of seaTiles so
    // inland river fingers aren't misread as enclosed basins (sounds/inlets).
    // They drive estuary detection instead, at the coast where they meet sea.
    ctx.navRiverTiles.add(key);
  } else {
    ctx.seaTiles.add(key);
  }
}

// Minor rivers run along the edges of LAND tiles (navigable rivers are their own
// water tiles, handled in collectWaterTile). getRiverType flags a land plot that
// borders one; the engine names it via getRiverName (read later, in the river
// collector). RiverTypes.RIVER_MINOR is 1 when the enum isn't in scope.
function isMinorRiver(x, y) {
  const t = safe(() => GameplayMap.getRiverType(x, y));
  if (typeof t !== "number") return false;
  const minor =
    typeof RiverTypes !== "undefined" && RiverTypes.RIVER_MINOR != null
      ? RiverTypes.RIVER_MINOR
      : 1;
  return t === minor;
}

// Reefs and atolls are engine features (FEATURE_REEF/FEATURE_COLD_REEF/
// FEATURE_ATOLL). Named marine wonders (e.g. FEATURE_BARRIER_REEF) are skipped
// here so they stay with the wonder labeler.
function collectWaterFeatureTile(ctx) {
  const { x, y, featureTiles, featureTypeName } = ctx;
  if (safe(() => GameplayMap.isNaturalWonder(x, y)) === true) return;
  const featureType = safe(() => GameplayMap.getFeatureType(x, y));
  if (typeof featureType !== "number" || featureType === -1) return;
  const name = resolveFeatureTypeName(featureType, featureTypeName);
  const typeKey = name && FEATURE_TO_TYPEKEY[name];
  if (!typeKey) return;
  if (!featureTiles.has(typeKey)) featureTiles.set(typeKey, new Set());
  featureTiles.get(typeKey).add(x + "," + y);
}

function resolveFeatureTypeName(featureType, cache) {
  let name = cache.get(featureType);
  if (name !== undefined) return name;
  const def = safe(() => GameInfo.Features.lookup(featureType));
  name = (def && def.FeatureType) || null;
  cache.set(featureType, name);
  return name;
}

function collectLandTile(ctx) {
  const { x, y, land, mountainTiles, biomeTiles, biomeTypeName } = ctx;
  const areaId = safe(() => GameplayMap.getAreaId(x, y));
  if (typeof areaId === "number" && areaId > -1) {
    let region = land.get(areaId);
    if (!region) {
      region = {
        id: areaId,
        plots: [],
        continent: safe(() => GameplayMap.getContinentType(x, y)),
      };
      land.set(areaId, region);
    }
    region.plots.push({ x, y });
  }

  if (safe(() => GameplayMap.isMountain(x, y)) === true) {
    mountainTiles.add(x + "," + y);
  }

  const biomeType = safe(() => GameplayMap.getBiomeType(x, y));
  if (typeof biomeType !== "number") return;
  const biome = resolveBiomeName(biomeType, biomeTypeName);
  if (!biome) return;
  if (!biomeTiles.has(biome)) biomeTiles.set(biome, new Set());
  biomeTiles.get(biome).add(x + "," + y);
}

function resolveBiomeName(biomeType, biomeTypeName) {
  let name = biomeTypeName.get(biomeType);
  if (name !== undefined) return name;
  const def = safe(() => GameInfo.Biomes.lookup(biomeType));
  name = (def && def.BiomeType) || null;
  biomeTypeName.set(biomeType, name);
  return name;
}

function collectWonderTile(x, y, wonders) {
  if (safe(() => GameplayMap.isNaturalWonder(x, y)) !== true) return;
  const featureType = safe(() => GameplayMap.getFeatureType(x, y));
  if (typeof featureType !== "number" || featureType === -1) return;

  let wonder = wonders.get(featureType);
  if (!wonder) {
    wonder = {
      name: resolveWonderName(featureType),
      plots: [],
    };
    wonders.set(featureType, wonder);
  }
  wonder.plots.push({ x, y });
}

function resolveWonderName(featureType) {
  const def = safe(() => GameInfo.Features.lookup(featureType));
  if (def && def.Name) {
    return safe(() => Locale.compose(def.Name)) || "Wonder";
  }
  return "Wonder";
}

export function buildReachable(areas, w, h) {
  const reached = new Set();
  const queue = [];
  for (const area of areas) {
    if (area.plots.length < CONTINENT_MIN_TILES) continue;
    seedReachableFromArea(area, reached, queue);
  }
  while (queue.length) {
    const p = queue.pop();
    for (const n of neighbors(p, w, h)) {
      const key = n.x + "," + n.y;
      if (reached.has(key)) continue;
      if (!isCrossable(n.x, n.y)) continue;
      reached.add(key);
      queue.push(n);
    }
  }
  return reached;
}

function seedReachableFromArea(area, reached, queue) {
  for (const p of area.plots) {
    const key = p.x + "," + p.y;
    if (reached.has(key)) continue;
    reached.add(key);
    queue.push(p);
  }
}

function isCrossable(x, y) {
  if (safe(() => GameplayMap.isWater(x, y)) !== true) return true;
  if (safe(() => GameplayMap.isLake(x, y)) === true) return true;
  return safe(() => GameplayMap.isNavigableRiver(x, y)) === true;
}

// Stable, geometry-derived identity for a group of plots: the minimum linear
// tile index across its tiles. Invariant across save/reload, unlike engine
// area IDs (GameplayMap.getAreaId), which are renumbered every time the map
// is rebuilt. Keying labels on this keeps persisted names consistent.
export function anchorIndex(plots, w) {
  return Math.min.apply(
    null,
    plots.map((p) => p.x + p.y * w),
  );
}

export function collectFeatures(ctx) {
  const {
    areas,
    reached,
    mountainTiles,
    biomeTiles,
    lakeTiles,
    featureTiles,
    w,
    h,
  } = ctx;
  const feats = [];
  // Any land area not reachable from a continent is an islet. The >= 3-tile
  // subset gets its own "Isle of" label; the full list (incl. 1-2 tile rocks)
  // feeds archipelago/keys grouping — keys are chains of exactly those tiny
  // islets, so they must not be size-filtered away first.
  const islets = areas.filter(
    (a) => !a.plots.some((p) => reached.has(p.x + "," + p.y)),
  );
  const islands = islets.filter((a) => a.plots.length >= MIN_LABEL_TILES);

  for (const area of islands) {
    feats.push({
      key: "isle:" + anchorIndex(area.plots, w),
      typeKey: "islands",
      plots: area.plots,
    });
  }

  const sources = { mountainTiles, lakeTiles, featureTiles, biomeTiles, empty: new Set() };
  for (const cat of REGION_CATS) {
    const tiles = tilesForCat(cat, sources);
    // Regions are often broken by a single off-type tile — a mountain saddle,
    // hill, or volcano for ranges; a river, oasis, or lone hill for biomes.
    // Strict flood-fill splits them into sub-threshold fragments that all get
    // dropped; bridging one-tile gaps keeps the feature whole so it clears
    // cat.min and gets a label.
    const regions = regionsOf(tiles, w, h, true);
    for (const plots of regions) {
      if (plots.length < cat.min) continue;
      feats.push({
        key: cat.typeKey + ":" + anchorIndex(plots, w),
        typeKey: cat.typeKey,
        plots,
      });
    }
  }

  return { feats, islands, islets };
}

function tilesForCat(cat, sources) {
  if (cat.mountain) return sources.mountainTiles;
  if (cat.lake) return sources.lakeTiles;
  if (cat.feature) {
    return (sources.featureTiles && sources.featureTiles.get(cat.typeKey)) || sources.empty;
  }
  return sources.biomeTiles.get(cat.biome) || sources.empty;
}

export function regionsOf(tileSet, w, h, bridge) {
  const remaining = new Set(tileSet);
  const regions = [];
  for (const start of tileSet) {
    if (!remaining.has(start)) continue;
    regions.push(floodRegion(start, remaining, w, h, bridge));
  }
  return regions;
}

function floodRegion(start, remaining, w, h, bridge) {
  const stack = [start];
  const plots = [];
  remaining.delete(start);
  while (stack.length) {
    const key = stack.pop();
    const comma = key.indexOf(",");
    const plot = {
      x: +key.slice(0, comma),
      y: +key.slice(comma + 1),
    };
    plots.push(plot);
    for (const n of neighbors(plot, w, h)) {
      const nk = n.x + "," + n.y;
      if (remaining.has(nk)) {
        remaining.delete(nk);
        stack.push(nk);
      } else if (bridge) {
        // n is a gap tile (not in the set); reach across it to pull in any
        // same-type tile one step further, coalescing ranges split by a
        // single saddle/hill/volcano tile.
        bridgeGap(n, remaining, stack, w, h);
      }
    }
  }
  return plots;
}

function bridgeGap(gap, remaining, stack, w, h) {
  for (const n of neighbors(gap, w, h)) {
    const nk = n.x + "," + n.y;
    if (!remaining.has(nk)) continue;
    remaining.delete(nk);
    stack.push(nk);
  }
}
