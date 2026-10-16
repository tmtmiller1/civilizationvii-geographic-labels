/**
 * Keeps the labels on while a unit lens is showing.
 *
 * Selecting a Scout, Settler, Founder, Merchant or Archaeologist switches the map to a unit lens, and
 * LensManager.setActiveLens turns off every enabled layer the new lens doesn't list in activeLayers or allowedLayers.
 * None of these lenses sets blendEnabledLayersOnTransition = false, so a layer in allowedLayers stays on through the
 * switch. The lenses are read from LensManager.lenses at runtime: one that's missing is skipped, and lenses we don't
 * name (diplomacy, cinematic, anything another mod adds) aren't touched.
 */

export const UNIT_LENSES = [
  "fxs-founder-lens",
  "fxs-settler-lens",
  "fxs-trade-lens",
  "fxs-continent-lens",
  "fxs-discovery-lens",
];

// Returns the lens types the layer was allowed on. Safe to call again: a Set add is idempotent.
export function allowLayerOnUnitLenses(lensManager, layerType) {
  const lenses = lensManager && lensManager.lenses;
  if (!lenses || typeof lenses.get !== "function") return [];
  const allowed = [];
  for (const lensType of UNIT_LENSES) {
    const lens = lenses.get(lensType);
    const set = lens && lens.allowedLayers;
    if (!set || typeof set.add !== "function") continue;
    set.add(layerType);
    allowed.push(lensType);
  }
  return allowed;
}
