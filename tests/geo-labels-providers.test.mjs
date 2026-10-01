import test from "node:test";
import assert from "node:assert/strict";

import {
  PROVIDERS_GLOBAL,
  getProviders,
  namesNear,
  providerForKey,
  providerLabels,
  standInForWonders,
} from "../ui/geo-labels-providers.js";

// Offset-free test distance: Chebyshev on x/y is enough to order and bound places.
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const fmt = { centroid: (plots) => plots[0], fontOf: (_key, n) => 6 + n };

function park(list, extra = {}) {
  return { id: "parks", type: "park", typeLabel: "National park", list: () => list, rename: () => true, ...extra };
}

test("reads only usable providers from the shared array", () => {
  const scope = { [PROVIDERS_GLOBAL]: [park([]), null, { type: "" , list: () => [] }, { type: "x" }] };
  assert.equal(getProviders(scope).length, 1);
  assert.deepEqual(getProviders({}), []);
});

test("turns provider places into labels with their type label", () => {
  const labels = providerLabels([park([
    { key: "park:1", text: "Uluru National Park", plots: [{ x: 3, y: 4 }, { x: 4, y: 4 }], cust: true },
  ])], fmt);
  assert.equal(labels.length, 1);
  assert.deepEqual(labels[0].plot, { x: 3, y: 4 });
  assert.equal(labels[0].fontSize, 8);
  assert.equal(labels[0].typeLabel, "National park");
  assert.equal(labels[0].cust, true);
});

test("skips bad places and a provider that throws, without breaking the rest", () => {
  const good = park([
    { key: "park:1", text: "A", plots: [{ x: 0, y: 0 }] },
    { key: "park:2", text: "", plots: [{ x: 0, y: 0 }] },
    { key: "park:3", text: "C", plots: [] },
    { key: "other:4", text: "D", plots: [{ x: 0, y: 0 }] },
  ]);
  const broken = { type: "zoo", list: () => { throw new Error("boom"); } };
  const labels = providerLabels([broken, good], fmt);
  assert.deepEqual(labels.map((l) => l.key), ["park:1"]);
});

test("finds the provider that owns a key", () => {
  const p = park([]);
  assert.equal(providerForKey("park:7", [p]), p);
  assert.equal(providerForKey("wonder:X", [p]), null);
  assert.equal(providerForKey("nokey", [p]), null);
});

test("names near a park: within the radius only, nearest first", () => {
  const places = [
    { key: "wonder:ULURU", text: "Uluru", plots: [{ x: 5, y: 5 }] },
    { key: "mountains:9", text: "Altai Mountains", toponym: "Altai", plots: [{ x: 8, y: 5 }, { x: 9, y: 6 }] },
    { key: "cont:1", text: "Nena", plots: [{ x: 30, y: 30 }] },
  ];
  const near = namesNear(places, [{ x: 5, y: 6 }, { x: 6, y: 6 }], 3, dist);
  assert.deepEqual(near.map((n) => [n.type, n.dist]), [["wonder", 1], ["mountains", 2]]);
  assert.equal(near[1].toponym, "Altai");
});

test("a place far off in rows is never measured", () => {
  let calls = 0;
  const counting = (a, b) => { calls++; return dist(a, b); };
  const places = [{ key: "cont:1", text: "Nena", plots: Array.from({ length: 500 }, (_, i) => ({ x: i % 50, y: 40 + (i % 5) })) }];
  assert.deepEqual(namesNear(places, [{ x: 3, y: 2 }], 3, counting), []);
  assert.equal(calls, 0);
});

test("a park named after the wonder beside it stands in for the wonder's label", () => {
  const wonder = { key: "wonder:30", text: "Redwood Forest", plot: { x: 53, y: 10 } };
  const place = { key: "park:1", text: "Redwood Forest Wilderness Area", provided: true,
    plots: [{ x: 54, y: 9 }, { x: 54, y: 10 }] };
  const shown = standInForWonders([wonder, place], dist, 6);
  assert.deepEqual(shown.map((l) => l.key), ["park:1"]);
  assert.equal(place.rank, 6);
});

test("a wonder keeps its label beside a park named for something else, or far from the park", () => {
  const wonder = { key: "wonder:30", text: "Redwood Forest", plot: { x: 53, y: 10 } };
  const other = { key: "park:1", text: "Klamath National Park", provided: true, plots: [{ x: 54, y: 10 }] };
  const far = { key: "park:2", text: "Redwood Forest National Park", provided: true, plots: [{ x: 60, y: 10 }] };
  const shown = standInForWonders([wonder, other, far], dist, 6);
  assert.equal(shown.length, 3);
  assert.equal(other.rank, undefined);
  assert.equal(far.rank, undefined);
});

test("only a provider's place stands in: a map region sharing the wonder's words does not", () => {
  const wonder = { key: "wonder:39", text: "Uluru", plot: { x: 62, y: 21 } };
  const region = { key: "deserts:5", text: "Uluru Desert", plots: [{ x: 62, y: 22 }] };
  assert.equal(standInForWonders([wonder, region], dist, 6).length, 2);
});
