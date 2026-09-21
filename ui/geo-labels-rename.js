/**
 * Geographic Labels — "Rename Places" window.
 *
 * Injects a "Rename Places…" button into the mini-map lens menu (under the
 * Geographic Names checkbox). It opens a game-styled window (a Panel pushed by
 * ContextManager, so the game supplies the dimmed backdrop, input routing, and
 * Escape / controller-back) listing every current label in an fxs-textbox.
 * Enter, or leaving the field, renames; a blank field or Restore brings back
 * the generated name. Edits persist per game (geo-labels-store.js) and the map
 * updates live. A search box filters the list.
 */

import Panel from "/core/ui/panel-support.js";
import ContextManager from "/core/ui/context-manager/context-manager.js";
import { InputEngineEventName } from "/core/ui/input/input-support.js";
import ViewManager from "/core/ui/views/view-manager.js";
import { createLogger, safe } from "./geo-labels-utils.js";

const TAG = "[GeoLabels]";
const BTN_ID = "geo-labels-rename-btn";
const SCREEN = "geo-labels-rename-screen";
// base-game LOC (engine-owned) — used as a DOM selector to find the Yields row.
const YIELDS_SELECTOR = '[data-l10n-id="LOC_UI_MINI_MAP_YIELDS"]';
const TYPE_LABEL = {
  cont: "Continent", isle: "Island", archipelagos: "Archipelago", keys: "Keys",
  deserts: "Desert", taiga: "Taiga", jungle: "Jungle", mountains: "Mountains",
  wonder: "Wonder", lakes: "Lake", seas: "Sea", gulfs: "Gulf", bays: "Bay",
  sounds: "Sound", inlets: "Inlet", fjords: "Fjord", reefs: "Reef", atolls: "Atoll",
  estuaries: "Estuary", rivernav: "River", riverminor: "River (minor)",
};
// Colors sampled from the game's own window: EDGE is the thin khaki line on the
// popup frame's rim, which the fields and row rules reuse so they read as part of
// the frame; muted parchment for secondary text; gold for the "your name" star.
const EDGE = "#716956";
const EDGE_LIT = "#948a70";
const MUTED = "#a99a7c";
const GOLD = "#f3c34c";
const RULE = "rgba(113,105,86,0.45)";
// fxs-textbox draws a thicker grey-blue `border-primary-1` edge; this window's
// fields use the frame's own 1px rim instead, lifting a little on hover/focus.
// The selectors out-rank the component's single-class rules.
const FIELD_CSS = `
.geo-labels-rename-screen .geo-field input { border-width: 1px; border-color: ${EDGE}; }
.geo-labels-rename-screen .geo-field input:hover,
.geo-labels-rename-screen .geo-field input:focus { border-color: ${EDGE_LIT}; }`;

const DBG = true; // release.sh flips this to false to silence logs in shipped builds
const log = createLogger(TAG, () => DBG);

function api() {
  return (typeof window !== "undefined" && window.__geoLabels) || null;
}

function loc(key, fallback) {
  const s = safe(() => Locale.compose(key));
  return s && s !== key ? s : fallback;
}

function el(tag, cls, style, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (style) node.setAttribute("style", style);
  if (text != null) node.textContent = text;
  return node;
}

// fxs-textbox keeps its current text in the `value` attribute.
function boxValue(box) {
  return String(box.getAttribute("value") ?? "");
}

function injectFieldStyle() {
  if (document.getElementById("geo-labels-rename-style")) return;
  const style = document.createElement("style");
  style.id = "geo-labels-rename-style";
  style.textContent = FIELD_CSS;
  document.head.appendChild(style);
}

// A game text field for this window. `enabled` is deliberately NOT set: on
// fxs-textbox it means "start editing now" (it grabs focus and goes read-only),
// so setting it on every row handed focus to the last one.
function field(cls) {
  const box = document.createElement("fxs-textbox");
  box.className = "geo-field " + cls;
  return box;
}

class GeoLabelsRenameScreen extends Panel {
  rows = [];
  worldInputWas = null;
  engineInputListener = (event) => this.onEngineInput(event);

  onInitialize() {
    super.onInitialize();
    this.enableOpenSound = true;
    this.enableCloseSound = true;
    this.Root.setAttribute("data-audio-group-ref", "audio-screen-unlocks");
    safe(injectFieldStyle);
    this.render();
  }

  onAttach() {
    super.onAttach();
    this.Root.addEventListener(InputEngineEventName, this.engineInputListener);
    // Keep typed letters out of the map's hotkeys while the window is open.
    safe(() => {
      this.worldInputWas = ViewManager.isWorldInputAllowed;
      ViewManager.isWorldInputAllowed = false;
    });
    log("rename window opened with", this.rows.length, "entries");
  }

  onDetach() {
    this.Root.removeEventListener(InputEngineEventName, this.engineInputListener);
    safe(() => {
      if (this.worldInputWas !== null) ViewManager.isWorldInputAllowed = this.worldInputWas;
    });
    super.onDetach();
  }

  onEngineInput(event) {
    if (event?.detail?.status !== InputActionStatuses.FINISH) return;
    if (event.detail.name === "cancel" || event.detail.name === "keyboard-escape") {
      this.close();
      event.stopPropagation();
      event.preventDefault();
    }
  }

