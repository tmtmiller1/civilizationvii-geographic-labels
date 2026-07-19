/**
 * Central registry of label categories the player can show/hide.
 *
 * `id` MUST equal the label key prefix produced by the pipeline (the part before
 * the first ":" in a label key — e.g. "cont", "isle", "mountains", "rivernav").
 * `labelType()` in geo-labels-compute.js derives exactly that prefix, so the same
 * id drives both the Options checkbox (geo-labels-options.js) and the visibility
 * filter (geo-labels-compute.js). `loc` is the ModText token for the checkbox
 * label. Order here is the order the checkboxes appear in the Options group.
 */
export const CATEGORIES = [
  { id: "cont", loc: "LOC_GEO_LABELS_VIS_CONT" },
  { id: "mountains", loc: "LOC_GEO_LABELS_VIS_MOUNTAINS" },
  { id: "deserts", loc: "LOC_GEO_LABELS_VIS_DESERTS" },
  { id: "taiga", loc: "LOC_GEO_LABELS_VIS_TAIGA" },
  { id: "jungle", loc: "LOC_GEO_LABELS_VIS_JUNGLE" },
  { id: "isle", loc: "LOC_GEO_LABELS_VIS_ISLE" },
  { id: "archipelagos", loc: "LOC_GEO_LABELS_VIS_ARCHIPELAGOS" },
  { id: "keys", loc: "LOC_GEO_LABELS_VIS_KEYS" },
  { id: "wonder", loc: "LOC_GEO_LABELS_VIS_WONDER" },
  { id: "lakes", loc: "LOC_GEO_LABELS_VIS_LAKES" },
  { id: "seas", loc: "LOC_GEO_LABELS_VIS_SEAS" },
  { id: "gulfs", loc: "LOC_GEO_LABELS_VIS_GULFS" },
  { id: "bays", loc: "LOC_GEO_LABELS_VIS_BAYS" },
  { id: "sounds", loc: "LOC_GEO_LABELS_VIS_SOUNDS" },
  { id: "inlets", loc: "LOC_GEO_LABELS_VIS_INLETS" },
  { id: "fjords", loc: "LOC_GEO_LABELS_VIS_FJORDS" },
  { id: "reefs", loc: "LOC_GEO_LABELS_VIS_REEFS" },
  { id: "atolls", loc: "LOC_GEO_LABELS_VIS_ATOLLS" },
  { id: "estuaries", loc: "LOC_GEO_LABELS_VIS_ESTUARIES" },
  { id: "rivernav", loc: "LOC_GEO_LABELS_VIS_RIVERNAV" },
  { id: "riverminor", loc: "LOC_GEO_LABELS_VIS_RIVERMINOR" },
];
