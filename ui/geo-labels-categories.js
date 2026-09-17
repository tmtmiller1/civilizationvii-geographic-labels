/**
 * Central registry of label categories the player can show/hide.
 *
 * `id` MUST equal the label key prefix produced by the pipeline (the part before
 * the first ":" in a label key — e.g. "cont", "isle", "mountains", "rivernav").
 * `labelType()` in geo-labels-compute.js derives exactly that prefix, so the same
 * id drives both the Options checkbox (geo-labels-options.js) and the visibility
 * filter (geo-labels-compute.js). `loc` is the ModText token for the checkbox
 * label. `group` places the checkbox under one of the collapsible CATEGORY_GROUPS
 * sections; within a section the checkboxes are sorted by their displayed label.
 */
export const CATEGORIES = [
  { id: "cont", group: "land", loc: "LOC_GEO_LABELS_VIS_CONT" },
  { id: "mountains", group: "land", loc: "LOC_GEO_LABELS_VIS_MOUNTAINS" },
  { id: "deserts", group: "land", loc: "LOC_GEO_LABELS_VIS_DESERTS" },
  { id: "taiga", group: "land", loc: "LOC_GEO_LABELS_VIS_TAIGA" },
  { id: "jungle", group: "land", loc: "LOC_GEO_LABELS_VIS_JUNGLE" },
  { id: "isle", group: "islands", loc: "LOC_GEO_LABELS_VIS_ISLE" },
  { id: "archipelagos", group: "islands", loc: "LOC_GEO_LABELS_VIS_ARCHIPELAGOS" },
  { id: "keys", group: "islands", loc: "LOC_GEO_LABELS_VIS_KEYS" },
  { id: "wonder", group: "land", loc: "LOC_GEO_LABELS_VIS_WONDER" },
  { id: "lakes", group: "freshwater", loc: "LOC_GEO_LABELS_VIS_LAKES" },
  { id: "seas", group: "sea", loc: "LOC_GEO_LABELS_VIS_SEAS" },
  { id: "gulfs", group: "sea", loc: "LOC_GEO_LABELS_VIS_GULFS" },
  { id: "bays", group: "sea", loc: "LOC_GEO_LABELS_VIS_BAYS" },
  { id: "sounds", group: "sea", loc: "LOC_GEO_LABELS_VIS_SOUNDS" },
  { id: "inlets", group: "sea", loc: "LOC_GEO_LABELS_VIS_INLETS" },
  { id: "fjords", group: "sea", loc: "LOC_GEO_LABELS_VIS_FJORDS" },
  { id: "reefs", group: "sea", loc: "LOC_GEO_LABELS_VIS_REEFS" },
  { id: "atolls", group: "islands", loc: "LOC_GEO_LABELS_VIS_ATOLLS" },
  { id: "estuaries", group: "sea", loc: "LOC_GEO_LABELS_VIS_ESTUARIES" },
  { id: "rivernav", group: "freshwater", loc: "LOC_GEO_LABELS_VIS_RIVERNAV" },
  { id: "riverminor", group: "freshwater", loc: "LOC_GEO_LABELS_VIS_RIVERMINOR" },
];

/** Collapsible Options sections, in display order. `loc` is the section row's label. */
export const CATEGORY_GROUPS = [
  { id: "land", loc: "LOC_GEO_LABELS_GROUP_LAND" },
  { id: "islands", loc: "LOC_GEO_LABELS_GROUP_ISLANDS" },
  { id: "sea", loc: "LOC_GEO_LABELS_GROUP_SEA" },
  { id: "freshwater", loc: "LOC_GEO_LABELS_GROUP_FRESHWATER" },
];

/**
 * The sections with their member categories, each member list sorted by displayed
 * label. `labelOf` maps a LOC token to its display text (Locale.compose in-game);
 * it defaults to the token itself so this stays testable outside the engine.
 */
export function groupedCategories(labelOf = (loc) => loc) {
  return CATEGORY_GROUPS.map((g) => ({
    ...g,
    members: CATEGORIES
      .filter((c) => c.group === g.id)
      .map((c) => ({ cat: c, label: String(labelOf(c.loc)) }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((x) => x.cat),
  }));
}
