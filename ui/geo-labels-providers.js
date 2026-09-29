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
        fontSize: fontOf(it.key, it.plots.length), cust: !!it.cust, typeLabel });
    }
  }
  return out;
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
