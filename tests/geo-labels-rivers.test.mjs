import test from "node:test";
import assert from "node:assert/strict";

// The river collector consumes scanned.namedRiverTiles (a Map "x,y" -> raw river
// LOC key, built by querying getRiverName on every tile) and reads two engine
// calls: Locale.compose (name) and isNavigableRiver (nav-vs-minor tag). Stub all
// three over a small square grid before importing the module under test.
const W = 12;
const H = 6;
const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1],
];

const LOCALE_MAP = { LOC_RIVER_WADI_HANIFA_NAME: "Wadi Hanifa" };
let IS_NAV = () => false; // which tiles read as navigable rivers

globalThis.Locale = { compose: (s) => LOCALE_MAP[s] ?? s };
globalThis.GameplayMap = {
  getRiverName: (x, y) => RIVER_NAME(x, y),
  isNavigableRiver: (x, y) => IS_NAV(x, y),
  getAdjacentPlotLocation: (loc, d) => ({ x: loc.x + DIRS[d][0], y: loc.y + DIRS[d][1] }),
};
let RIVER_NAME = () => null; // only used by riverNameAt()

const { collectRivers, composeRiverName, riverNameAt } =
  await import("../ui/geo-labels-rivers.js");

// Build a namedRiverTiles Map from [x,y] pairs, all sharing one raw name.
function named(raw, ...pairs) {
  const m = new Map();
  for (const [x, y] of pairs) m.set(x + "," + y, raw);
  return m;
}

test("composeRiverName composes the engine LOC key and strips a trailing 'River'", () => {
  assert.equal(composeRiverName("LOC_RIVER_WADI_HANIFA_NAME"), "Wadi Hanifa");
  assert.equal(composeRiverName("Nile River"), "Nile"); // unknown key passes through
  assert.equal(composeRiverName(""), null);
  assert.equal(composeRiverName(null), null);
});

test("riverNameAt reads getRiverName and composes it", () => {
  RIVER_NAME = () => "LOC_RIVER_WADI_HANIFA_NAME";
  assert.equal(riverNameAt(0, 0), "Wadi Hanifa");
  RIVER_NAME = () => null;
  assert.equal(riverNameAt(0, 0), null);
});

test("a named river's tiles group into one label per contiguous system", () => {
  IS_NAV = () => false;
  const feats = collectRivers({
    namedRiverTiles: named("Tigris", [1, 1], [2, 1], [3, 1], [4, 1]),
    w: W, h: H,
  });
  assert.equal(feats.length, 1);
  assert.equal(feats[0].fixedName, "Tigris");
  assert.equal(feats[0].typeKey, "rivers");
  assert.ok(feats[0].key.startsWith("riverminor:"));
  assert.equal(feats[0].plots.length, 4);
});

test("same name, two disconnected runs become two labels", () => {
  const map = new Map([
    ...named("Volga", [0, 0], [1, 0]),
    ...named("Volga", [8, 4], [9, 4]),
  ]);
  const feats = collectRivers({ namedRiverTiles: map, w: W, h: H });
  assert.equal(feats.length, 2);
  for (const f of feats) assert.equal(f.fixedName, "Volga");
});

test("a system with any navigable tile is tagged rivernav, else riverminor", () => {
  IS_NAV = (x, y) => x === 2 && y === 1; // one tile of the run is navigable
  const nav = collectRivers({
    namedRiverTiles: named("Danube", [1, 1], [2, 1], [3, 1]),
    w: W, h: H,
  });
  assert.ok(nav[0].key.startsWith("rivernav:"));
  IS_NAV = () => false;
  const minor = collectRivers({
    namedRiverTiles: named("Danube", [1, 1], [2, 1], [3, 1]),
    w: W, h: H,
  });
  assert.ok(minor[0].key.startsWith("riverminor:"));
});

test("a single-tile river is below the minimum and earns no label", () => {
  const feats = collectRivers({ namedRiverTiles: named("Creek", [1, 1]), w: W, h: H });
  assert.equal(feats.length, 0);
});

test("an empty scan yields no river labels", () => {
  assert.deepEqual(collectRivers({ namedRiverTiles: new Map(), w: W, h: H }), []);
});
