/**
 * Geographic Labels — "Rename Places" panel.
 *
 * Injects a "Rename Places…" button into the mini-map lens menu (under the
 * Geographic Names checkbox). Opens a modal list of every current label with an
 * editable field; edits persist per game (geo-labels-store.js) and the map
 * updates live. A blank field restores the generated name.
 *
 * While the panel is open, ViewManager.isWorldInputAllowed is turned off so
 * the text inputs receive the keyboard; it is restored on close.
 */

import ViewManager from "/core/ui/views/view-manager.js";
import { createLogger, safe } from "./geo-labels-utils.js";

const TAG = "[GeoLabels]";
const BTN_ID = "geo-labels-rename-btn";
const PANEL_ID = "geo-labels-rename-panel";
// base-game LOC (engine-owned) — used as a DOM selector to find the Yields row.
const YIELDS_SELECTOR = '[data-l10n-id="LOC_UI_MINI_MAP_YIELDS"]';
const TYPE_LABEL = {
  cont: "Continent", isle: "Island", archipelagos: "Archipelago", keys: "Keys",
  deserts: "Desert", taiga: "Taiga", jungle: "Jungle", mountains: "Mountains",
  wonder: "Wonder", lakes: "Lake", seas: "Sea", gulfs: "Gulf", bays: "Bay",
  sounds: "Sound", inlets: "Inlet", fjords: "Fjord", reefs: "Reef", atolls: "Atoll",
  estuaries: "Estuary", rivernav: "River", riverminor: "River (minor)",
};

const DBG = true; // release.sh flips this to false to silence logs in shipped builds
const log = createLogger(TAG, () => DBG);

function api() {
  return (typeof window !== "undefined" && window.__geoLabels) || null;
}

let worldInputWas = null;
function gateInput(off) {
  safe(() => {
    if (off) {
      worldInputWas = ViewManager.isWorldInputAllowed;
      ViewManager.isWorldInputAllowed = false;
    } else if (worldInputWas !== null) {
      ViewManager.isWorldInputAllowed = worldInputWas;
      worldInputWas = null;
    }
  });
}

function closePanel() {
  const el = document.getElementById(PANEL_ID);
  if (el) el.remove();
  gateInput(false);
}

function el(tag, css, text) {
  const node = document.createElement(tag);
  if (css) node.style.cssText = css;
  if (text != null) node.textContent = text;
  return node;
}

function buildHeader() {
  const header = el("div",
    "display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #2a3340;");
  header.appendChild(el("div", "font-weight:700;color:#42c5f5;font-size:16px;", "Rename Places"));
  const close = document.createElement("fxs-button");
  safe(() => close.setAttribute("caption", "Close"));
  safe(() => close.addEventListener("action-activate", closePanel));
  safe(() => close.addEventListener("click", closePanel));
  header.appendChild(close);
  return header;
}

function buildInput(label, commit) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = label.text;
  input.setAttribute("data-geo-key", label.key);
  // Without this the engine also treats each keystroke as a hotkey (the game's
  // own fxs-textbox sets the same attribute on its input).
  input.setAttribute("consume-keyboard-input", "true");
  input.style.cssText = "flex:1;background:#0d1016;border:1px solid #2a3340;border-radius:5px;color:#f0f0f0;"
    + "font-size:13px;padding:5px 8px;pointer-events:auto;";
  // Inputs don't inherit the panel's font, and GameFace reads `font-family:inherit`
  // as a font name (the text vanished), so the game's font class goes on directly.
  input.classList.add("font-body");
  for (const ev of ["keydown", "keyup", "keypress"]) {
    input.addEventListener(ev, (e) => safe(() => e.stopPropagation()));
  }
  input.addEventListener("change", () => commit(input.value));
  input.addEventListener("keydown", (e) => {
    if (e && (e.key === "Enter" || e.keyCode === 13)) {
      commit(input.value);
      safe(() => input.blur());
    }
  });
  input.addEventListener("click", () => safe(() => input.focus()));
  return input;
}

function buildApply(onClick) {
  const apply = el("div",
    "flex:0 0 auto;cursor:pointer;pointer-events:auto;border:1px solid #caa64f;border-radius:4px;padding:4px 12px;"
    + "background:#caa64f33;color:#f2e6c8;font-size:12px;user-select:none;", "Apply");
  apply.setAttribute("role", "button");
  apply.addEventListener("click", (e) => { safe(() => e.stopPropagation()); onClick(); });
  apply.addEventListener("mousedown", (e) => safe(() => e.stopPropagation()));
  return apply;
}

