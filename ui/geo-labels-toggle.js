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

function log() { try { console.error.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
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

  // BETA: "Flat labels" — lay labels flat on terrain, oriented along the feature (Civ VI style).
  const flatRow = document.createElement("div");
  flatRow.id = MY_ID + "-flat";
  flatRow.className = row.className || "flex flex-row items-center";
  const flatCb = document.createElement("fxs-checkbox");
  flatCb.classList.add("mr-2");
  flatCb.setAttribute("selected", "false");
  flatCb.setAttribute("data-audio-group-ref", "audio-panel-mini-map");
  const flatLabel = document.createElement("div");
  flatLabel.role = "paragraph";
  flatLabel.className = "text-accent-2 text-base font-body pointer-events-auto shrink font-fit-shrink";
  flatLabel.dataset.l10nId = "LOC_GEO_LABELS_FLAT";
  flatRow.appendChild(flatCb); flatRow.appendChild(flatLabel);
  container.appendChild(flatRow);
  flatCb.addEventListener(CHANGE_EVENT, (event) => {
    const on = event && event.detail ? event.detail.value : undefined;
    safe(() => { const g = window.__geoLabels; if (g && g.setFlat) g.setFlat(!!on); });
  });

  log("checkboxes injected next to Yields");
  return true;
}

function start() {
  if (tryInject()) return;
  if (typeof MutationObserver === "undefined" || !document.body) {
    // Fallback: retry on a timer if observers/body aren't ready.
    let tries = 0;
    const id = setInterval(() => { if (tryInject() || ++tries > 60) clearInterval(id); }, 1000);
    return;
  }
  const obs = new MutationObserver(() => { if (tryInject()) obs.disconnect(); });
  obs.observe(document.body, { childList: true, subtree: true });
  // Also retry periodically — the mini-map panel can rebuild.
  let tries = 0;
  const id = setInterval(() => { tryInject(); if (++tries > 120) clearInterval(id); }, 2000);
}

start();
export {};
