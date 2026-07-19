/**
 * Geographic Labels — Options-screen entry.
 *
 * Registers the "terrain-following labels" toggle under the shared "Mods" category of the game's Options
 * screen (works from the main menu and in-game). Persists to the same localStorage store the layer reads,
 * and applies live to the running layer via window.__geoLabels when in-game.
 */

import { CategoryType, OptionType, Options } from "/core/ui/options/model-options.js";
import { CategoryData } from "/core/ui/options/options-helpers.js";
import {
  getGlobalSettings,
  isCategoryVisible,
  safe,
  setCategoryVisible,
  setGlobalSettings,
} from "./geo-labels-utils.js";
import { CATEGORIES } from "./geo-labels-categories.js";

function getFlat() { return !!getGlobalSettings().flat; }
function setFlat(v) { setGlobalSettings({ flat: !!v }); }

// Nudge the running layer to recompute so a toggle applies live in-game (no-op
// from the main menu, where the layer isn't mounted).
function refreshLayer() {
  safe(() => {
    const g = window.__geoLabels;
    if (g && g.recompute) g.recompute();
  });
}

// Shared community "Mods" Options category (idempotent — first mod to load creates it, others reuse).
if (!CategoryType.Mods) CategoryType["Mods"] = "mods";
if (!CategoryData[CategoryType.Mods]) {
  CategoryData[CategoryType.Mods] = {
    // base-game LOC (engine-owned; NOT defined in this mod's ModText.xml)
    title: "LOC_UI_CONTENT_MGR_SUBTITLE",
    description: "LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION",
  };
}

safe(() => Options.addOption({
  category: CategoryType.Mods,
  // Underscore token: engine derives the header LOC key as
  // `LOC_OPTIONS_GROUP_${group.toUpperCase()}`, matched in text/*/ModText.xml
  // (LOC_OPTIONS_GROUP_GEOGRAPHIC_LABELS).
  group: "geographic_labels",
  type: OptionType.Checkbox,
  id: "geo-labels-terrain-following",
  label: "LOC_GEO_LABELS_OPT_FLAT",
  description: "LOC_GEO_LABELS_OPT_FLAT_DESC",
  initListener: (info) => { info.currentValue = getFlat(); },
  updateListener: (_info, value) => {
    setFlat(!!value);
    safe(() => {
      const g = window.__geoLabels;
      if (g && g.setFlat) g.setFlat(!!value);
    });
  },
}));

// One show/hide checkbox per label category, so players can fine-tune exactly
// which names appear. All default to visible (see isCategoryVisible).
for (const cat of CATEGORIES) {
  safe(() => Options.addOption({
    category: CategoryType.Mods,
    group: "geographic_labels",
    type: OptionType.Checkbox,
    id: "geo-labels-vis-" + cat.id,
    label: cat.loc,
    description: "LOC_GEO_LABELS_VIS_DESC",
    initListener: (info) => { info.currentValue = isCategoryVisible(cat.id); },
    updateListener: (_info, value) => {
      setCategoryVisible(cat.id, !!value);
      refreshLayer();
    },
  }));
}

export {};
