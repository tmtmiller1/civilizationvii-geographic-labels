/**
 * Geographic Labels — Civ VI-style names painted on the Civ VII map.
 */

import LensManager from "/core/ui/lenses/lens-manager.js";
import { styleText } from "./geo-labels-format.js";
import {
  computeLabels,
  getFlatSetting,
  setFlatSetting,
  budgetLabels,
  LABEL_BUDGET,
} from "./geo-labels-compute.js";
import { createLogger, safe } from "./geo-labels-utils.js";

const TAG = "[GeoLabels]";
const BUILD = "b6-no-overlay-group";
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

function textParams(fill, label) {
  const params = {
    fonts: FONTS,
    fontSize: label.fontSize,
    stroke: LABEL_STROKE,
    fill,
  };
  if (FLAT) {
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
    this._draw();
  }

  initLayer() {}

  applyLayer() {
    this._visible = true;
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

const instance = new GeoLabelsLayer();
safe(() => LensManager.registerLensLayer(LAYER_TYPE, instance));

try {
  if (typeof window !== "undefined") {
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
    };
  }
} catch (_e) {}

try {
  if (typeof engine !== "undefined" && engine.on) {
    engine.on("PlayerTurnActivated", () => instance.onAgeMaybeChanged());
  }
} catch (_e) {}

log("layer registered:", LAYER_TYPE, "| BUILD", BUILD);

export { LAYER_TYPE };
