/**
 * Geographic Labels — Options-screen entry.
 *
 * Registers the "terrain-following labels" toggle under the shared "Mods" category of the game's Options
 * screen (works from the main menu and in-game). Persists to the same localStorage store the layer reads,
 * and applies live to the running layer via window.__geoLabels when in-game.
 */

import { CategoryType, OptionType, Options } from "/core/ui/options/model-options.js";
import { CategoryData } from "/core/ui/options/options-helpers.js";

const STORE_KEY = "tmt-geo-labels"; // must match geo-labels-layer.js

function safe(fn) { try { return fn(); } catch (_e) { return undefined; } }
function getFlat() { return safe(() => { const raw = localStorage.getItem(STORE_KEY); const all = raw ? JSON.parse(raw) : {}; return !!(all._settings && all._settings.flat); }) || false; }
function setFlat(v) { safe(() => { const raw = localStorage.getItem(STORE_KEY); const all = raw ? JSON.parse(raw) : {}; if (!all._settings) all._settings = {}; all._settings.flat = !!v; localStorage.setItem(STORE_KEY, JSON.stringify(all)); }); }

// Shared community "Mods" Options category (idempotent — first mod to load creates it, others reuse).
if (!CategoryType.Mods) CategoryType["Mods"] = "mods";
if (!CategoryData[CategoryType.Mods]) {
  CategoryData[CategoryType.Mods] = { title: "LOC_UI_CONTENT_MGR_SUBTITLE", description: "LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION" };
}

safe(() => Options.addOption({
  category: CategoryType.Mods,
  group: "geographic-labels",
  type: OptionType.Checkbox,
  id: "geo-labels-terrain-following",
  label: "LOC_GEO_LABELS_OPT_FLAT",
  description: "LOC_GEO_LABELS_OPT_FLAT_DESC",
  initListener: (info) => { info.currentValue = getFlat(); },
  updateListener: (_info, value) => { setFlat(!!value); safe(() => { const g = window.__geoLabels; if (g && g.setFlat) g.setFlat(!!value); }); },
}));

export {};
