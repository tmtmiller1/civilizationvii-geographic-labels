/**
 * Geographic Labels — mini-map menu checkbox.
 *
 * Injects a "Geographic Names" checkbox next to "Yields" in the mini-map lens/decoration menu, toggling
 * the geo-labels lens layer. Uses a MutationObserver (no ReplaceUIScript) so it plays nicely with other mods.
 */

import LensManager from "/core/ui/lenses/lens-manager.js";
import { createLogger, safe } from "./geo-labels-utils.js";

const TAG = "[GeoLabels]";
const LAYER_TYPE = "tmt-geo-labels-layer";                 // must match geo-labels-layer.js
const CHANGE_EVENT = "component-value-changed";            // ComponentValueChangeEventName
// base-game LOC (engine-owned; NOT defined in this mod's ModText.xml) — used here
// as a DOM selector to locate the base game's "Yields" mini-map row, not as our text.
const YIELDS_SELECTOR = '[data-l10n-id="LOC_UI_MINI_MAP_YIELDS"]';
const MY_ID = "geo-labels-toggle-row";

const DBG = true; // release.sh flips this to false to silence logs in shipped builds
const log = createLogger(TAG, () => DBG);
let toggleObserver = null;
let toggleIntervalId = null;
let started = false;

function getContainer() {
  if (typeof document === "undefined" || !document.body) return null;
  if (document.getElementById(MY_ID)) return true;
  const yieldsLabel = document.querySelector(YIELDS_SELECTOR);
  if (!yieldsLabel) return null;
  // Walk up from the Yields label to the shared checkbox container (fxs-spatial-slot).
  const row = yieldsLabel.parentElement;
  return row && row.parentElement;
}

function createToggleRow(container, enabled) {
  const baseClass =
    "flex flex-row items-center";
  const yieldsLabel = document.querySelector(YIELDS_SELECTOR);
  const row = yieldsLabel && yieldsLabel.parentElement;
  const myRow = document.createElement("div");
  myRow.id = MY_ID;
  myRow.className = (row && row.className) || baseClass;

  const checkbox = document.createElement("fxs-checkbox");
  checkbox.classList.add("mr-2");
  checkbox.setAttribute("selected", enabled ? "true" : "false");
  checkbox.setAttribute(
    "data-audio-group-ref",
    "audio-panel-mini-map",
  );
  checkbox.setAttribute(
    "data-audio-focus-ref",
    "data-audio-checkbox-focus",
  );

  const label = buildToggleLabel();

  myRow.appendChild(checkbox);
  myRow.appendChild(label);
  container.appendChild(myRow);
  return checkbox;
}

function buildToggleLabel() {
  const label = document.createElement("div");
  label.role = "paragraph";
  label.className =
    "text-accent-2 text-base font-body " +
    "pointer-events-auto shrink font-fit-shrink";
  label.dataset.l10nId = "LOC_GEO_LABELS_TOGGLE";
  return label;
}

function bindCheckbox(checkbox) {
  checkbox.addEventListener(CHANGE_EVENT, (event) => {
    const on = event && event.detail ? event.detail.value : undefined;
    safe(() => {
      const cur = LensManager.isLayerEnabled(LAYER_TYPE);
      if (cur !== on) {
        LensManager.toggleLayer(LAYER_TYPE, {
          force: !!on,
          serialize: true,
        });
      }
    });
  });
}

function tryInject() {
  const container = getContainer();
  if (container === true) return true;
  if (!container) return false;

  const enabled = safe(() => LensManager.isLayerEnabled(LAYER_TYPE)) === true;
  const checkbox = createToggleRow(container, enabled);
  bindCheckbox(checkbox);

  log(
    "checkbox injected next to Yields",
  );
  return true;
}

// The mini-map panel REBUILDS (leaving/returning to the window, closing the panel, etc.), which drops our
// injected checkbox. So keep watching FOREVER and re-inject whenever it's missing. tryInject is idempotent.
function start() {
  if (started) return;
  started = true;
  tryInject();
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      tryInject();
    }, 400);
  };
  if (typeof MutationObserver !== "undefined" && document.body) {
    toggleObserver = new MutationObserver(schedule);
    toggleObserver.observe(document.body, { childList: true, subtree: true });
  }
  // Belt-and-suspenders: catches rebuilds the observer might miss.
  toggleIntervalId = setInterval(tryInject, 3000);
}

function stop() {
  if (toggleObserver) {
    safe(() => toggleObserver.disconnect());
    toggleObserver = null;
  }
  if (toggleIntervalId != null) {
    clearInterval(toggleIntervalId);
    toggleIntervalId = null;
  }
  started = false;
}

start();
safe(() => {
  if (typeof window !== "undefined") {
    window.__geoLabelsToggle = {
      start,
      stop,
      reinject: tryInject,
    };
  }
});
export {};
