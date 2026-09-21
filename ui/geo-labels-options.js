/**
 * Geographic Labels — Options-screen entry.
 *
 * Registers the "terrain-following labels" toggle under the shared "Mods" category of the game's Options
 * screen (works from the main menu and in-game). Persists to the same localStorage store the layer reads,
 * and applies live to the running layer via window.__geoLabels when in-game.
 */

import { CategoryType, OptionType, Options } from "/core/ui/options/model-options.js";
import { CategoryData } from "/core/ui/options/options-helpers.js";
// Defines <fxs-minus-plus>, the disclosure icon on the collapsible section rows.
import "/core/ui/components/fxs-minus-plus.js";
import {
  getGlobalSettings,
  isCategoryVisible,
  safe,
  setCategoryVisible,
  setGlobalSettings,
} from "./geo-labels-utils.js";
import { groupedCategories } from "./geo-labels-categories.js";

function getFlat() { return !!getGlobalSettings().flat; }
function setFlat(v) { setGlobalSettings({ flat: !!v }); }

// Nudge the running layer to recompute so a toggle applies live in-game (no-op
// from the main menu, where the layer isn't mounted). Batched: Cancel Changes
// restores every category in one pass and should redraw the map once.
let refreshPending = false;
function refreshLayer() {
  if (refreshPending) return;
  refreshPending = true;
  setTimeout(() => {
    refreshPending = false;
    safe(() => {
      const g = window.__geoLabels;
      if (g && g.recompute) g.recompute();
    });
  }, 0);
}

// Cancel Changes calls each option's restoreListener, then its initListener. These
// options write through immediately, so each one remembers the value it had when
// the Options screen opened (initListener) and puts it back on Cancel.

// Shared community "Mods" Options category (idempotent — first mod to load creates it, others reuse).
if (!CategoryType.Mods) CategoryType["Mods"] = "mods";
if (!CategoryData[CategoryType.Mods]) {
  CategoryData[CategoryType.Mods] = {
    // base-game LOC (engine-owned; NOT defined in this mod's ModText.xml)
    title: "LOC_UI_CONTENT_MGR_SUBTITLE",
    description: "LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION",
  };
}

function registerFlat() {
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
    initListener: (info) => {
      info.currentValue = getFlat();
      info.openValue = info.currentValue;
    },
    updateListener: (_info, value) => applyFlat(!!value),
    restoreListener: (info) => {
      if (getFlat() !== info.openValue) applyFlat(info.openValue);
    },
  }));
}

function applyFlat(value) {
  setFlat(value);
  safe(() => {
    const g = window.__geoLabels;
    if (g && g.setFlat) g.setFlat(value);
  });
}

// Show/hide checkboxes for the label categories, under their own "Geographic Labels
// to Show" heading and grouped into collapsible sections so twenty-odd rows don't
// flood the shared Mods tab. A section's title row ("Land Labels") is the toggle:
// clicking the title or its plus/minus icon opens or closes it. Members are sorted
// by displayed label. Sections start collapsed every time the Options screen opens.
// All categories default to visible (see isCategoryVisible).
//
// Underscore token: the heading's LOC key is LOC_OPTIONS_GROUP_GEOGRAPHIC_LABELS_SHOW.
const SHOW_GROUP = "geographic_labels_show";

function localized(loc) {
  try { return Locale.compose(loc); } catch (_) { return loc; }
}

