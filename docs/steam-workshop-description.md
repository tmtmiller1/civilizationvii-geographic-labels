[h1]Geographic Labels[/h1]

[b]Civilization VI–style geographic names, painted across the Civilization VII map.[/b]

Geographic Labels writes the names of the land back onto the map: continents, islands, deserts, mountain ranges, taiga, jungle, and natural wonders. The names are [b]period-accurate and drawn per civilization[/b] — the nearest civilization lends its own real, era-appropriate toponyms to nearby land, so a range beside Rome reads [i]Zagrus Mountains[/i], a desert near it [i]Libyca Desert[/i], and an island off Greece [i]Isle of Creta[/i]. As the ages turn and new civilizations rise, the map re-flavors organically, leaving layers of history visible across the world.

It is off by default and toggles with a single [b]Geographic Names[/b] checkbox in the mini-map's Decorations list, right next to [i]Yields[/i]. Inspired by the map labeling of Civilization VI.

[b]The Mod Includes:[/b]
[list]
[*]Names on the map for continents, islands, deserts, mountain ranges, taiga, and jungle, plus natural wonders — soft, translucent labels tuned to sit quietly on the map rather than shout over it.
[*]Period-accurate, per-civilization names: islands and regions draw from the nearest civilization's own curated pool of roughly 1,200 real, era-appropriate toponyms across all 30 civilizations — Latin for Rome, romanized Ancient Greek for Greece, Quechua for the Inca, Han-era Chinese for the Han, and so on.
[*]A neutral pool for unclaimed land and de-duplication so names never repeat, with each region carrying a natural clarifier: [i]Isle of Creta[/i], [i]Zagrus Mountains[/i], [i]Libyca Desert[/i].
[*]Organic re-flavoring across the ages: names persist per game, and when a new civilization's heartland reaches a place it may take on that civ's names, while the frontier and distant lands keep their older names — so the history of who held the land stays legible.
[*]Terrain-following labels (Options → Mods): lay the names flat on the map and rotate them to run along ranges, coastlines, and deserts, the way Civilization VI did, instead of upright labels that always face the camera.
[*]Priority-based collision handling, so a larger label (an island) overrides a smaller one (a desert or taiga) that would otherwise overlap it.
[*]Readable, un-minified source (plain JavaScript, no obfuscation).
[/list]

[b]What Counts As An Island:[/b]
[list]
[*]An island is land you cannot reach from a large landmass without crossing open ocean. The mod flood-fills from every continent-scale landmass across land, lakes, and navigable rivers — but never ocean — and names only what that flood cannot reach.
[*]So a peninsula split off by a river, or a chunk across a strait of lake water, is treated as part of the continent and takes its name, while a true sea-girt island gets its own. Tiny specks are skipped to avoid clutter.
[/list]

[b]What The Mod Does Not Do:[/b]
[list]
[*]It does not change gameplay balance.
[*]It does not alter opponent behavior.
[*]It does not overwrite base-game files.
[/list]

[b]Compatibility:[/b]
[list]
[*]Additive and observer-based — no base UI files are replaced (no ReplaceUIScript), so it coexists with other UI mods.
[*]The mini-map checkbox is injected with a MutationObserver and survives panel rebuilds.
[*]Per-save name storage.
[/list]

[b]Installation:[/b]
[list=1]
[*]Download or subscribe to the mod.
[*]Place the [b]tmt-geographic-labels[/b] folder in the Civilization VII Mods directory.
[*]Enable [b]Geographic Labels[/b] from Additional Content in-game.
[*]Open the mini-map lens menu and tick [b]Geographic Names[/b], next to Yields.
[/list]

[b]Languages:[/b] English.

[b]Source:[/b] Open source (MIT): https://github.com/tmtmiller1/civilizationvii-geographic-labels

[b]Credits:[/b]
[list]
[*]Firaxis and the Civilization modding community, for the game, its documentation, and the sample mods that made this possible.
[*]The many real-world atlases and gazetteers behind the period-accurate place names used to create this mod.
[*]Tower, for the Civilization VII implementation.
[/list]
