/**
 * Geographic Labels — "Rename Places" panel.
 *
 * Injects a "Rename Places" button into the mini-map lens menu (next to the Geographic Names checkbox).
 * Opens a modal list of every current label with an editable field; edits are saved per-game and the map
 * labels update live. Blank field reverts to the generated name.
 *
 * While the panel is open we set ViewManager.isWorldInputAllowed = false so the text inputs receive the
 * keyboard (a floating panel otherwise loses key input to the world). Restored on close.
 */

import ViewManager from "/core/ui/views/view-manager.js";

const TAG = "[GeoLabels]";
const BTN_ID = "geo-labels-rename-btn";
const PANEL_ID = "geo-labels-rename-panel";
const YIELDS_SELECTOR = '[data-l10n-id="LOC_UI_MINI_MAP_YIELDS"]';
const TYPE_LABEL = { cont: "Continent", isle: "Island", desert: "Desert", taiga: "Taiga", jungle: "Jungle", plains: "Plains", steppe: "Steppe", mountains: "Mountains", wonder: "Wonder" };

function log() { try { console.error.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
function safe(fn) { try { return fn(); } catch (_e) { return undefined; } }
function api() { return (typeof window !== "undefined" && window.__geoLabels) || null; }

let _worldInputWas = null;
function gateInput(off) {
  safe(() => {
    if (off) { _worldInputWas = ViewManager.isWorldInputAllowed; ViewManager.isWorldInputAllowed = false; }
    else if (_worldInputWas !== null) { ViewManager.isWorldInputAllowed = _worldInputWas; _worldInputWas = null; }
  });
}

function closePanel() {
  const el = document.getElementById(PANEL_ID);
  if (el) el.remove();
  gateInput(false);
}

function openPanel() {
  if (document.getElementById(PANEL_ID)) return;
  const geo = api();
  const labels = geo ? safe(() => geo.getLabels()) || [] : [];

  const backdrop = document.createElement("div");
  backdrop.id = PANEL_ID;
  backdrop.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#0008;pointer-events:auto;";

  const panel = document.createElement("div");
  panel.style.cssText = "width:460px;max-height:70vh;display:flex;flex-direction:column;background:#141820;border:2px solid #42c5f5;border-radius:10px;box-shadow:0 8px 32px #000a;color:#f0f0f0;font:14px sans-serif;";

  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #2a3340;";
  const title = document.createElement("div");
  title.textContent = "Rename Places";
  title.style.cssText = "font-weight:700;color:#42c5f5;font-size:16px;";
  const close = document.createElement("fxs-button");
  safe(() => close.setAttribute("caption", "Close"));
  const closeRun = () => closePanel();
  safe(() => close.addEventListener("action-activate", closeRun));
  safe(() => close.addEventListener("click", closeRun));
  header.appendChild(title); header.appendChild(close);

  const hint = document.createElement("div");
  hint.textContent = labels.length ? "Edit a name and press Enter. Leave blank to restore the generated name." : "No labels yet — enable Geographic Names and load a map first.";
  hint.style.cssText = "font-size:11px;color:#8fd0ff;padding:8px 14px;";

  const list = document.createElement("div");
  list.style.cssText = "overflow-y:auto;padding:4px 14px 12px;flex:1;";

  labels.sort((a, b) => (a.type + a.text).localeCompare(b.type + b.text));
  for (const l of labels) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #202833;";
    const badge = document.createElement("div");
    badge.textContent = TYPE_LABEL[l.type] || l.type;
    badge.style.cssText = "min-width:78px;font-size:10px;color:#8a8a92;text-transform:uppercase;letter-spacing:0.06em;";
    const input = document.createElement("input");
    input.type = "text";
    input.value = l.text;
    input.setAttribute("data-geo-key", l.key);
    input.style.cssText = "flex:1;background:#0d1016;border:1px solid #2a3340;border-radius:5px;color:#f0f0f0;font:13px sans-serif;padding:5px 8px;pointer-events:auto;";
    const commit = () => { const g = api(); if (g) safe(() => g.setName(l.key, input.value)); };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => { if (e && (e.key === "Enter")) { commit(); safe(() => input.blur()); } });
    input.addEventListener("click", () => safe(() => input.focus()));
    row.appendChild(badge); row.appendChild(input); list.appendChild(row);
  }

  panel.appendChild(header); panel.appendChild(hint); panel.appendChild(list);
  backdrop.appendChild(panel);
  // Click outside the panel closes it.
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closePanel(); });
  document.body.appendChild(backdrop);
  gateInput(true);
  log("rename panel opened with", labels.length, "entries");
}

// ---- inject the "Rename Places" button next to the Geographic Names checkbox -------------------
function tryInject() {
  if (typeof document === "undefined" || !document.body) return false;
  if (document.getElementById(BTN_ID)) return true;
  const yieldsLabel = document.querySelector(YIELDS_SELECTOR);
  if (!yieldsLabel) return false;
  const row = yieldsLabel.parentElement;
  const container = row && row.parentElement;
  if (!container) return false;

  const btnRow = document.createElement("div");
  btnRow.id = BTN_ID;
  btnRow.className = row.className || "flex flex-row items-center";
  const btn = document.createElement("fxs-button");
  safe(() => btn.setAttribute("caption", "LOC_GEO_LABELS_RENAME"));
  btn.classList.add("mr-2");
  let firing = false;
  const run = () => { if (firing) return; firing = true; try { openPanel(); } finally { try { setTimeout(() => { firing = false; }, 0); } catch (_e) { firing = false; } } };
  safe(() => btn.addEventListener("action-activate", run));
  safe(() => btn.addEventListener("click", run));
  btnRow.appendChild(btn);
  container.appendChild(btnRow);
  log("rename button injected");
  return true;
}

// The mini-map panel rebuilds (leaving/returning to the window, etc.), dropping our button. Keep watching
// forever and re-inject when missing. tryInject is idempotent.
function start() {
  tryInject();
  let pending = false;
  const schedule = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; tryInject(); }, 400); };
  if (typeof MutationObserver !== "undefined" && document.body) {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  setInterval(tryInject, 3000);
}

start();
export {};
