# Backlog

Findings from the 2026-07-10 corpus bug-hunt audit. All four were fixed in 1.0.3 (see CHANGELOG.md). The
entries are kept as written, with the line numbers of the code at the time, for the reasoning behind each fix.
Each carries [severity · confidence].

## [Medium · Confirmed] Desert labels lose every overlap contest (priority key typo)

**Site:** [ui/geo-labels-compute.js:339](../ui/geo-labels-compute.js)
**Symptom:** the `priority` map keys deserts as `desert` (singular), but desert region
keys are built from `cat.typeKey = "deserts"` (plural;
[ui/geo-labels-toponyms.js:3](../ui/geo-labels-toponyms.js),
[ui/geo-labels-map.js:234](../ui/geo-labels-map.js)). `labelType()` extracts `"deserts"`
from the key, so `priority["deserts"]` is `undefined → 0`.
**Failure scenario:** whenever a desert label's reach circle overlaps any other region
label, the desert is treated as lowest priority (0), below mountains (3), taiga/jungle
(2), islands (4), continents (5), wonders (6), so the desert name is the one hidden even
when it is the larger/more central feature. Every other type key matches; only desert is
wrong.
**Fix:** change the map key to `deserts: 2` (or key `priority` off `cat.typeKey`
consistently). One word.

**Design:** in the `priority` map (`geo-labels-compute.js:339`) rename the key
`desert` → `deserts` so it matches the `cat.typeKey = "deserts"` prefix that
`labelType()` (`:366`, `key.slice(0, key.indexOf(":"))`) extracts. Desert then resolves
to priority 2 (equal with taiga/jungle), and the existing `priority[labelType(x)] || 0`
sort orders it correctly. No other type key changes (`wonder`/`cont`/`isle`/`mountains`/
`taiga`/`jungle` already match). The `|| 0` fallback means the only observable change is
that deserts stop being forced to 0.
**Verify:** on a map with a large desert overlapping a smaller mountain/jungle label,
confirm the desert name now renders (previously hidden).

## [Low · Confirmed] saveGame quota fallback is dead code

**Site:** [ui/geo-labels-compute.js:116-124](../ui/geo-labels-compute.js)
**Symptom:** the try/catch around `writeStore(all)` is meant to retry without `auto` on a
quota failure, but `writeStore` (`:92-94`) already swallows every error via `safe()`, so
it never throws and the catch never runs.
**Failure scenario:** on a real `QuotaExceededError` the intended "shrink by dropping auto
names and retry" never happens; the write silently no-ops and that turn's label state is
lost. Not a crash, but a defeated safety net.
**Fix:** have `writeStore` (or an inner unguarded variant) throw so the fallback can
catch, or move the retry logic inside `writeStore`.

**Design:** add an unguarded inner writer beside `writeStore`:
```js
function writeStoreRaw(value) {            // may throw (e.g. QuotaExceededError)
  localStorage.setItem(STORE_KEY, JSON.stringify(value));
}
```
In `saveGame` (`:116`), call `writeStoreRaw(all)` inside the `try`, so the existing catch
(blank `auto`, retry with only `custom`) actually fires on a quota failure. Keep the
`safe()`-wrapped `writeStore` for all other call sites that intentionally swallow. The
retry drops the regenerable `auto` names (they recompute next pass) while preserving
user `custom` renames, which is the intended degradation. **Verify:** temporarily stub
`localStorage.setItem` to throw once, call `saveGame`, and confirm the second (auto-less)
write runs and `custom` survives.

## [Low · Medium] Features spanning the X wrap seam get a misplaced centroid/angle

**Site:** [ui/geo-labels-compute.js:34-53](../ui/geo-labels-compute.js) (centroid),
[ui/geo-labels-format.js:42](../ui/geo-labels-format.js) (axisAngleDeg)
**Symptom:** both average raw `x`/`y`. `neighbors()` correctly follows the engine's
X-wrap, so a single region can contain tiles near `x=0` and `x=w-1`.
**Failure scenario:** a desert/range/continent straddling the date-line seam computes a
centroid in the numeric middle of the map (the wrong side), placing the label far from
the feature. Identity (`anchorIndex`) is unaffected; the mis-placement is cosmetic.
**Fix:** compute centroid/covariance in wrapped (circular-mean) X space.

**Design:** grid width is available as `w = GameplayMap.getGridWidth()` (via `dims()`,
`geo-labels-compute.js:23`). Replace the raw arithmetic mean of X with a **circular mean**:
map each `x → θ = 2π·x/w`, accumulate `Σsin θ` and `Σcos θ`, take
`x̄ = ((atan2(Σsin, Σcos) / 2π) · w + w) mod w`. Apply in two places:
- `centroid` (`:34`, has `dims()` in scope): use the circular mean for X, plain mean for Y,
  then keep the existing snap-to-nearest-plot step.
- `covariance`/`axisAngleDeg` (`geo-labels-format.js:13/42`, pure; thread `w` in as a new
  arg from the compute-side caller): subtract the circular-mean X with wrap-aware deltas
  (`dx = ((x - x̄ + w/2) mod w) - w/2`) before the covariance sums.
Y needs no wrapping (no vertical wrap). Cosmetic only and lowest priority; identity
(`anchorIndex`) is unaffected. **Verify:** on a map with a desert/continent straddling
x=0/x=w-1, confirm the label sits on the feature, not the map's numeric middle.

## [Very Low · Medium] Corrupt store holding a JSON primitive throws unhandled

