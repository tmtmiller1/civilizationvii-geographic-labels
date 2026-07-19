import test from "node:test";
import assert from "node:assert/strict";

import { classifyBasin, isEnclosed } from "../ui/geo-labels-water.js";

const W = 11;
const H = 11;
function grid(isLand) {
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (isLand(x, y)) g[x + y * W] = 1;
    }
  }
  return g;
}

test("isEnclosed rejects a straight open coast but accepts bays and channels", () => {
  // Straight coast: land fills the bottom half only -> land on one side.
  const coast = grid((_x, y) => y >= 6);
  assert.equal(isEnclosed(5, 5, coast, W, H), false);

  // Open ocean: no land anywhere.
  const ocean = grid(() => false);
  assert.equal(isEnclosed(5, 5, ocean, W, H), false);

  // Bay: land on left, right, and bottom (U-shape), open top -> land on 3 sides.
  const bay = grid((x, y) => x <= 2 || x >= 8 || y >= 8);
  assert.equal(isEnclosed(5, 5, bay, W, H), true);

  // Channel/sound: land on the left and right walls only -> two opposite sides.
  const channel = grid((x) => x <= 2 || x >= 8);
  assert.equal(isEnclosed(5, 5, channel, W, H), true);
});

const base = { area: 10, elongation: 1.5, latAbs: 10, mountainAdjacent: false };

test("classifyBasin buckets by size for compact basins", () => {
  assert.equal(classifyBasin({ ...base, area: 50 }), "seas");
  assert.equal(classifyBasin({ ...base, area: 20 }), "gulfs");
  assert.equal(classifyBasin({ ...base, area: 8 }), "bays");
  assert.equal(classifyBasin({ ...base, area: 5 }), "inlets");
});

test("classifyBasin routes narrow basins to sounds", () => {
  assert.equal(classifyBasin({ ...base, area: 12, elongation: 4 }), "sounds");
});

test("fjords require BOTH the polar latitude band and adjacent mountains", () => {
  const narrow = { area: 12, elongation: 4 };
  // Polar + mountains -> fjord.
  assert.equal(
    classifyBasin({ ...narrow, latAbs: 62, mountainAdjacent: true }),
    "fjords",
  );
  // Polar but no mountains -> sound.
  assert.equal(
    classifyBasin({ ...narrow, latAbs: 62, mountainAdjacent: false }),
    "sounds",
  );
  // Mountains but tropical latitude -> sound (never a fjord near the equator).
  assert.equal(
    classifyBasin({ ...narrow, latAbs: 12, mountainAdjacent: true }),
    "sounds",
  );
});

test("a large narrow basin is still a sea (size wins first)", () => {
  assert.equal(
    classifyBasin({ area: 60, elongation: 5, latAbs: 62, mountainAdjacent: true }),
    "seas",
  );
});