function buildRow(label) {
  const row = el("div", "display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #202833;");
  const badge = el("div",
    "min-width:88px;font-size:10px;color:#8a8a92;text-transform:uppercase;letter-spacing:0.06em;",
    (TYPE_LABEL[label.type] || label.type) + (label.cust ? " ★" : ""));
  const commit = (value) => {
    const g = api();
    if (!g || !g.setName) { log("commit: no api/setName"); return; }
    const ok = safe(() => g.setName(label.key, value));
    badge.textContent = (TYPE_LABEL[label.type] || label.type) + (String(value).trim() ? " ★" : "");
    badge.style.color = ok === false ? "#ff6b6b" : "#8a8a92";
  };
  const input = buildInput(label, commit);
  row.appendChild(badge);
  row.appendChild(input);
  row.appendChild(buildApply(() => commit(input.value)));
  return row;
}

function openPanel() {
  if (document.getElementById(PANEL_ID)) return;
  const geo = api();
  const labels = (geo && safe(() => geo.getLabels())) || [];
  // Alphabetical by the name as shown on the map, so a player can find a place
  // mid-game without knowing which category the mod filed it under.
  labels.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: "base" }));

  const backdrop = el("div",
    // GameFace ignores the `inset` shorthand (the backdrop shrank to the panel and
    // pinned top-left), so the full-screen box is spelled out.
    "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;display:flex;align-items:center;"
    + "justify-content:center;"
    + "background:#0008;pointer-events:auto;");
  backdrop.id = PANEL_ID;
  const panel = el("div",
    "width:480px;max-height:70vh;display:flex;flex-direction:column;background:#141820;border:2px solid #42c5f5;"
    + "border-radius:10px;box-shadow:0 8px 32px #000a;color:#f0f0f0;font-size:14px;");
  // The game's font stack (font-body): plain sans-serif has no ★, which drew as
  // an empty box in the hint and the "your name" badges.
  panel.classList.add("font-body");
  panel.appendChild(buildHeader());
  panel.appendChild(el("div", "font-size:11px;color:#8fd0ff;padding:8px 14px;", labels.length
    ? "Edit a name and press Enter or Apply. Leave blank to restore the generated name. ★ = your name."
    : "No labels yet — enable Geographic Names and load a map first."));
  const list = el("div", "overflow-y:auto;padding:4px 14px 12px;flex:1;");
  for (const label of labels) list.appendChild(buildRow(label));
  panel.appendChild(list);
  backdrop.appendChild(panel);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closePanel(); });
  document.body.appendChild(backdrop);
  gateInput(true);
  log("rename panel opened with", labels.length, "entries");
}

// ---- inject the "Rename Places…" button under the Geographic Names checkbox --

// The game's own button primitive: gold frame, hover/press states, press audio.
// (An earlier hand-rolled fxs-activatable put the frame in a `-z-1` child
// without a `z-0` stacking context on the parent, so the frame rendered behind
// the mini-map panel and only the text showed.)
function buildNativeButton() {
  const btn = document.createElement("fxs-button");
  btn.setAttribute("caption", "LOC_GEO_LABELS_RENAME");
  btn.setAttribute("data-audio-group-ref", "audio-panel-mini-map");
  btn.classList.add("fxs-button-small", "my-1");
  // fxs-button defaults to a 13rem-wide, 2.7rem-tall dialog button; shrink it
  // to sit comfortably under the checkbox rows.
  btn.style.cssText = "min-width:auto;min-height:1.8rem;padding:0.15rem 1rem;align-self:flex-start;";
  return btn;
}

function buildButton(rowClassName) {
  const btnRow = document.createElement("div");
  btnRow.id = BTN_ID;
  btnRow.className = rowClassName || "flex flex-row items-center";
  const btn = buildNativeButton();
  let firing = false;
  const run = () => {
    if (firing) return;
    firing = true;
    try { openPanel(); } finally { setTimeout(() => { firing = false; }, 0); }
  };
  btn.addEventListener("action-activate", run);
  btn.addEventListener("click", run);
  btnRow.appendChild(btn);
  return btnRow;
}

function tryInject() {
  if (typeof document === "undefined" || !document.body) return false;
  if (document.getElementById(BTN_ID)) return true;
  const yieldsLabel = document.querySelector(YIELDS_SELECTOR);
  if (!yieldsLabel) return false;
  const row = yieldsLabel.parentElement;
  const container = row && row.parentElement;
  if (!container) return false;
  container.appendChild(buildButton(row.className));
  log("rename button injected");
  return true;
}

// The mini-map panel rebuilds (leaving/returning to the window, etc.), dropping
// the button. Keep watching and re-inject when missing; tryInject is idempotent.
function start() {
  tryInject();
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; tryInject(); }, 400);
  };
  if (typeof MutationObserver !== "undefined" && document.body) {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  setInterval(tryInject, 3000);
}

start();
safe(() => {
  if (typeof window !== "undefined") window.__geoLabelsRename = { open: openPanel, close: closePanel };
});
export {};
