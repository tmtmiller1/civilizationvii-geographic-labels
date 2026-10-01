/**
 * Geographic Labels — places named by other mods, and the "names near here" query.
 *
 * Another mod can put its own named places on the map (the National Park mod adds its parks) by pushing a
 * provider into `window.__geoLabelsProviders`, an array either mod may create first:
 *
 *   { id, type, typeLabel, list(), rename(key, name) }
 *   list()  → [{ key, text, plots: [{ x, y }], cust }]; every key starts with `type + ":"`
 *   rename(key, name) → true if saved; a blank name restores the provider's own name
 *
 * `type` is the label key prefix and the Options category id. The labels are drawn like any other, listed in
 * Rename Places under `typeLabel`, and a rename is handed back to the provider, which owns the name: nothing a
 * provider supplies is stored here.
 *
 * `namesNear` answers which named places lie within a few tiles of a set of plots, for a mod that names things
 * after the places around them.
 */

export const PROVIDERS_GLOBAL = "__geoLabelsProviders";

function root() {
  return typeof window !== "undefined" ? window : globalThis;
}

function safe(fn, fb) {
  try { return fn(); } catch (_e) { return fb; }
}

/** The registered providers that look usable. */
export function getProviders(scope = root()) {
  const list = scope && scope[PROVIDERS_GLOBAL];
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p && typeof p.type === "string" && p.type && typeof p.list === "function");
}

export function providerForKey(key, providers) {
  const i = String(key).indexOf(":");
  if (i <= 0) return null;
  const type = key.slice(0, i);
  return providers.find((p) => p.type === type && typeof p.rename === "function") || null;
}

function isPlaceOf(it, type) {
  return !!it && !!it.text && Array.isArray(it.plots) && it.plots.length > 0
    && typeof it.key === "string" && it.key.startsWith(type + ":");
}

/**
 * Map labels for every provider's places. A provider that throws, or a place with no plots, no text or a key
 * outside its type, is skipped rather than allowed to break the layer.
 */
export function providerLabels(providers, { centroid, fontOf }) {
  const out = [];
  for (const p of providers) {
    const items = safe(() => p.list(), null);
    if (!Array.isArray(items)) continue;
    const typeLabel = safe(() => p.typeLabel, null) || p.type;
    for (const it of items.filter((x) => isPlaceOf(x, p.type))) {
      out.push({ key: it.key, plot: centroid(it.plots), plots: it.plots, text: String(it.text),
        fontSize: fontOf(it.key, it.plots.length), cust: !!it.cust, typeLabel, provided: true });
    }
  }
  return out;
}

/** How far a provider's place may lie from a wonder it is named after: a park is founded beside its wonder, and a
 *  multi-tile wonder's label sits at its centre. */
export const STAND_IN_REACH = 2;

/**
 * A provider's place named after a natural wonder beside it ("Redwood Forest Wilderness Area" beside the Redwood
 * Forest) stands in for that wonder on the map: the wonder's label is left out, and the place takes the wonder's
 * `rank`, so overlap suppression cannot hide the place behind the name it already carries. The wonder stays in
 * Rename Places, which lists every label. Returns the labels to draw; the stand-ins are marked with `rank`.
 */
export function standInForWonders(labels, dist, rank, reach = STAND_IN_REACH) {
  const wonders = labels.filter(isWonderLabel);
  const dropped = new Set();
  for (const place of labels.filter(isProvidedPlace)) {
    for (const w of wonders.filter((x) => !dropped.has(x) && namedFor(place, x, dist, reach))) {
      dropped.add(w);
      place.rank = rank;
    }
  }
  return dropped.size ? labels.filter((l) => !dropped.has(l)) : labels;
}

function isWonderLabel(l) {
  return !!l && typeof l.key === "string" && l.key.startsWith("wonder:") && !!l.text && !!l.plot;
}

function isProvidedPlace(l) {
  return !!l && !!l.provided && Array.isArray(l.plots);
}

/** Whether `place` carries the wonder's name and lies within `reach` of it. */
function namedFor(place, wonder, dist, reach) {
  if (!String(place.text).toLowerCase().includes(String(wonder.text).toLowerCase())) return false;
  return closest(place.plots, [wonder.plot], reach, dist) <= reach;
}

/** Shortest distance from any of `plots` to any of `targets`, measuring only pairs within `radius` rows. */
function closest(plots, targets, radius, dist) {
  let best = Infinity;
  for (const a of plots) {
    for (const b of targets) {
      if (Math.abs(a.y - b.y) > radius) continue;
      const d = safe(() => dist(a, b), Infinity);
      if (d < best) best = d;
      if (best === 0) return 0;
    }
  }
  return best;
}

function hitOf(place, d) {
  const i = place.key.indexOf(":");
  return { key: place.key, type: i > 0 ? place.key.slice(0, i) : place.key, text: place.text,
    toponym: place.toponym || null, cust: !!place.cust, dist: d };
}

/**
 * Named places within `radius` tiles of any of `targets`, nearest first: [{ key, type, text, toponym, cust,
 * dist }]. `places` are { key, text, toponym, cust, plots }; `dist(a, b)` is the map's plot distance. Rows more
 * than `radius` apart can never be within it, which spares most distance calls on a large continent.
 */
export function namesNear(places, targets, radius, dist) {
  if (!Array.isArray(places) || !Array.isArray(targets) || !targets.length) return [];
  const out = [];
  for (const place of places) {
    if (!place || !place.text || !Array.isArray(place.plots)) continue;
    const d = closest(place.plots, targets, radius, dist);
    if (d <= radius) out.push(hitOf(place, d));
  }
  return out.sort((a, b) => a.dist - b.dist || a.key.localeCompare(b.key));
}
