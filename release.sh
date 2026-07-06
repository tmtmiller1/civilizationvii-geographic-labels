#!/usr/bin/env bash
# release.sh: produce a clean, debug-disabled zip + Steam Workshop manifest for Geographic Labels.
#
# Usage:  ./release.sh
# Output: dist/tmt-geographic-labels-vX.Y.Z.zip   (X.Y.Z from geographic-labels.modinfo <Version>)
#         dist/preview.png                         (1024x1024 Workshop thumbnail, from docs/workshop-preview.svg)
#         dist/workshop_item.vdf                   (steamcmd manifest; publishedfileid from steam_workshop_id.txt)
#
# What it does: mirror the mod into dist/tmt-geographic-labels/ (dev cruft excluded), flip `const DBG = true`
# -> false so shipped builds are quiet, syntax-check, zip with the modinfo at the zip root, render the preview,
# and write the workshop manifest. No build/test toolchain — this mod is plain, readable JS.

set -euo pipefail
cd "$(dirname "$0")"

MODINFO="geographic-labels.modinfo"
MOD_DIR="tmt-geographic-labels"   # zip-root / content folder name (matches the mod id / deployed folder)
TITLE="Geographic Labels"
APPID="1295660"
DIST_DIR="dist"

[ -f "$MODINFO" ] || { echo "error: $MODINFO not found in $(pwd)"; exit 1; }

VERSION="$(grep -oE '<Version>[^<]+</Version>' "$MODINFO" | head -1 | sed -E 's|</?Version>||g')"
[ -n "$VERSION" ] || { echo "error: could not parse <Version> from $MODINFO"; exit 1; }
AUTHORS="$(grep -oE '<Authors>[^<]+</Authors>' "$MODINFO" | head -1 | sed -E 's|</?Authors>||g')"
case "$AUTHORS" in ""|"Your Name"|"TODO") echo "error: set <Authors> in $MODINFO before packaging."; exit 1;; esac
case "$VERSION" in *-dev|*-smoke|0.0.*) echo "error: <Version> '$VERSION' looks like a dev tag."; exit 1;; esac

# Steam publishedfileid (persisted outside dist/ so it survives `rm -rf dist`).
WORKSHOP_ID_FILE="steam_workshop_id.txt"
PUBLISHED_FILE_ID=""
[ -f "$WORKSHOP_ID_FILE" ] && PUBLISHED_FILE_ID="$(tr -dc '0-9' < "$WORKSHOP_ID_FILE")"

ZIP_NAME="${MOD_DIR}-v${VERSION}.zip"
TARGET_DIR="$DIST_DIR/$MOD_DIR"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

echo "==> Cleaning $DIST_DIR/"
rm -rf "$DIST_DIR"
mkdir -p "$TARGET_DIR"

echo "==> Mirroring → $TARGET_DIR/ (excluding dev cruft)"
rsync -a --exclude='.git' --exclude='.gitignore' --exclude='.DS_Store' --exclude='dist' \
    --exclude='release.sh' --exclude='install.sh' --exclude='*.bak' --exclude='node_modules' \
    --exclude='docs' --exclude='README.pdf' --exclude='steam_workshop_id.txt' \
    ./ "$TARGET_DIR"/

echo "==> Disabling debug logging (const DBG = true -> false) in dist JS"
find "$TARGET_DIR" -name '*.js' -type f -print0 | xargs -0 sed -i '' -E 's/^const DBG = true;/const DBG = false;/'

echo "==> Syntax-checking dist JS"
find "$TARGET_DIR" -name '*.js' -type f -print0 | xargs -0 -n1 node -c

echo "==> Verifying modinfo at zip root"
[ -f "$TARGET_DIR/$MODINFO" ] || { echo "error: $TARGET_DIR/$MODINFO missing"; exit 1; }

echo "==> Zipping $ZIP_PATH"
( cd "$DIST_DIR" && zip -qr "$ZIP_NAME" "$MOD_DIR" )

echo "==> Verifying zip contents against allow-list"
ALLOW="^${MOD_DIR}/(${MODINFO//./\\.}|README\\.md|LICENSE|CHANGELOG\\.md)$"
ALLOW="$ALLOW"'|^'"$MOD_DIR"'/ui/.+\.(js|html|css)$'
ALLOW="$ALLOW"'|^'"$MOD_DIR"'/images/.+\.(svg|png)$'
ALLOW="$ALLOW"'|^'"$MOD_DIR"'/text/[a-z_]+/ModText\.xml$'
UNEXPECTED="$(unzip -Z1 "$ZIP_PATH" | grep -vE '/$' | grep -vE "$ALLOW" || true)"
if [ -n "$UNEXPECTED" ]; then
    echo "error: zip contains entries not on the allow-list:"; echo "$UNEXPECTED" | sed 's/^/    /'
    echo "  → tighten rsync --exclude, or update ALLOW in release.sh if intended."; exit 1
