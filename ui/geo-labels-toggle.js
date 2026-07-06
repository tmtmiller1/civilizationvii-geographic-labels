/**
 * Geographic Labels — mini-map menu checkbox.
 *
 * Injects a "Geographic Names" checkbox next to "Yields" in the mini-map lens/decoration menu, toggling
 * the geo-labels lens layer. Uses a MutationObserver (no ReplaceUIScript) so it plays nicely with other mods.
 */

import LensManager from "/core/ui/lenses/lens-manager.js";

const TAG = "[GeoLabels]";
const LAYER_TYPE = "tmt-geo-labels-layer";                 // must match geo-labels-layer.js
const CHANGE_EVENT = "component-value-changed";            // ComponentValueChangeEventName
const YIELDS_SELECTOR = '[data-l10n-id="LOC_UI_MINI_MAP_YIELDS"]';
const MY_ID = "geo-labels-toggle-row";

const DBG = true; // release.sh flips this to false to silence logs in shipped builds
function log() { if (!DBG) return; try { console.error.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
function safe(fn) { try { return fn(); } catch (_e) { return undefined; } }

function tryInject() {
  if (typeof document === "undefined" || !document.body) return false;
  if (document.getElementById(MY_ID)) return true;              // already injected
  const yieldsLabel = document.querySelector(YIELDS_SELECTOR);
  if (!yieldsLabel) return false;                               // menu not built yet
  // Walk up from the Yields label to the shared checkbox container (fxs-spatial-slot).
  const row = yieldsLabel.parentElement;                        // the w-1/2 flex row
  const container = row && row.parentElement;                   // layerCheckboxContainer
  if (!container) return false;

  const enabled = safe(() => LensManager.isLayerEnabled(LAYER_TYPE)) === true;

  const myRow = document.createElement("div");
  myRow.id = MY_ID;
  myRow.className = row.className || "flex flex-row items-center";

  const checkbox = document.createElement("fxs-checkbox");
  checkbox.classList.add("mr-2");
  checkbox.setAttribute("selected", enabled ? "true" : "false");
  checkbox.setAttribute("data-audio-group-ref", "audio-panel-mini-map");
  checkbox.setAttribute("data-audio-focus-ref", "data-audio-checkbox-focus");

  const label = document.createElement("div");
  label.role = "paragraph";
  label.className = "text-accent-2 text-base font-body pointer-events-auto shrink font-fit-shrink";
  label.dataset.l10nId = "LOC_GEO_LABELS_TOGGLE";

  myRow.appendChild(checkbox);
  myRow.appendChild(label);
  container.appendChild(myRow);

  checkbox.addEventListener(CHANGE_EVENT, (event) => {
    const on = event && event.detail ? event.detail.value : undefined;
    safe(() => {
      const cur = LensManager.isLayerEnabled(LAYER_TYPE);
      if (cur !== on) LensManager.toggleLayer(LAYER_TYPE, { force: !!on, serialize: true });
    });
  });

  log("checkbox injected next to Yields");
  return true;
}

// The mini-map panel REBUILDS (leaving/returning to the window, closing the panel, etc.), which drops our
// injected checkbox. So keep watching FOREVER and re-inject whenever it's missing. tryInject is idempotent.
function start() {
  tryInject();
  let pending = false;
  const schedule = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; tryInject(); }, 400); };
  if (typeof MutationObserver !== "undefined" && document.body) {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  setInterval(tryInject, 3000); // belt-and-suspenders: catches rebuilds the observer might miss
}

start();
export {};
