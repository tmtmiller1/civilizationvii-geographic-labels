/**
 * Geographic Labels — Civ VI-style names painted on the Civ VII map.
 */

import LensManager from "/core/ui/lenses/lens-manager.js";
import { styleText } from "./geo-labels-format.js";
import {
  computeLabels,
  getFlatSetting,
  getLastComputedLabels,
  hasGameSeed,
  setCustomLabelName,
  setFlatSetting,
  budgetLabels,
  LABEL_BUDGET,
} from "./geo-labels-compute.js";
import { getLastWriteError } from "./geo-labels-store.js";
import { createLogger, safe } from "./geo-labels-utils.js";

const TAG = "[GeoLabels]";
// A draw attempted before the engine hands out a game seed generates nothing
// (see hasGameSeed()). Poll for the seed rather than caching that empty draw:
// ~30s is far past the worst load timing seen, and toggling the layer resets it.
const SEED_RETRY_MS = 1000;
const SEED_RETRY_LIMIT = 30;
const BUILD = "b8-single-instance";
const LAYER_TYPE = "tmt-geo-labels-layer";

const FONTS = [
  "TitleFont",
  "TitleFont-SC",
  "TitleFont-TC",
  "TitleFont-JP",
  "TitleFont-KR",
];
const LABEL_ALPHA = 64;
const LABEL_STROKE = 0;
const FACE_CAMERA = true;

const DBG = true;
const log = createLogger(TAG, () => DBG);

let FLAT = getFlatSetting();

function spriteModeForCurrentFlatSetting() {
  if (!FLAT) return true;
  const hasSpriteMode = typeof SpriteMode !== "undefined";
  if (hasSpriteMode && SpriteMode.Default != null) {
    return SpriteMode.Default;
  }
  return false;
}

function isRiverLabel(label) {
  return label.key.startsWith("rivernav:") || label.key.startsWith("riverminor:");
}

function textParams(fill, label) {
  const params = {
    fonts: FONTS,
    fontSize: label.fontSize,
    stroke: LABEL_STROKE,
    fill,
  };
  // River labels always lie flat along the water's course, even when the global
  // "follow terrain" option is off and everything else billboards to the camera.
  if (FLAT || isRiverLabel(label)) {
    params.followTerrain = true;
    params.angle = label.angle || 0;
  } else {
    params.faceCamera = FACE_CAMERA;
  }
  return params;
}

class GeoLabelsLayer {
  constructor() {
    this._grid = null;
    this._gridFlat = false;
    this._drawn = false;
    this._visible = false;
    this._labels = null;
    this._lastAge = safe(() => Game.age);
    this._seedRetries = 0;
    this._seedRetryPending = false;
    this._seedGaveUp = false;
  }

  // Retry a draw that was deferred for want of a game seed. Bounded, and never
  // more than one timer in flight.
  _scheduleSeedRetry() {
    if (this._seedRetryPending) return;
    if (this._seedRetries >= SEED_RETRY_LIMIT) {
      if (!this._seedGaveUp) {
        this._seedGaveUp = true;
        log(
          "no game seed after",
          SEED_RETRY_LIMIT,
          "retries - labels stay off rather than generate names other clients would not agree on;"
            + " toggle the layer to retry",
        );
      }
      return;
    }
    this._seedRetries += 1;
    this._seedRetryPending = true;
    const scheduled =
      safe(() => {
        setTimeout(() => {
          this._seedRetryPending = false;
          if (this._visible) this._draw();
        }, SEED_RETRY_MS);
        return true;
      }) === true;
    if (!scheduled) this._seedRetryPending = false;
  }

  _ensure() {
    if (this._grid && this._gridFlat === FLAT) return true;

    safe(() => {
      if (this._grid && this._grid.destroy) this._grid.destroy();
    });
    this._grid = null;

    const mode = spriteModeForCurrentFlatSetting();
    const ok =
      safe(() => {
        // Labels are painted into the sprite grid below (same call the base-game
        // yields layer uses). We deliberately do NOT create a WorldUI overlay
        // group here: an earlier build created one at priority 10
        // (OVERLAY_PRIORITY.MAX_PRIORITY, above the CURSOR overlay) but never drew
        // into it, and that empty max-priority group swallowed world input —
        // units couldn't be selected anywhere while the layer was enabled. See
        // the CHANGELOG "Fixed" entry for the input-block investigation.
        this._grid = WorldUI.createSpriteGrid(
          "GeoLabelsGrid_" + (FLAT ? "flat" : "bb"),
          mode,
        );
        return true;
      }) === true;

    this._gridFlat = FLAT;
    return ok;
  }

