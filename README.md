# Geographic Labels — Civilization VII

Brings back **Civ VI–style geographic names on the map**. Paints translucent labels for **continents**,
**islands**, and **natural wonders**, toggled with a **"Geographic Names"** checkbox next to *Yields* in the
mini-map lens menu.

## What it labels

| Feature | Name source |
| --- | --- |
| Continents | The game's own continent names (e.g. *Euramerica*, *Nena*) |
| Islands | Generated from a name pool, deterministic per game (seeded by the game seed, stable across save/reload) |
| Deserts | Region labels generated from nearest-civilization and neutral toponym pools |
| Mountain ranges | Region labels generated from nearest-civilization and neutral toponym pools |
| Taiga | Region labels generated from nearest-civilization and neutral toponym pools |
| Jungle | Region labels generated from nearest-civilization and neutral toponym pools |
| Rivers | The game's own river names (`getRiverName`), for both navigable rivers and minor rivers, laid along the river's course |
| Natural wonders | The game's own feature names (e.g. *Great Barrier Reef*, *Uluru*), floated just above the wonder |

Water and coastal features (lakes, seas, gulfs, bays, sounds, inlets, fjords, reefs, atolls,
estuaries, archipelagos, keys) are labeled too — see `docs/water-labels-design.md`.

## Choosing what you see

Every category above is an individual checkbox in the game's **Options** screen, under
**Geographic Labels** (reachable from the main menu and in-game). Untick any you don't want —
say, keep continents and rivers but hide the coastal-water flavor labels. Changes apply live
while the map layer is on. The master on/off is still the **Geographic Names** checkbox in the
mini-map's Decorations list.

## What counts as an "island"

An island is a landmass you **cannot reach from a large landmass without crossing open ocean**. The mod
flood-fills from every continent-scale landmass across land, lakes, and navigable rivers (but never ocean),
and labels only what that flood can't reach. So a peninsula split off by a river, or a chunk across a
strait of lake water, is treated as part of the continent (and takes the continent's name), while a true
sea-girt island gets its own name.

## Look

Soft translucent white, no outline, uppercase with airy letter-spacing, sized to the landmass, and kept
low-contrast so they don't obscure the terrain underneath. Small specks (< 3 tiles) are skipped to avoid clutter.

## Install

1. Copy the `geographic-labels` folder into your Civ VII **Mods** directory:
   - **macOS**: `~/Library/Application Support/Civilization VII/Mods/`
   - **Windows**: `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Mods\`
   (macOS users can run `./install.sh`.)
2. Launch Civ VII, enable **Geographic Labels** in *Add-Ons*.
3. In game, open the mini-map lens menu and tick **Geographic Names**.

## How it works (for modders)

- **`ui/geo-labels-layer.js`** — reads the map with the `GameplayMap` API, partitions land by `getAreaId`,
  classifies island vs. mainland by ocean-crossing flood-fill, assigns names, and renders via
  `WorldUI.SpriteGrid.addText` (the only text path that honors opacity + no outline). Registered as a
  `LensManager` lens layer.
- **`ui/geo-labels-toggle.js`** — injects the mini-map checkbox with a `MutationObserver` (no
  `ReplaceUIScript`), so it coexists with other UI mods.

## Compatibility

Additive and observer-based — no base UI files are replaced. Should coexist with other mods.

## Development Quality Gate

For this mod, quality is intentionally kept lightweight and practical:
- `npm run verify` (syntax + focused tests)
- release packaging checks in `release.sh`
- no-preview Steam upload fallback for reliable publishing

## License

MIT
