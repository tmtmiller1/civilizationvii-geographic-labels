// geo-labels-i18n.test.mjs - every string a player sees can be translated.
//
// text/en_us is the source of truth (see text/README.md). This checks that every LOC_ key the code and modinfo use
// has English text, including the keys built at run time (place names, frames, the Rename Places type column); that
// the English place text is current with the name pools; that no tag is defined twice (a duplicate tag makes the
// game drop the whole file); and, for each translation folder, that it holds exactly the English tags, under the
// right Language, with the same {placeholders}, and is registered in the modinfo.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { LANGUAGES } from "../devtools/languages.mjs";
import { CATEGORIES } from "../ui/geo-labels-categories.js";
import { CIV_NAMES, GENERIC } from "../ui/geo-labels-toponyms.js";
import { frameTag, nameTag, placeTag } from "../ui/geo-labels-l10n.js";

const read = (p) => fs.readFileSync(p, "utf8");
const files = (dir, ext) => fs.readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));

/** Base-game keys the mod uses without defining. */
const BASE_KEYS = new Set(["LOC_MODULE_BASE_STANDARD_NAME", "LOC_UI_CONTENT_MGR_SUBTITLE",
  "LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION", "LOC_UI_MINI_MAP_YIELDS"]);

/** tag -> text, for every Row (English) or Replace (translation) in the given files. */
function textsIn(paths) {
  const out = new Map();
  const dups = [];
  for (const p of paths) {
    for (const m of read(p).matchAll(/<(?:Row|Replace)\s+Tag="([A-Z0-9_]+)"[^>]*>\s*<Text>([\s\S]*?)<\/Text>/g)) {
      if (out.has(m[1])) dups.push(m[1]);
      out.set(m[1], m[2]);
    }
  }
  return { texts: out, dups };
}

const english = textsIn(files("text/en_us", ".xml"));
const folders = fs.readdirSync("text", { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "en_us");

test("i18n: no English tag is defined twice", () => {
  assert.deepEqual(english.dups, []);
});

test("i18n: the English place text is current with the name pools", () => {
  execFileSync(process.execPath, ["devtools/gen-places.mjs", "--check"], { stdio: "pipe" });
});

test("i18n: every key the code and modinfo use has English text", () => {
  const missing = new Set();
  for (const p of [...files("ui", ".js"), "geographic-labels.modinfo"]) {
    // Comments name keys by pattern; only code counts.
    const body = read(p).replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    for (const m of body.matchAll(/LOC_[A-Z0-9_]*[A-Z0-9]/g)) {
      const key = m[0];
      if (BASE_KEYS.has(key) || english.texts.has(key)) continue;
      // Prefixes the code completes at run time; their keys are checked below.
      if (["LOC_GEO_PLACE", "LOC_GEO_NAME", "LOC_GEO_LABELS_FRAME", "LOC_GEO_LABELS_TYPE"].includes(key)) continue;
      missing.add(`${key} (${p})`);
    }
  }
  assert.deepEqual([...missing], []);
});

test("i18n: every pool name has a place tag and a label tag for each kind of place it names", () => {
  const missing = [];
  const pools = [...Object.values(CIV_NAMES), GENERIC];
  for (const byType of pools) {
    for (const [type, names] of Object.entries(byType)) {
      for (const n of names) {
        if (!english.texts.has(placeTag(n))) missing.push(placeTag(n));
        if (!english.texts.has(nameTag(type, n))) missing.push(nameTag(type, n));
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("i18n: every kind of place has a frame, and every category a Rename Places type", () => {
  const types = new Set([...Object.values(CIV_NAMES).flatMap((c) => Object.keys(c)), ...Object.keys(GENERIC)]);
  for (const t of types) assert.ok(english.texts.has(frameTag(t)), frameTag(t));
  // "park" is the National Parks mod's category; it supplies its own type name.
  for (const c of CATEGORIES.filter((x) => x.id !== "park")) {
    assert.ok(english.texts.has("LOC_GEO_LABELS_TYPE_" + c.id.toUpperCase()), "LOC_GEO_LABELS_TYPE_" + c.id.toUpperCase());
  }
  for (const [k, v] of english.texts) {
    if (k.startsWith("LOC_GEO_LABELS_FRAME_")) assert.equal(v.split("{1_Name}").length - 1, 1, `${k}: {1_Name} once`);
  }
});

const marks = (s) => [...s.matchAll(/\{[0-9]+_[A-Za-z]+[^}]*\}/g)].map((m) => m[0].replace(/:.*\}$/, "}")).sort();

test("i18n: each translation has exactly the English tags, its Language, and the same placeholders", () => {
  for (const d of folders) {
    const lang = LANGUAGES[d.name];
    assert.ok(lang, `text/${d.name}: not a folder the game knows (use one of ${Object.keys(LANGUAGES).join(", ")})`);
    const paths = files(path.join("text", d.name), ".xml");
    for (const p of paths) {
      for (const m of read(p).matchAll(/<Replace\s+Tag="[A-Z0-9_]+"\s+Language="([^"]+)"/g)) {
        assert.equal(m[1], lang, `${p}: Language="${m[1]}", expected "${lang}"`);
      }
      assert.ok(!/<Row\s+Tag=/.test(read(p)), `${p}: translations use <Replace Tag=... Language=...>, not <Row>`);
    }
    const { texts, dups } = textsIn(paths);
    assert.deepEqual(dups, [], `text/${d.name}: tags defined twice`);
    const want = [...english.texts.keys()].filter((k) => !texts.has(k));
    const extra = [...texts.keys()].filter((k) => !english.texts.has(k));
    assert.deepEqual({ missing: want.slice(0, 20), extra: extra.slice(0, 20) }, { missing: [], extra: [] }, `text/${d.name}`);
    for (const [k, v] of texts) {
      assert.deepEqual(marks(v), marks(english.texts.get(k)), `text/${d.name} ${k}: placeholders differ`);
      assert.ok(v.trim(), `text/${d.name} ${k}: empty`);
    }
  }
});

test("i18n: each translation is registered in the modinfo for the menu and the game", () => {
  const modinfo = read("geographic-labels.modinfo");
  for (const d of folders) {
    const lang = LANGUAGES[d.name];
    const count = (file) => modinfo.split(`<Item locale="${lang}">text/${d.name}/${file}</Item>`).length - 1;
    assert.equal(count("ModText.xml"), 2, `text/${d.name}/ModText.xml: register it in the shell and game groups`);
    assert.equal(count("PlaceText.xml"), 1, `text/${d.name}/PlaceText.xml: register it in the game group`);
  }
  for (const m of modinfo.matchAll(/<Item locale="([^"]+)">text\/([a-z_]+)\//g)) {
    assert.equal(LANGUAGES[m[2]], m[1], `modinfo: text/${m[2]} registered as ${m[1]}`);
  }
});