  _draw() {
    if (this._drawn || !this._ensure()) return;

    // No seed yet: computeLabels() would generate nothing anyway. Leave _drawn
    // false so this is a deferral, not a cached empty map, and poll for the seed.
    if (!hasGameSeed()) {
      this._scheduleSeedRetry();
      return;
    }

    const fill = (LABEL_ALPHA & 0xff) * 0x1000000 + 0xffffff;
    // Hard-cap the glyphs painted into the sprite grid so this layer can never
    // overflow the shared UI render resource list and crash the game (see
    // LABEL_BUDGET). Cost is the actual letter-spaced string the grid rasterizes,
    // and computeLabels() returns labels most-important-first so any drop is the
    // least-significant tail.
    const { kept, glyphs, dropped } = budgetLabels(
      computeLabels(log),
      LABEL_BUDGET,
      (label) => styleText(label.text).length,
    );
    this._labels = kept;

    for (const label of kept) {
      const idx = safe(() =>
        GameplayMap.getIndexFromXY(label.plot.x, label.plot.y),
      );
      const ref = typeof idx === "number" ? idx : label.plot;
      const offset = label.offset || { x: 0, y: 0, z: 8 };
      const params = textParams(fill, label);
      safe(() => this._grid.addText(ref, styleText(label.text), offset, params));
    }

    this._drawn = true;
    if (dropped > 0) {
      log(
        "label budget reached:",
        kept.length,
        "labels /",
        glyphs,
        "glyphs painted;",
        dropped,
        "lower-priority labels dropped to stay under the UI render cap",
      );
    }
  }

  _redraw() {
    safe(() => this._grid && this._grid.clear());
    this._drawn = false;
    this._labels = null;
    this._seedRetries = 0;
    this._seedGaveUp = false;
    this._draw();
  }

  initLayer() {}

  applyLayer() {
    this._visible = true;
    this._seedRetries = 0;
    this._seedGaveUp = false;
    this._draw();
    safe(() => this._grid && this._grid.setVisible(true));
  }

  removeLayer() {
    this._visible = false;
    safe(() => this._grid && this._grid.setVisible(false));
  }

  onAgeMaybeChanged() {
    const age = safe(() => Game.age);
    if (age === this._lastAge) return;
    this._lastAge = age;
    if (this._visible) {
      this._redraw();
      return;
    }
    this._drawn = false;
    this._labels = null;
  }
}

// One layer instance per UI context, even if two copies of the mod are enabled
// (e.g. a Workshop copy beside a local dev copy: the engine runs this module
// once per copy). The lens manager only ever drives the FIRST registered
// instance, so a second one would paint a second, stale set of labels into its
// own sprite grid — renames then appear to add a name without removing the old.
const priorInstance = safe(() => window.__geoLabelsLayerInstance);
const instance = priorInstance || new GeoLabelsLayer();
if (!priorInstance) {
  safe(() => LensManager.registerLensLayer(LAYER_TYPE, instance));
  safe(() => { window.__geoLabelsLayerInstance = instance; });
} else {
  log("layer already registered in this context; second copy of the mod skipped");
}

// Labels for the Rename Places panel: every label that passed the category
// filter on the last compute (including ones hidden by overlap), or a fresh
// compute if the layer has not drawn yet this session.
function listLabels() {
  if (!getLastComputedLabels()) safe(() => computeLabels(log));
  const all = getLastComputedLabels() || [];
  const out = all.map((l) => ({
    key: l.key,
    text: String(l.text == null ? "" : l.text),
    type: l.key.slice(0, l.key.indexOf(":")),
    cust: !!l.cust,
  }));
  logListDiagnostics(out);
  return out;
}

function logListDiagnostics(list) {
  const counts = {};
  for (const l of list) counts[l.type] = (counts[l.type] || 0) + 1;
  log("rename list:", list.length, "entries by type", JSON.stringify(counts));
  const wonders = list.filter((l) => l.type === "wonder").map((l) => l.key + "=" + l.text);
  log("rename list wonders:", wonders.length ? wonders.join(" | ") : "(none)");
}

function renameLabel(key, name) {
  // Distinct from a write failure: with no seed there is no per-game bucket to
  // key the name to, so nothing was attempted. Unreachable in practice (with no
  // seed there are no labels to rename), but keeps the log honest.
  if (!hasGameSeed()) {
    log("rename ignored:", key, "- no game seed yet, nothing to key the name to");
    return false;
  }
  const ok = setCustomLabelName(key, name);
  if (!ok) log("rename write FAILED (kept in-session only):", getLastWriteError());
  else log("rename saved:", key, "=", JSON.stringify(name));
  instance._redraw();
  return ok;
}

try {
  if (typeof window !== "undefined" && !priorInstance) {
    window.__geoLabels = {
      type: LAYER_TYPE,
      recompute: () => instance._redraw(),
      setFlat: (value) => {
        FLAT = !!value;
        setFlatSetting(FLAT);
        instance._redraw();
        log("FLAT =", FLAT);
      },
      isFlat: () => FLAT,
      getLabels: listLabels,
      setName: renameLabel,
    };
  }
} catch (_e) {}

try {
  if (typeof engine !== "undefined" && engine.on && !priorInstance) {
    engine.on("PlayerTurnActivated", () => instance.onAgeMaybeChanged());
  }
} catch (_e) {}

log("layer registered:", LAYER_TYPE, "| BUILD", BUILD);

export { LAYER_TYPE };
