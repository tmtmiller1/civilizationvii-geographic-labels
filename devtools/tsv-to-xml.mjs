// tsv-to-xml.mjs - build text/<folder>/PlaceText.xml from tab-separated "tag<TAB>text" lines:
//   node devtools/tsv-to-xml.mjs <folder> <file.tsv>...
// Rows come out in the English file's order; a tag missing from the input, or not in the English, is an error.
import fs from "node:fs";
import { LANGUAGES } from "./languages.mjs";

const [folder, ...files] = process.argv.slice(2);
const lang = LANGUAGES[folder];
if (!lang || !files.length) { console.error("usage: node devtools/tsv-to-xml.mjs <folder> <file.tsv>..."); process.exit(2); }

const en = [...fs.readFileSync("text/en_us/PlaceText.xml", "utf8").matchAll(/<Row Tag="([A-Z0-9_]+)">/g)].map((m) => m[1]);
const known = new Set(en);
const text = new Map();
const problems = [];
for (const f of files) {
  for (const [i, line] of fs.readFileSync(f, "utf8").split(/\r?\n/).entries()) {
    if (!line.trim() || line.startsWith("#")) continue;
    const tab = line.indexOf("\t");
    if (tab < 0) { problems.push(`${f}:${i + 1}: no tab`); continue; }
    const tag = line.slice(0, tab).trim();
    const value = line.slice(tab + 1).trim();
    if (!known.has(tag)) { problems.push(`${f}:${i + 1}: ${tag} is not an English tag`); continue; }
    if (!value) { problems.push(`${f}:${i + 1}: ${tag} is empty`); continue; }
    if (text.has(tag) && text.get(tag) !== value) problems.push(`${f}:${i + 1}: ${tag} given twice, differently`);
    text.set(tag, value);
  }
}
for (const tag of en) if (!text.has(tag)) problems.push(`${tag} missing`);
if (problems.length) {
  console.error(`${folder}: ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 200)) console.error("  - " + p);
  process.exit(1);
}
const esc = (s) => s.replace(/&(?!amp;|lt;|gt;)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xml = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<Database>",
  "    <LocalizedText>",
  ...en.map((tag) => `        <Replace Tag="${tag}" Language="${lang}"><Text>${esc(text.get(tag))}</Text></Replace>`),
  "    </LocalizedText>",
  "</Database>",
  "",
].join("\n");
fs.mkdirSync(`text/${folder}`, { recursive: true });
fs.writeFileSync(`text/${folder}/PlaceText.xml`, xml);
console.log(`wrote text/${folder}/PlaceText.xml: ${en.length} tags`);
