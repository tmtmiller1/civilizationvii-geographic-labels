import test from "node:test";
import assert from "node:assert/strict";

import { styleText } from "../ui/geo-labels-format.js";
import {
  firstForm, localFrame, localLabel, localPlace, nameTag, orderedFonts, placeTag, tagSlug,
} from "../ui/geo-labels-l10n.js";
import { composed, displayWidth, foldForSearch, isLetterOrDigit } from "../ui/geo-labels-text.js";

const NB = " ";

/** A stand-in for the engine's Locale over a tag table; an unknown tag comes back as itself, as in game. */
function withLocale(table, fn) {
  const prev = globalThis.Locale;
  globalThis.Locale = {
    compose: (tag, ...args) => (tag in table ? table[tag].replace(/\{1_Name\}/g, args[0]) : tag),
    getCurrentDisplayLocale: () => "en_US",
  };
  try { return fn(); } finally { globalThis.Locale = prev; }
}

test("tags: pool names map to stable ASCII tokens", () => {
  assert.equal(tagSlug("Xing'an"), "XING_AN");
  assert.equal(tagSlug("Rub al-Khali"), "RUB_AL_KHALI");
  assert.equal(tagSlug("Cerdeña"), "CERDENA");
  assert.equal(placeTag("Sicilia"), "LOC_GEO_PLACE_SICILIA");
  assert.equal(nameTag("islands", "Sicilia"), "LOC_GEO_NAME_ISLANDS_SICILIA");
});

test("labels: the display language's whole label wins, then its frame, then the English", () => {
  const ja = {
    LOC_GEO_NAME_ISLANDS_SICILIA: "シチリア島",
    LOC_GEO_PLACE_SICILIA: "シチリア",
    LOC_GEO_PLACE_ELBA: "エルバ",
    LOC_GEO_LABELS_FRAME_ISLANDS: "{1_Name}島",
    LOC_GEO_LABELS_FRAME_ESTUARIES: "{1_Name}河口",
  };
  withLocale(ja, () => {
    assert.equal(localLabel("islands", "Sicilia"), "シチリア島");
    assert.equal(localLabel("islands", "Elba"), "エルバ島"); // no whole label: the frame around the place name
    assert.equal(localPlace("Sicilia"), "シチリア");
    assert.equal(localFrame("estuaries", "ナイル川"), "ナイル川河口");
    assert.equal(localLabel("mountains", "Atlas"), "Atlas Mountains"); // nothing in this language: English
  });
  // No engine at all (tests, a script loaded early): the English frame.
  assert.equal(localLabel("gulfs", "Aden"), "Gulf of Aden");
  assert.equal(localLabel("mountains", "Hindu Kush"), "Hindu Kush");
});

test("labels: an engine name keeps only its first case form", () => {
  assert.equal(firstForm("Волга|Волги|Волге|Волгу|Волгой|Волге"), "Волга");
  assert.equal(firstForm("Nile"), "Nile");
  assert.equal(firstForm(null), null);
});

test("fonts: the display language's own face comes first", () => {
  assert.deepEqual(orderedFonts("en_US"), ["TitleFont", "TitleFont-SC", "TitleFont-TC", "TitleFont-JP", "TitleFont-KR"]);
  assert.equal(orderedFonts("ja_JP")[0], "TitleFont-JP");
  assert.equal(orderedFonts("ko_KR")[0], "TitleFont-KR");
  assert.equal(orderedFonts("zh_Hans_CN")[0], "TitleFont-SC");
  assert.equal(orderedFonts("zh_Hant_HK")[0], "TitleFont-TC");
  assert.equal(orderedFonts("ru_RU")[0], "TitleFont");
  assert.equal(orderedFonts("ja_JP").length, 5);
  assert.deepEqual([...orderedFonts("ja_JP")].sort(), [...orderedFonts("en_US")].sort());
});

test("styleText: letter-spaces every script, keeps accents on their letters", () => {
  assert.equal(styleText("Łódź"), ["Ł", "Ó", "D", "Ź"].join(NB));
  assert.equal(styleText("Волга"), ["В", "О", "Л", "Г", "А"].join(NB));
  assert.equal(styleText("シチリア島"), ["シ", "チ", "リ", "ア", "島"].join(NB));
  assert.equal(styleText("시칠리아섬"), ["시", "칠", "리", "아", "섬"].join(NB));
  // An accent typed as a separate mark is composed first, so it is never spaced off its letter.
  assert.equal(styleText("Málaga"), ["M", "Á", "L", "A", "G", "A"].join(NB));
  // Punctuation stays tight, as before.
  assert.equal(styleText("Xing'an"), `X${NB}I${NB}N${NB}G'A${NB}N`);
  assert.equal(styleText("Rub al-Khali").split(NB.repeat(4)).length, 2);
});

test("text: search folds case and accents; widths count wide script double", () => {
  assert.equal(foldForSearch("Łódź"), "lodz");
  assert.equal(foldForSearch("CERDEÑA"), "cerdena");
  assert.equal(foldForSearch("Волга"), "волга");
  assert.equal(foldForSearch("シチリア"), "シチリア");
  assert.equal(displayWidth("Elba"), 4);
  assert.equal(displayWidth("シチリア島"), 10);
  assert.equal(displayWidth("Málaga"), 6);
  assert.equal(composed("Málaga"), "Málaga");
  assert.ok(isLetterOrDigit("Ж") && isLetterOrDigit("島") && isLetterOrDigit("7"));
  assert.ok(!isLetterOrDigit("'") && !isLetterOrDigit("・") && !isLetterOrDigit("。"));
});
