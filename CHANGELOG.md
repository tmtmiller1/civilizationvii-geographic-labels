# Changelog

All notable changes to the **Geographic Labels** mod for Civilization VII. Loosely
follows [Keep a Changelog](https://keepachangelog.com/) and Semantic Versioning.
The Steam Workshop change note for each release is generated from the matching
section below by `release.sh`.

## [Unreleased]

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
