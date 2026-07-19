import test from "node:test";
import assert from "node:assert/strict";

// The river collector reads the engine map (GameplayMap.getRiverName for the
// name, getAdjacentPlotLocation for flood-fill connectivity). Stub both over a
// small square grid before importing the module under test.
const W = 12;
const H = 6;
const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1],
];

// name-by-tile map the stub reads; each test sets it.
let RIVER_NAME = () => null;

globalThis.GameplayMap = {
  getRiverName: (x, y) => RIVER_NAME(x, y),
  getAdjacentPlotLocation: (loc, d) => ({ x: loc.x + DIRS[d][0], y: loc.y + DIRS[d][1] }),
};

const { collectRivers, riverNameAt } = await import("../ui/geo-labels-rivers.js");

function keys(...pairs) {
  return new Set(pairs.map(([x, y]) => x + "," + y));
}

test("riverNameAt strips a trailing 'River' and rejects blank/short names", () => {
  RIVER_NAME = () => "Nile River";
  assert.equal(riverNameAt(0, 0), "Nile");
  RIVER_NAME = () => "Rhine";
  assert.equal(riverNameAt(0, 0), "Rhine");
  RIVER_NAME = () => "";
  assert.equal(riverNameAt(0, 0), null);
  RIVER_NAME = () => null;
  assert.equal(riverNameAt(0, 0), null);
});

test("navigable rivers group by name into one label per contiguous system", () => {
  // A 4-tile run all named "Nile" -> one feature, named, typeKey rivers.
  RIVER_NAME = () => "Nile River";
  const feats = collectRivers({
    navRiverTiles: keys([1, 1], [2, 1], [3, 1], [4, 1]),
    minorRiverTiles: new Set(),
    w: W, h: H,
  });
  assert.equal(feats.length, 1);
  assert.equal(feats[0].fixedName, "Nile");
  assert.equal(feats[0].typeKey, "rivers");
  assert.ok(feats[0].key.startsWith("rivernav:"));
  assert.equal(feats[0].plots.length, 4);
});

test("same name but two disconnected runs become two labels", () => {
  RIVER_NAME = () => "Volga";
  const feats = collectRivers({
    navRiverTiles: keys([0, 0], [1, 0], [8, 4], [9, 4]),
    minorRiverTiles: new Set(),
    w: W, h: H,
  });
  assert.equal(feats.length, 2);
  for (const f of feats) assert.equal(f.fixedName, "Volga");
});

test("unnamed river tiles produce no label", () => {
  RIVER_NAME = () => null;
  const feats = collectRivers({
    navRiverTiles: keys([1, 1], [2, 1], [3, 1]),
    minorRiverTiles: new Set(),
    w: W, h: H,
  });
  assert.equal(feats.length, 0);
});

test("minor rivers need more tiles than navigable rivers to earn a label", () => {
  RIVER_NAME = () => "Creek";
  // 3 tiles: enough for a navigable river (min 2), too few for a minor one (min 5).
  const asNav = collectRivers({
    navRiverTiles: keys([1, 1], [2, 1], [3, 1]),
    minorRiverTiles: new Set(),
    w: W, h: H,
  });
  assert.equal(asNav.length, 1);
  const asMinor = collectRivers({
    navRiverTiles: new Set(),
    minorRiverTiles: keys([1, 1], [2, 1], [3, 1]),
    w: W, h: H,
  });
  assert.equal(asMinor.length, 0);
});

test("a long-enough minor river is labeled with the riverminor prefix", () => {
  RIVER_NAME = () => "Danube";
  const feats = collectRivers({
    navRiverTiles: new Set(),
    minorRiverTiles: keys([1, 1], [2, 1], [3, 1], [4, 1], [5, 1]),
    w: W, h: H,
  });
  assert.equal(feats.length, 1);
  assert.ok(feats[0].key.startsWith("riverminor:"));
  assert.equal(feats[0].fixedName, "Danube");
});
