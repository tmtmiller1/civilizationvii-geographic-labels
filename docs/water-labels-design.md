# Water & coastal labels — design

Expanding Geographic Labels from land features (continents, islands, deserts,
taiga, jungle, mountains, wonders) to **water and coastal** features: lakes,
reefs, atolls, seas, gulfs, bays, sounds, inlets, fjords, estuaries,
archipelagos, keys, seamounts.

The engine does **not** model all of these equally. The wishlist splits into
three tiers by how the map data supports detection. This doc rates each,
specifies the detection method, and sequences the build so we ship the reliable
ones first and never emit a confidently-wrong label.

## Engine primitives available

Confirmed present in the shipped Civ VII data/API:

- **Terrain:** `TERRAIN_OCEAN`, `TERRAIN_COAST` (shallow), `TERRAIN_LAKE`,
  `TERRAIN_NAVIGABLE_RIVER` — via `GameplayMap.getTerrainType(x,y)`.
- **Water predicates:** `isWater`, `isLake`, `isNavigableRiver`, `isCoastalLand`,
  `isAdjacentToShallowWater`.
- **Features (`GameplayMap.getFeatureType` → `GameInfo.Features`):**
  `FEATURE_REEF`, `FEATURE_COLD_REEF`, `FEATURE_ATOLL`, `FEATURE_ICE`,
  `FEATURE_MANGROVE`, `FEATURE_MARSH`, `FEATURE_OASIS`, `FEATURE_SAGEBRUSH_STEPPE`,
  and named marine natural wonders (`FEATURE_BARRIER_REEF`, `FEATURE_GREAT_BLUE_HOLE`,
  `FEATURE_BERMUDA_TRIANGLE` — already caught by the existing wonder labeler).

The existing region pipeline (scan tiles → flood-fill into regions → keep those
≥ `min` → key on `anchorIndex` → name via `frame()`/name pools → overlap-suppress)
is type-agnostic. Every reliable water feature below is "cluster tiles of type X,"
i.e. mechanically identical to how deserts/mountains already work — so the
infrastructure cost is small; the work is name pools + a few detection passes.

## Feasibility tiers

### Tier 1 — direct from engine data (reliable, do first)

| Feature | Detection | Generic form | Reliability |
|---|---|---|---|
| **Lakes** | flood-fill `isLake` / `TERRAIN_LAKE` tiles | `Lake <X>` | high |
| **Reefs** | flood-fill `FEATURE_REEF` + `FEATURE_COLD_REEF` tiles | `<X> Reef` | high |
| **Atolls** | flood-fill `FEATURE_ATOLL` tiles | `<X> Atoll` | high |

These are exact feature/terrain matches — no geometry guessing. Small named-water
pools + one scan pass each. This is Phase 1.

### Tier 2 — derived, low-ambiguity (do second)

| Feature | Detection | Generic form | Reliability |
|---|---|---|---|
| **Estuaries** | `isNavigableRiver` mouth tile adjacent to `TERRAIN_COAST`/ocean | `<River> Estuary` | med-high |
| **Archipelagos** | ≥N small islands (existing island detection) within a proximity radius, grouped | `<X> Archipelago` | med-high |
| **Keys** | a chain of very small (1–2 tile) islands — a naming variant of archipelago, chosen by island size | `<X> Keys` | med |

Built on data we already compute (islands, navigable rivers). "Keys vs
Archipelago" is a size-based flavor choice on the same cluster.

### Tier 3 — geometric enclosure heuristics (do last; classification is fuzzy)

The engine has **no** semantic tag distinguishing sea/gulf/bay/sound/inlet/fjord —
they are all just water tiles. We infer them from a water region's **enclosure**
(fraction of its perimeter that is land) and **shape** (elongation, mouth width):

| Feature | Heuristic | Generic form |
|---|---|---|
| **Sea** | large water basin, mostly land-enclosed, not a lake | `<X> Sea` |
| **Gulf** | large indentation into land, wide mouth | `Gulf of <X>` |
| **Bay** | smaller indentation, moderate enclosure | `Bay of <X>` / `<X> Bay` |
| **Sound** | long, narrow water flanked by land on both long sides | `<X> Sound` |
| **Inlet** | small narrow intrusion into land | `<X> Inlet` |
| **Fjord** | narrow elongated inlet **with adjacent mountains**, high-latitude | `<X> Fjord` |

Detection of "an enclosed basin" is reliable; the **name we pick** for it is a
judgment call the engine can't confirm, so these will sometimes read as the
"wrong" word (a real gulf labeled a bay, etc.). Acceptable for flavor, but they
ship behind the Tier-1/2 wins and want in-game tuning of the thresholds.

### Tier 0 — recommend **drop**: seamounts

