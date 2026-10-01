/**
 * Geographic Labels — the displayed text of a label, in the game's language.
 *
 * Generated names are stored as their pool stems ("Sicilia", "Adriatic"), which stay the same in every language, so a
 * save keeps its names when the player switches language and only the display changes. A stem is shown through
 * LOC_GEO_NAME_<TYPE>_<NAME>, the whole label ("Isle of Sicilia"), and named on its own through LOC_GEO_PLACE_<NAME>.
 * A name with no tag (an engine river at an estuary) gets the language's LOC_GEO_LABELS_FRAME_<TYPE>, and failing
 * that the English frame. Text files: text/<language>/ModText.xml and PlaceText.xml (see text/README.md).
 *
 * Also here: the label font order for the display language.
 */

import { carriesOwnWord, frame } from "./geo-labels-format.js";
import { stripMarks } from "./geo-labels-text.js";

function safe(fn) {
  try {
    return fn();
  } catch (_e) {
    return undefined;
  }
}

/** The tag token for a pool name: accents dropped, upper case, runs of anything else as one underscore. */
export function tagSlug(name) {
  return stripMarks(String(name)).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function placeTag(name) {
  return "LOC_GEO_PLACE_" + tagSlug(name);
}

export function nameTag(typeKey, name) {
  return "LOC_GEO_NAME_" + String(typeKey).toUpperCase() + "_" + tagSlug(name);
}

export function frameTag(typeKey) {
  return "LOC_GEO_LABELS_FRAME_" + String(typeKey).toUpperCase();
}

/**
 * Compose `tag` with `args`, or `fallback` when the tag has no text in this language (the engine hands the tag back)
 * or there is no engine at all (tests).
 */
export function loc(tag, fallback, ...args) {
  const s = safe(() => Locale.compose(tag, ...args));
  return typeof s === "string" && s && s !== tag ? s : fallback;
}

/** The first form of an engine name. de/pl/ru names carry their case forms ("Волга|Волги|Волге|…"). */
export function firstForm(text) {
  if (typeof text !== "string") return text;
  const i = text.indexOf("|");
  return i < 0 ? text : text.slice(0, i).trim();
}

/** A pool name on its own, in the display language. */
export function localPlace(name) {
  if (!name) return name;
  return loc(placeTag(name), name);
}

/** A name framed for its kind of place ("{1_Name} Desert"), for names that have no label tag of their own. */
export function localFrame(typeKey, name) {
  if (carriesOwnWord(typeKey, name)) return name;
  return loc(frameTag(typeKey), frame(typeKey, name), name);
}

/** The label for a pool name on a `typeKey` place, in the display language. */
export function localLabel(typeKey, name) {
  return loc(nameTag(typeKey, name), null) || localFrame(typeKey, localPlace(name));
}

// --- fonts ----------------------------------------------------------------------------------------

export const LABEL_FONTS = ["TitleFont", "TitleFont-SC", "TitleFont-TC", "TitleFont-JP", "TitleFont-KR"];
const LEAD_FONT = { zh_Hans_CN: 1, zh_Hant_HK: 2, ja_JP: 3, ko_KR: 4 };

/**
 * The label fonts with the display language's own face first, as the game orders its title fonts
 * (global-scaling.js). Chinese, Japanese and Korean share code points with different glyph shapes, so the first face
 * that has a character decides how it looks: a Japanese label drawn SC-first comes out with Chinese forms.
 */
export function orderedFonts(locale = safe(() => Locale.getCurrentDisplayLocale())) {
  const fonts = LABEL_FONTS.slice();
  const i = LEAD_FONT[locale] || 0;
  [fonts[0], fonts[i]] = [fonts[i], fonts[0]];
  return fonts;
}