// The screen gives Editor rows a plain text button and no render hook. Once the
// row exists (polled for a few frames after the screen initializes the option),
// swap that button for the game's plus/minus disclosure icon and make the title
// clickable. If this never finds the row, the fallback +/- button still works.
function decorateSection(optionId, toggle, isExpanded, framesLeft = 20) {
  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => safe(() => {
    const btn = document.querySelector(`fxs-button[optionID="${optionId}"]`);
    if (!btn || !btn.isConnected) {
      if (framesLeft > 0) decorateSection(optionId, toggle, isExpanded, framesLeft - 1);
      return;
    }
    const row = btn.closest(".highlight-row");
    if (!row || row.querySelector("fxs-minus-plus")) return;
    const icon = document.createElement("fxs-minus-plus");
    icon.setAttribute("type", isExpanded() ? "minus" : "plus");
    icon.setAttribute("data-audio-group-ref", "options");
    icon.addEventListener("action-activate", toggle);
    btn.classList.add("hidden");
    btn.insertAdjacentElement("afterend", icon);
    const title = row.firstElementChild;
    if (title) {
      title.classList.add("cursor-pointer", "pointer-events-auto");
      title.addEventListener("click", toggle);
    }
  }));
}

function registerCategories() {
  for (const group of groupedCategories(localized)) registerGroup(group);
}

// One collapsible section: its title row, then a checkbox per category in it.
function registerGroup(group) {
  const members = [];
  let expanded = false;

  const header = {
    category: CategoryType.Mods,
    group: SHOW_GROUP,
    type: OptionType.Editor,
    id: "geo-labels-section-" + group.id,
    label: group.loc,
    description: "LOC_GEO_LABELS_GROUP_DESC",
    caption: "LOC_GEO_LABELS_EXPAND",
  };

  function setExpanded(value) {
    expanded = value;
    safe(() => {
      const icon = document.querySelector(`fxs-button[optionID="${header.id}"]`)
        ?.closest(".highlight-row")?.querySelector("fxs-minus-plus");
      if (icon) icon.setAttribute("type", expanded ? "minus" : "plus");
      const btn = document.querySelector(`fxs-button[optionID="${header.id}"]`);
      if (btn) btn.setAttribute("caption", expanded ? "LOC_GEO_LABELS_COLLAPSE" : "LOC_GEO_LABELS_EXPAND");
    });
    for (const info of members) {
      info.isHidden = !expanded;
      safe(() => info.forceRender?.());
    }
  }
  const toggle = () => setExpanded(!expanded);

  header.initListener = () => {
    expanded = false;
    decorateSection(header.id, toggle, () => expanded);
  };
  header.activateListener = () => {
    toggle();
    // The screen counts every Editor press as a pending change, which would make
    // Cancel ask to revert. Opening a section changes nothing, so pre-cancel it.
    Options.changeRefCount--;
    return true; // handled: don't push an editor screen
  };
  safe(() => Options.addOption(header));

  for (const cat of group.members) {
    const info = categoryOption(cat);
    members.push(info);
    safe(() => Options.addOption(info));
  }
}

function categoryOption(cat) {
  return {
    category: CategoryType.Mods,
    group: SHOW_GROUP,
    type: OptionType.Checkbox,
    id: "geo-labels-vis-" + cat.id,
    label: cat.loc,
    description: "LOC_GEO_LABELS_VIS_DESC",
    initListener: (i) => {
      i.currentValue = isCategoryVisible(cat.id);
      i.openValue = i.currentValue;
      i.isHidden = true;
    },
    restoreListener: (i) => {
      if (isCategoryVisible(cat.id) === i.openValue) return;
      setCategoryVisible(cat.id, i.openValue);
      refreshLayer();
    },
    updateListener: (i, value) => {
      // Keep currentValue in step: forceRender (expand/collapse) re-applies it.
      i.currentValue = !!value;
      setCategoryVisible(cat.id, !!value);
      refreshLayer();
    },
  };
}

// The base game rebuilds the Options list every time changes are confirmed:
// Options.reInitOptions() clears it and re-runs the registered init callbacks.
// Options added once at load (as before) vanished after the first Confirm until
// the game restarted; as an init callback they come back on every rebuild, like
// the base game's own options and other mods'.
function registerAll() {
  registerFlat();
  registerCategories();
}
safe(() => {
  try {
    Options.addInitCallback(registerAll);
  } catch (_e) {
    registerAll(); // the list was already built: add them now
  }
});

export {};