Civ VII models no underwater topography. A seamount that breaches the surface is
just an island (already labeled); a submerged one is indistinguishable from open
ocean. There is no data to detect a seamount, so I'd cut it rather than fake it.
(A far-from-land isolated `TERRAIN_COAST` tile in deep ocean is the only weak
proxy, and it's more likely a map artifact than a guyot — not worth a wrong label.)

## Shared implementation

1. **Scan pass** (`geo-labels-map.js scanMap`): alongside `mountainTiles` /
   `biomeTiles`, collect `lakeTiles`, and per-feature sets for reef/atoll (reuse
   the existing feature lookup already used for wonders). Gate reef/atoll on
   *non*-natural-wonder tiles so named marine wonders stay with the wonder labeler.
2. **Categories**: extend the `REGION_CATS`-style table with the new water types
   (source tile-set selector, `min`, `typeKey`). Reuse the existing gap-bridging
   flood-fill and `anchorIndex` keying unchanged.
3. **Naming** (`geo-labels-format.js frame`): add the new type formats. Note the
   mix of prefixes (`Lake `, `Gulf of `, `Bay of `) and suffixes (` Reef`,
   ` Atoll`, ` Sea`, ` Sound`, ` Estuary`, ` Archipelago`, ` Keys`, ` Fjord`).
   The redundant-generic suppression (`carriesOwnWord`) applies here too.
4. **Name pools** (`geo-labels-toponyms.js`): `GENERIC.<type>` for each (required —
   the picker's fallback is island names, wrong for water), plus civ-flavored
   pools for coastal civs where it adds character. Reef/atoll flavor leans
   tropical/Pacific civs; fjord/sound leans Norse/Norman.
5. **Overlap priority** (`geo-labels-compute.js suppressOverlaps`): slot the water
   types into the priority map. Proposed: seas ~ continents-adjacent (4), lakes/
   gulfs/bays 3, reefs/atolls/estuaries/sounds/inlets/fjords 2, matching their
   visual prominence. Keep `labelType()` prefix-matching in sync (the deserts
   `desert`→`deserts` key bug in BACKLOG.md is the cautionary precedent).
6. **Keys**: `lake:` / `reef:` / `atoll:` / `sea:` / `bay:` … prefixes on
   `anchorIndex`, so custom renames and save/reload persistence work as they do
   for land features.

## Phasing

- **Phase 1 — BUILT** — Lakes, Reefs, Atolls (Tier 1). Self-contained, reliable.
- **Phase 2 — BUILT** — Estuaries, Archipelagos, Keys (Tier 2). Estuaries use the engine river
  name (`getRiverName`) when present.
- **Phase 3 — BUILT** — Seas, Gulfs, Bays, Sounds, Inlets, Fjords (Tier 3 enclosure model), in
  `ui/geo-labels-water.js`. Fjords are latitude-gated (|lat| ≥ `FJORD_LAT_MIN`) and require
  adjacent mountains. **Thresholds are untuned against real maps** — the enclosure radius/min,
  the size buckets (`SEA_MIN`/`GULF_MIN`/`BAY_MIN`), and `ELONGATION_MIN` are all constants at
  the top of the module and want in-game calibration.
- **Dropped** — Seamounts (no engine support).

Each phase is independently shippable and reversible; nothing later blocks earlier.

### Known heuristic limitations (Phase 3)

- **Large open seas** whose interior is >`ENCLOSE_RADIUS` tiles from any land score below
  `ENCLOSE_MIN` and won't be captured as one basin — the enclosure field only "sees" water
  tucked near land. Clearly-enclosed seas (Mediterranean/Caspian-like) and all bays/gulfs/sounds/
  fjords/inlets detect well; a vast open sea may go unlabeled or only label its enclosed margins.
- **Sea-vs-gulf-vs-bay naming** is a size/shape guess and will sometimes pick the "wrong" word.
- Enclosure is **directional**, not a land fraction: surrounding land (in an x-wrapped box) is
  binned into six 60° sextants, and a tile is "enclosed" only if land sits on ≥4 sextants (bay/
  gulf/sea) or on two *opposite* sextants (channel → sound/fjord). This deliberately rejects a
  straight open coast (land fills only one ~180° arc ≈ 3 sextants), which a naive land-fraction
  test would have mislabeled as one giant sea around every continent. Still a box, not an exact
  hex disk — approximate at feature edges, and `ENCLOSE_RADIUS`/`SEXT_MIN_SAMPLES`/
  `ENCLOSE_MIN_SEXTANTS` want in-game tuning.
- **Navigable rivers are excluded from sea tiles**, so inland river fingers aren't read as
  enclosed sounds/inlets; they drive estuary detection at the coast instead.

## Open naming-convention questions (for tuning, not blocking Phase 1)

- Lakes: `Lake X` vs `X Lake`? (Doc assumes `Lake X`.)
- Bays/Gulfs: `Bay of X` vs `X Bay`? (Doc mixes per real-world convention.)
- How aggressively to flavor by civ vs. lean on generic pools for water types.
