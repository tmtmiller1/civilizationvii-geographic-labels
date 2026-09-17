#!/usr/bin/env bash
# install-dev.sh — deploy a STRICTLY LOCAL test copy of Geographic Labels under a
# separate mod id, so it can sit beside the Steam Workshop subscription without
# the game deduplicating the two. Disable the Workshop copy in Add-Ons while
# testing this one (both register the same lens layer).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODS="$HOME/Library/Application Support/Civilization VII/Mods"
DEST="$MODS/geographic-labels-dev"
[ -d "$MODS" ] || { echo "Civ VII Mods dir not found: $MODS" >&2; exit 1; }
rm -rf "$DEST"
mkdir -p "$DEST"
sed -e 's/<Mod id="tmt-geographic-labels"/<Mod id="tmt-geographic-labels-dev"/' \
    -e 's|<Name>LOC_MOD_GEO_LABELS_NAME</Name>|<Name>LOC_MOD_GEO_LABELS_DEV_NAME</Name>|' \
    -e 's|<Package>GeographicLabels</Package>|<Package>GeographicLabelsDev</Package>|' \
    "$HERE/geographic-labels.modinfo" > "$DEST/geographic-labels.modinfo"
cp -R "$HERE/ui" "$DEST/"
mkdir -p "$DEST/text/en_us"
# <Replace> upserts, so the dev copy's LOC rows no longer collide with the Workshop
# copy's identical <Row> inserts (UNIQUE constraint on LocalizedText.Language+Tag,
# which made content configuration validation fail and roll everything back).
sed -e 's|<Row Tag=|<Replace Tag=|g' -e 's|</Row>|</Replace>|g' \
    "$HERE/text/en_us/ModText.xml" > "$DEST/text/en_us/ModText.xml"
cp -R "$HERE/images" "$DEST/"
grep -q 'tmt-geographic-labels-dev' "$DEST/geographic-labels.modinfo" || { echo "modinfo id rewrite failed" >&2; exit 1; }
echo "installed -> $DEST  (mod id tmt-geographic-labels-dev)"
echo "NEXT: quit + relaunch Civ VII; in Add-Ons DISABLE 'Geographic Labels' (Workshop) and ENABLE"
echo "      'Geographic Labels (DEV: rename test)'; load a game; tick 'Geographic Names' in the"
echo "      mini-map Decorations list; click 'Rename Places…' beneath it."
