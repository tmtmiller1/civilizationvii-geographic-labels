# Changelog

All notable changes to the **Geographic Labels** mod for Civilization VII. Loosely
follows [Keep a Changelog](https://keepachangelog.com/) and Semantic Versioning.
The Steam Workshop change note for each release is generated from the matching
section below by `release.sh`.

## [Unreleased]

## [1.4.0] - 2026-09-17

### Changed
- **Tidier Options tab.** The per-category show/hide checkboxes now sit under their own "Geographic Labels
  to Show" heading, in four collapsible sections — Land, Island, Sea and Coast, and River and Lake Labels.
  Click a section's title to open it; its checkboxes are listed alphabetically.

### Fixed
- **Settings are no longer written into another mod's storage.** This game's storage returns the wrong
  entry's contents on a read, so the mod could be handed a blob belonging to a different mod; writing it
  back copied that blob into the shared settings and grew it every time. The mod now checks that what it
  read is really the settings before saving, and declines to write otherwise. It never deletes or rewrites
  another mod's data.

## [1.3.0] - 2026-09-11

### Added
- **Rename Places.** A "Rename Places…" button under the Geographic Names checkbox in the mini-map's
  Decorations list opens an alphabetical list of every label on the current map — including ones the map
  is hiding for lack of room — with an editable field. Press Enter or Apply to rename; leave a field blank
  to restore the generated name. Your names are marked with a star, always win a collision with a
  generated label, and are saved with the game. Natural wonders, rivers, seas, and continents can be
  renamed too, not just the generated regions.

### Changed
- **Names are now saved inside the game itself.** Generated names and your renames are stored in the
  game's own per-save configuration, so they travel with the save, survive quit/reload and the age
  transition, and no longer compete for the small storage space every mod shares. Names from an existing
  game are carried over once on its next load. (This shared storage is what made the original 1.0
  rename attempt silently fail to save.)
- **Settings are stored the way other options mods store theirs.** The terrain-following toggle and the
  per-category show/hide checkboxes now live in the shared mod-settings store under this mod's own
  entry, written carefully so other mods' settings are never touched. The mod's old private storage
  key is removed after its contents are carried over.

### Fixed
- **Two enabled copies of the mod no longer paint two sets of labels.** If the game loads the mod
  twice (for example a Workshop copy beside a local copy), only the first registers, so a rename no
  longer appears to add a name while leaving the old one on the map.

## [1.2.1] - 2026-07-23

### Fixed
- **Generated names now stay put across save/reload.** The per-game name store was keyed on
  `Configuration.getGame().gameSeed`, falling back to a shared constant when that field read
  empty. If the seed ever resolved empty on a load — which could happen depending on load
  timing — every game collapsed into the same bucket and the auto-generated names (islands,
  deserts, ranges, taiga, jungle, water) re-rolled. The seed is now read through a fallback
  chain (`gameSeed`, then `startSeed`, then `mapSeed`) and the last good value is remembered
  for the session, so an intermittent empty read can no longer switch buckets and re-roll the
  names mid-game. Existing saves keep their current names: `gameSeed` is still tried first, so
  the store key is unchanged wherever it already resolved.

### Added
- **Named rivers.** The mod now labels rivers using the engine's own names. Because a river in
  Civ VII is an *edge*, its name (`getRiverName`) sits on any tile it touches, so the scan
  queries every tile rather than a single river-type class — grouping tiles by name into
  connected river systems and placing one label per system, angled along its course. Each
  system is tagged **navigable** (if any tile is a navigable river) or **minor**, driving two
  separate toggles. Names are composed through `Locale.compose` (the engine returns a
  localization key, not display text). River labels always lie **flat along the terrain** even
  when other labels face the camera, and they bypass overlap suppression so they aren't hidden
  by the region labels their course runs through.
- **Per-category show/hide.** Every label category is now an individual checkbox in the
  Options screen under **Geographic Labels** — continents, mountain ranges, deserts, taiga,
  jungle, islands, archipelagos, keys, natural wonders, lakes, seas, gulfs, bays, sounds,
  inlets, fjords, reefs, atolls, estuaries, and the two river kinds. All default to on;
  changes apply live while the map layer is enabled. Hidden categories are dropped before
  overlap resolution, so hiding one never crowds out a category you kept.

### Changed
- **Font size now follows a geographic-type hierarchy.** A label's size is tied to its feature
  type, not just its tile count, so the map reads consistently: continents and seas grandest,
  then gulfs/deserts/taiga/jungle, then islands/lakes/wonders, then mountains and coastal
  waters, then navigable rivers (small) and minor rivers (very small). Each type scales mildly
  within its own range, and all bounds live in one tunable table (`FONT_TIERS`).

## [1.1.1] - 2026-07-13

### Fixed
- **Units could not be selected anywhere on the map while the "Geographic Names" layer was
  enabled.** The layer created an unused `WorldUI` overlay group at priority `10`
  (`OVERLAY_PRIORITY.MAX_PRIORITY`, one above the engine's `CURSOR` overlay) and never drew
  into it; that empty max-priority group swallowed world input, so unit clicks were ignored
  until the layer was toggled off (or the mini-map lens/decoration panel was closed, which
  pops its input context and restores world input). The labels themselves are painted into a
  `WorldUI` sprite grid — the same call the base-game yields layer uses — so the overlay group
  was pure dead code. Removed it; labels render exactly as before, and the map stays clickable.

## [1.1.0] - 2026-07-10

### Added
- **Water & coastal labels.** The mod now names water features, not just land, across the whole
  `docs/water-labels-design.md` plan (everything except seamounts, which the engine doesn't model):
  - **Direct feature/terrain matches:** lakes (`isLake`/`TERRAIN_LAKE`) → "Lake X", reefs
    (`FEATURE_REEF`/`FEATURE_COLD_REEF`) → "X Reef", atolls (`FEATURE_ATOLL`) → "X Atoll".
  - **Derived:** estuaries (navigable-river mouths at the coast) → "X Estuary", using the engine's
    own river name where known; archipelagos / keys (clusters of nearby islands) → "X Archipelago"
    or "X Keys" for chains of tiny islands.
  - **Enclosure-classified basins:** a water basin's land-enclosure + size + shape pick "X Sea",
    "Gulf of X", "X Bay", "X Sound", "X Inlet", or "X Fjord". **Fjords are latitude-gated** to the
    polar/subpolar bands (|lat| ≥ 50°) and additionally require adjacent mountains; elsewhere a
    narrow basin becomes a Sound.
  - Names are flavored by the nearest civ where a pool exists (Lake Baikal near Russia, Lake
    Titiqaqa near the Inca, Norse fjords near the Normans) and generic otherwise. Named marine
    natural wonders (Great Barrier Reef, Great Blue Hole) stay with the wonder labeler.
  - The sea/gulf/bay/sound/inlet/fjord split is a geometric **heuristic** (the engine has no
    semantic tag for these); the thresholds in `ui/geo-labels-water.js` are tunable and want
    in-game calibration.

### Changed
- **Region labels drop a redundant generic when the name already carries its own geographic
  word.** Mountains: "Hindu Kush", "Tian Shan", "Tengri Tag", "Safed Koh", Sanskrit/Tamil ranges
  (`-parvata`, `-giri`, `-malai`, `-adri`), Hawaiian `Mauna` peaks, and self-complete ranges
  (Himalaya, Karakoram, Pamir, Aravalli, Siwalik) now render bare. Islands: Japanese `-shima`/
  `-jima` and Sanskrit/Dhivehi `-dvipa`/`-dwipa`/`-divu` names (all meaning "island") drop the
  "Isle of" prefix. Jungle: Thai `Dong …` and Sanskrit `-vana`/`-vanam`/`-aranya` (all meaning
  "forest") render bare. Deserts: "Sahra" (Arabic for desert) renders bare. Names without an
  embedded word keep their generic as before ("Atlas Mountains", "Isle of Sicilia", "Sahara
  Desert", "Blue Ridge Mountains").
- **More regions get labeled at a fuller volume.** Minimum sizes for a named region dropped
  (deserts 8→6, taiga 10→7, jungle 8→6, mountains 5→4 tiles), so smaller-but-real features now
  qualify.

### Fixed
- **Render-resource crash guard.** The layer now hard-caps how many labels/glyphs it paints into
  the sprite grid (`LABEL_BUDGET`, currently 300 labels / 6000 glyphs — a small slice of the
  engine's ~49,152 draw-resource-per-frame ceiling). The engine's UI renderer segfaults when a
  frame exceeds that ceiling across the *whole* UI (base-game unit flags/banners plus our labels);
  bounding our fixed per-frame footprint ensures this mod can never be the straw that overflows it,
  regardless of map size. Labels are dropped lowest-priority-first (`computeLabels` returns them
  most-important-first) and a truncation is logged. Covered by `tests/geo-labels-budget.test.mjs`.
- **Fragmented regions get identified and labeled.** A region broken by a single off-type tile
  (a mountain saddle, hill, or volcano for ranges; a river, oasis, or lone hill for biomes)
  was flood-filled into sub-threshold fragments that all got dropped. Region flood-fill now
  bridges one-tile gaps so the feature stays whole and clears its minimum size.

## [1.0.3] - 2026-07-10

### Fixed
- **Label names now stay consistent across save/reload.** Islands and continents were
  keyed on the engine's area id (`GameplayMap.getAreaId`), which the engine renumbers
  every time the map is rebuilt on load. A persisted name therefore failed to match its
  feature after reload and a fresh name was drawn, so island (and custom continent) names
  changed instance to instance. All label types are now keyed on a stable, geometry-derived
  anchor (the minimum linear tile index of the feature) — the same scheme the region labels
  already used. Wonder labels were already stable (keyed on the data-defined feature type).
- **Names no longer re-roll when switching between saved games.** Saving one game rebuilt
  the stored state from scratch and kept only that game, so loading a different game found
  its labels gone and regenerated them. Each game's labels are now preserved independently.
- **Desert names no longer lose out in overlap resolution.** The label-priority table keyed
  deserts as `desert` while their labels are keyed `deserts`, so a desert always resolved to
  the lowest priority and was hidden whenever it overlapped another label. Fixed the key.
- **Labels for features that cross the map's east/west wrap seam are placed correctly.**
  Centroid and orientation now use circular (wrap-aware) statistics, so a desert/mountain
  range/continent straddling the date line is labeled on the feature instead of the map's
  numeric middle.
- **Hardening:** the save-to-storage quota fallback now actually runs on an over-quota write
  (it was unreachable), and a corrupted store that parses to a non-object no longer throws.

### Notes
- One-time reset on first load after updating: because the key scheme changed, older stored
  names can't be mapped to the new keys, so they are cleared once. Auto-generated names
  regenerate deterministically and then stay fixed; any custom (manually renamed)
  island/continent names set before this update revert to auto names once.

## [1.0.2] - 2026-07-06

Code-quality and reliability release. No gameplay or visible-behavior changes — every
name, toggle, and option behaves exactly as in 1.0.0.

### Fixed
- **Packaging fix (would have broken the mod):** two internal modules split out during
  the refactor below (`geo-labels-map.js`, `geo-labels-compute.js`) were not listed in
  the mod manifest's imported files, so the game could not resolve them at load. Both are
  now shipped. Caught before release.

### Changed
- **Decomposed the monolith.** The single ~340-line label script is now split into
  focused, single-purpose modules — map scanning, label computation, formatting/geometry
  math, the toponym pools, and shared utilities — with the render layer down to ~170
  lines. Easier to reason about and far less regression-prone for future features.
- **Quieter shipped builds.** Debug logging is centralized behind one switch that the
  release build flips off automatically, so the retail mod stays silent.

### Internal (quality)
- Added an automated test suite and a one-command `verify` gate (lint + syntax check +
  tests) that the release script runs before it will build a package.
- Added ESLint with a checked-in config; the codebase is lint-clean.
- Added test-coverage reporting (c8) for visibility into what the tests exercise.
- Gave the map-observer lifecycle an explicit start/stop contract.

## [1.0.0] - 2026-07-06

First release — Civilization VI-style geographic names painted on the Civilization VII map.

### Added
- **Names on the map** for continents, islands, deserts, mountain ranges, taiga, and
  jungle, plus natural wonders. Off by default; toggle with the **Geographic Names**
  checkbox in the mini-map's Decorations list.
- **Period-accurate, per-civilization names.** Islands and regions draw from the
  nearest civilization's own curated pool of ~1,200 real, era-appropriate toponyms
  across all 30 civs — Latin for Rome, romanized Ancient Greek for Greece, Quechua
  for the Inca, Han-era Chinese for the Han, and so on — with a neutral pool for
  unclaimed land and de-duplication so names don't repeat. Each region carries a
  clarifier: *Isle of Creta*, *Zagrus Mountains*, *Libyca Desert*.
- **Organic re-flavoring across the ages.** Names persist per game; when a new
  civilization's heartland reaches a place it may take on that civ's names, while the
  frontier and distant lands keep their old names, so you can still tell which civ named each area.
- **Terrain-following labels** (Options → Mods): lay names flat on the map and rotate
  them to run along ranges, coastlines, and deserts, the way Civilization VI did.
- Priority-based collision handling, so a larger label (an island) overrides a smaller
  one (a desert or taiga) that would otherwise overlap it.

### Notes
- Additive and observer-based — no base UI files are replaced, so it coexists with
  other mods.