**Site:** [ui/geo-labels-compute.js:133-142](../ui/geo-labels-compute.js) (readStore /
migrateStore), thrown out through [ui/geo-labels-layer.js:99](../ui/geo-labels-layer.js)
**Symptom:** if `localStorage[STORE_KEY]` parses to a primitive (e.g. `"5"` / `"true"`),
`readStore` returns it, then `all._schema = SCHEMA_VERSION` assigns a property to a
primitive → `TypeError` under strict mode; `computeLabels` is called un-`safe`d in
`applyLayer`, so the throw propagates.
**Failure scenario:** only reachable if the store is externally corrupted to a bare JSON
scalar; normal writes always store an object. Realistically near-zero, noted for
completeness.
**Fix:** coerce non-object parse results to `{}` in `readStore`
(`typeof x === "object" && x ? x : {}`).

**Design:** harden `readStore` (`:87`) to only return a plain object, reusing the idiom
from the sibling `history_and_rankings/ui/timeline-store.js:70`:
```js
function readStore() {
  const raw = safe(() => localStorage.getItem(STORE_KEY));
  const o = raw ? safe(() => JSON.parse(raw)) : null;
  return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
}
```
This prevents a primitive/array parse result from reaching `all._schema = …` (which throws
a `TypeError` in strict mode) or `Object.keys(all)`. Normal writes always store an object,
so nothing changes in the happy path. **Verify:** set
`localStorage[STORE_KEY] = '"5"'`, run `computeLabels`, and confirm it returns labels
(regenerating fresh state) instead of throwing out of `applyLayer`.

## [Medium · Watched, cause confirmed] Labels go away while some units are selected

**Report:** Workshop comment, 2026-10-16: "is it intentional that the labels disappear whenever a Unit is selected?"
It isn't intentional.

**Likely cause:** selecting a unit can switch the map lens (base game
`base-standard/ui/interface-modes/interface-mode-unit-selected.js`, `setUnitLens`): Founder → `fxs-founder-lens`,
other settlers → `fxs-settler-lens`, Merchants → `fxs-trade-lens`, Modern Archaeologists → `fxs-continent-lens`, and
anything tagged `UNIT_CLASS_AUTOEXPLORE` (Scouts, plus every naval unit in Exploration) → `fxs-discovery-lens`.
`LensManager.setActiveLens` turns off every enabled layer the new lens doesn't list in `activeLayers` or
`allowedLayers`, and `tmt-geo-labels-layer` isn't on any lens's lists. Yields survive because the base lenses list
`fxs-yields-layer`. Deselecting goes back to the default lens, which restores its cached layers, so the labels come
back. A Warrior or other plain unit stays on the default lens, where `setActiveLens` returns early, so the labels
should stay put; with Universal Auto-Explore on, the units it tags also stay on the default lens.

**Cheapest disproof:** in a lab game with the labels on, select a Warrior, then a Scout, then a Settler, and read
`LensManager.getActiveLens()` and `LensManager.isLayerEnabled("tmt-geo-labels-layer")` after each. If the labels go
off on the Warrior too, or stay on for the Scout, this cause is wrong or incomplete.

**Fix, once watched:** at layer registration, add `tmt-geo-labels-layer` to `allowedLayers` on the unit lenses read
from `LensManager.lenses` at runtime (founder, settler, trade, continent, discovery), skipping any lens that's missing,
so whatever lenses other mods register or change are left alone. Leave the diplomacy and cinematic lenses as they are.

**Watched, usual set, 2026-10-16 (block 1 L1):** labels switched on with `toggleLayer`; `UI.Player.selectUnit` then
`deselectAllUnits`, readings 1.8 s after each. Warrior: `fxs-default-lens`, labels on, no lens event. Scout:
`fxs-discovery-lens`, labels off (layer- `tmt-geo-labels-layer`, layer+ `fxs-discovery-layer`). Settler:
`fxs-settler-lens`, off. Founder: `fxs-founder-lens`, off. Each deselect went back to `fxs-default-lens` with layer+
`tmt-geo-labels-layer`. Captures `L1-gl-usual-1`..`8` in `working_screenshots/watch2-block1/` (the Tonle Sap River
label shows with the Warrior and is gone with the Scout).

**Watched, Geographic Labels alone, 2026-10-16 (block 1 V4, run `2026-10-16T18-30-41`):** the same readings and the
same lens and layer events. Warrior: default lens, labels stay. Scout: discovery lens, off. Settler: settler lens, off.
Founder: founder lens, off. Each deselect went back to the default lens with the labels on. Captures
`V4-gl-alone-*` in `working_screenshots/watch2-block1/`. So the cause is watched on both sides, and the fix
(`allowedLayers` on the unit lenses) can go ahead.

**Fix built, 2026-10-16, not watched yet:** `ui/geo-labels-lenses.js` adds the layer to `allowedLayers` on the five
unit lenses found in `LensManager.lenses`, right after the layer registers and again each time the labels are drawn
on. Checked against 1.5.0 `setActiveLens`: an enabled layer survives when the new lens lists it in `allowedLayers`
and blends, and none of the five sets `blendEnabledLayersOnTransition = false` (only the default lens does). The UI log
line `labels allowed on unit lenses: ...` names the lenses it reached. `tests/geo-labels-lenses.test.mjs` runs the
same rule in a fake lens manager. One side effect follows the base game's caching: the settler, trade and continent
lenses remember the layers that were on when they were last left, so labels switched off on the default lens after a
Settler visit come back on the next Settler selection and go off again on deselect, as the hex grid already does.
Still to watch: the same five selections in a lab game, labels on throughout, with Geographic Labels alone and with
the usual set.
