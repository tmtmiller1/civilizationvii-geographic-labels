/**
 * Geographic Labels — text helpers that work in every script the game draws: accented Latin, Cyrillic, kana, kanji,
 * hanzi and Hangul. A leaf module (imports nothing), so the formatting and localization modules can share it.
 */

function safe(fn) {
  try {
    return fn();
  } catch (_e) {
    return undefined;
  }
}

const MARK = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-゙゚︯]/;

/** Composed form (NFC), so an accent typed as a separate mark sticks to its letter. */
export function composed(text) {
  const s = String(text);
  return safe(() => s.normalize("NFC")) || s;
}

export function stripMarks(text) {
  const s = String(text);
  const d = safe(() => s.normalize("NFD")) || s;
  return d.replace(new RegExp(MARK.source, "g"), "");
}

/** Search form: lower case without accents, so "malaga" finds "Málaga" and "lodz" finds "Łódź". */
export function foldForSearch(text) {
  return stripMarks(text).toLowerCase().replace(/ł/g, "l").replace(/ø/g, "o").replace(/đ/g, "d");
}

export function isMark(ch) {
  return MARK.test(ch);
}

// Kana, kanji/hanzi, Hangul and fullwidth forms, as [first, last] code points.
const WIDE = [[0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
  [0xa960, 0xa97f], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xff01, 0xff60], [0x20000, 0x3fffd]];

/** Kana, kanji/hanzi, Hangul and fullwidth forms: each draws about two Latin letters wide. */
export function isWide(ch) {
  const c = ch.codePointAt(0);
  return WIDE.some(([lo, hi]) => c >= lo && c <= hi);
}

/** A letter or digit in any script the game draws: cased letters (Latin, Cyrillic, Greek), digits, and wide script. */
export function isLetterOrDigit(ch) {
  if (/[0-9]/.test(ch)) return true;
  if (ch.toLowerCase() !== ch.toUpperCase()) return true;
  return isWide(ch) && !/[　-〿・！-／：-＠]/.test(ch);
}

/** Rough drawn width in Latin letters, for overlap reach: wide characters count two, marks none. */
export function displayWidth(text) {
  let n = 0;
  for (const ch of composed(text)) {
    if (/\s/.test(ch) || isMark(ch)) continue;
    n += isWide(ch) ? 2 : 1;
  }
  return n;
}
