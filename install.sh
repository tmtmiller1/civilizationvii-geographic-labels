#!/usr/bin/env bash
# install.sh — deploy Geographic Labels into the Civ VII Mods dir (macOS).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODS="$HOME/Library/Application Support/Civilization VII/Mods"
DEST="$MODS/tmt-geographic-labels"
[ -d "$MODS" ] || { echo "Civ VII Mods dir not found: $MODS" >&2; exit 1; }
rm -rf "$DEST"
mkdir -p "$DEST"
cp "$HERE/geographic-labels.modinfo" "$DEST/"
cp -R "$HERE/ui" "$DEST/"
cp -R "$HERE/text" "$DEST/"
echo "installed -> $DEST"
echo "NEXT: fully quit + relaunch Civ VII, enable 'Geographic Labels' in Add-Ons, save+reload, then"
echo "      open the mini-map lens menu and tick 'Geographic Names' (next to Yields)."