  render() {
    // add, don't assign: the screen's own class scopes FIELD_CSS.
    this.Root.classList.add("absolute", "inset-0", "flex", "items-center", "justify-center", "pointer-events-auto");
    this.Root.innerHTML = `
      <fxs-frame frame-style="f2" class="flex flex-col" style="width:46rem;height:80vh;">
        <fxs-header class="font-title text-xl uppercase text-secondary" filigree-style="h4"></fxs-header>
        <div data-geo-hint class="font-body text-sm px-6 mt-2"></div>
        <div data-geo-search class="flex flex-row items-center px-6 mt-3"></div>
        <fxs-scrollable class="flex-auto mt-3" style="min-height:0;">
          <fxs-vslot data-geo-list class="px-6 pb-4"></fxs-vslot>
        </fxs-scrollable>
        <div class="h-6"></div>
        <fxs-close-button></fxs-close-button>
      </fxs-frame>`;
    this.Root.querySelector("fxs-header")
      .setAttribute("title", loc("LOC_GEO_LABELS_RENAME_TITLE", "Rename Places"));
    this.Root.querySelector("fxs-close-button")
      .addEventListener("action-activate", () => this.close());

    const geo = api();
    const labels = (geo && safe(() => geo.getLabels())) || [];
    // Alphabetical by the name as shown on the map, so a player can find a place
    // mid-game without knowing which category the mod filed it under.
    labels.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: "base" }));

    const hint = this.Root.querySelector("[data-geo-hint]");
    hint.setAttribute("style", "color:" + MUTED + ";");
    hint.textContent = labels.length
      ? loc("LOC_GEO_LABELS_RENAME_HINT",
        "Type a new name and press Enter. Leave it blank, or press Restore, to bring back the generated name. "
        + "★ marks your names.")
      : loc("LOC_GEO_LABELS_RENAME_EMPTY", "No labels yet. Turn on Geographic Names on a map first.");

    if (labels.length) this.buildSearch(this.Root.querySelector("[data-geo-search]"));
    const list = this.Root.querySelector("[data-geo-list]");
    for (const label of labels) list.appendChild(this.buildRow(label));
  }

  buildSearch(host) {
    const search = field("flex-auto");
    search.setAttribute("placeholder", loc("LOC_GEO_LABELS_RENAME_SEARCH", "Find a place…"));
    const filter = (text) => {
      const q = String(text || "").trim().toLowerCase();
      for (const r of this.rows) {
        const hit = !q || r.search.includes(q) || boxValue(r.box).toLowerCase().includes(q);
        r.row.style.display = hit ? "" : "none";
      }
    };
    search.addEventListener("text-changed", (e) => filter(e.detail?.newStr));
    host.appendChild(search);
  }

  buildRow(label) {
    const c = rowControls(label);
    const r = { row: c.row, box: c.box, search: (label.text + " " + c.type).toLowerCase(),
      shown: label.text, cust: !!label.cust };
    const paint = () => {
      c.star.textContent = r.cust ? "★" : "";
      c.restore.style.visibility = r.cust ? "visible" : "hidden";
    };
    const commit = (value) => {
      const name = String(value).trim();
      if (name === r.shown && (name !== "" || !r.cust)) return;
      const g = api();
      if (!g || !g.setName) { log("commit: no api/setName"); return; }
      const ok = safe(() => g.setName(label.key, name));
      // Read back what the map now shows: a blank name restores the generated one.
      const now = safe(() => g.getLabels().find((l) => l.key === label.key));
      r.cust = now ? !!now.cust : name !== "";
      r.shown = now ? now.text : name;
      c.box.setAttribute("value", r.shown);
      c.badge.style.color = ok === false ? "#ff6b6b" : MUTED;
      paint();
    };
    // Keyboard: Enter renames, Escape puts the shown name back. A controller's
    // on-screen keyboard reports through text-edit-stop instead.
    c.box.addEventListener("keyup", (e) => {
      if (e.code === "Enter") commit(boxValue(c.box));
      else if (e.code === "Escape") c.box.setAttribute("value", r.shown);
    });
    c.box.addEventListener("text-edit-stop", (e) => {
      if (e.detail?.confirmed) commit(boxValue(c.box));
      else c.box.setAttribute("value", r.shown);
    });
    c.box.addEventListener("focusout", () => commit(boxValue(c.box)));
    c.restore.addEventListener("action-activate", () => commit(""));
    paint();
    this.rows.push(r);
    return c.row;
  }
}

// One list row: category, name field, "your name" star, and the restore button.
function rowControls(label) {
  const type = TYPE_LABEL[label.type] || label.type;
  const row = el("div", "flex flex-row items-center py-1", "border-bottom:1px solid " + RULE + ";");
  const badge = el("div", "font-body text-xs uppercase", "width:8rem;flex:0 0 auto;color:" + MUTED + ";", type);
  const box = field("flex-auto");
  box.setAttribute("max-length", "60");
  box.setAttribute("value", label.text);
  const star = el("div", "font-body text-base ml-3", "width:1.25rem;color:" + GOLD + ";");
  const restore = document.createElement("fxs-activatable");
  // A word, not an arrow: the game font has no ↺ (or any clear undo glyph).
  restore.className = "font-body text-xs uppercase ml-2 cursor-pointer";
  restore.setAttribute("style", "width:4.5rem;color:" + MUTED + ";");
  restore.setAttribute("data-tooltip-content", loc("LOC_GEO_LABELS_RENAME_RESTORE", "Restore the generated name"));
  restore.setAttribute("data-audio-group-ref", "options");
  restore.textContent = loc("LOC_GEO_LABELS_RENAME_RESTORE_BTN", "Restore");
  for (const part of [badge, box, star, restore]) row.appendChild(part);
  return { type, row, badge, box, star, restore };
}

Controls.define(SCREEN, {
  createInstance: GeoLabelsRenameScreen,
  description: "Geographic Labels: rename places.",
  classNames: ["geo-labels-rename-screen"],
  attributes: [],
});

function openPanel() {
  safe(() => ContextManager.push(SCREEN, { singleton: true, createMouseGuard: true }));
}

function closePanel() {
  safe(() => ContextManager.pop(SCREEN));
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