fi
echo "    OK: every shipped entry matches the allow-list."
unzip -l "$ZIP_PATH" | head -25 || true

# ── Steam Workshop preview + manifest ─────────────────────────────────────
PREVIEW_SRC="docs/workshop-preview.svg"; [ -f "$PREVIEW_SRC" ] || PREVIEW_SRC="images/geo-labels-icon.svg"
PREVIEW_OUT="$DIST_DIR/preview.png"
if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w 1024 -h 1024 "$PREVIEW_SRC" -o "$PREVIEW_OUT"
    echo "==> Workshop preview rendered: $PREVIEW_OUT (from $(basename "$PREVIEW_SRC"))"
else
    echo "==> rsvg-convert not found; preview.png NOT generated (brew install librsvg)."
fi

ABS_CONTENT="$(cd "$TARGET_DIR" && pwd)"
ABS_PREVIEW=""; [ -f "$PREVIEW_OUT" ] && ABS_PREVIEW="$(cd "$DIST_DIR" && pwd)/preview.png"

# Change note: current version's CHANGELOG section rendered as a Steam BBCode list.
CHANGENOTE="v${VERSION} release."
VERSION_RE="$(printf '%s' "$VERSION" | sed -E 's/[][(){}.^$*+?|\\]/\\&/g')"
if [ -f CHANGELOG.md ]; then
    BULLETS="$(awk -v verre="$VERSION_RE" '
        function flush(){ if(cur!=""){print cur;cur=""} }
        $0 ~ ("^## \\[" verre "\\]"){ grab=1; next }
        grab && /^## /{ flush(); exit }
        !grab{ next }
        /^###/{ next }
        /^[[:space:]]*[-*][[:space:]]+/{ flush(); line=$0; sub(/^[[:space:]]*[-*][[:space:]]+/,"",line); cur=line; next }
        /^[[:space:]]*$/{ next }
        cur!=""{ line=$0; sub(/^[[:space:]]+/,"",line); cur=cur " " line }
        END{ flush() }
    ' CHANGELOG.md | sed -E 's/\*//g; s/`//g; s/^/[*]/' | tr '\n' ' ')"
    [ -n "$BULLETS" ] && CHANGENOTE="$(printf '[b]v%s[/b] [list]%s[/list]' "$VERSION" "$BULLETS" | sed -E 's/\\/\\\\/g; s/"/\\"/g')"
fi

write_vdf() {
    local out="$1" include_preview="$2"
    { echo '"workshopitem"'; echo '{'; echo "    \"appid\"          \"$APPID\""; } > "$out"
    [ -n "$PUBLISHED_FILE_ID" ] && echo "    \"publishedfileid\" \"$PUBLISHED_FILE_ID\"" >> "$out"
    echo "    \"contentfolder\"  \"$ABS_CONTENT\"" >> "$out"
    [ "$include_preview" = "yes" ] && [ -n "$ABS_PREVIEW" ] && echo "    \"previewfile\"    \"$ABS_PREVIEW\"" >> "$out"
    echo "    \"visibility\"     \"0\"" >> "$out"
    echo "    \"title\"          \"$TITLE\"" >> "$out"
    # "description" intentionally omitted so re-uploads preserve the Workshop page text.
    echo "    \"changenote\"     \"${CHANGENOTE}\"" >> "$out"
    echo '}' >> "$out"
}
write_vdf "$DIST_DIR/workshop_item.vdf" yes
write_vdf "$DIST_DIR/workshop_item_no_preview.vdf" no

echo ""
echo "✓ Release built:  $ZIP_PATH  ($(du -h "$ZIP_PATH" | cut -f1))"
echo "  Version: $VERSION   Authors: $AUTHORS"
if [ -n "$PUBLISHED_FILE_ID" ]; then
    echo "  UPDATE mode: publishedfileid $PUBLISHED_FILE_ID"
else
    echo "  NEW-ITEM mode: first upload will mint a publishedfileid — save it:"
    echo "     echo <publishedfileid> > steam_workshop_id.txt"
fi
echo ""
echo "── Upload (SteamCMD) ──"
echo "  ~/steamcmd/steamcmd.sh +login <steamLogin> +workshop_build_item $(cd "$DIST_DIR" && pwd)/workshop_item.vdf +quit"
echo "  (If the preview upload is denied: use workshop_item_no_preview.vdf instead.)"
