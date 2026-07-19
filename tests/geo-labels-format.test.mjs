import test from "node:test";
import assert from "node:assert/strict";

import { axisAngleDeg, frame, scaledFont, styleText } from "../ui/geo-labels-format.js";

test("frame adds biome/terrain suffixes", () => {
  assert.equal(frame("islands", "Creta"), "Isle of Creta");
  assert.equal(frame("deserts", "Libyca"), "Libyca Desert");
  assert.equal(frame("mountains", "Zagrus"), "Zagrus Mountains");
  assert.equal(frame("taiga", "Hercynia"), "Hercynia Taiga");
  assert.equal(frame("jungle", "Antisuyu"), "Antisuyu Jungle");
  assert.equal(frame("unknown", "Name"), "Name");
});

test("frame keeps the Mountains clarifier for bare range names", () => {
  assert.equal(frame("mountains", "Atlas"), "Atlas Mountains");
  assert.equal(frame("mountains", "Rocky"), "Rocky Mountains");
  assert.equal(frame("mountains", "Kunlun"), "Kunlun Mountains");
  // "ridge" stays clarified so real "... Mountains" names survive.
  assert.equal(frame("mountains", "Blue Ridge"), "Blue Ridge Mountains");
});

test("frame drops the clarifier for names that already read as a range", () => {
  // Embedded orographic words across languages.
  assert.equal(frame("mountains", "Hindu Kush"), "Hindu Kush");
  assert.equal(frame("mountains", "Hindukush"), "Hindukush");
  assert.equal(frame("mountains", "Tian Shan"), "Tian Shan");
  assert.equal(frame("mountains", "Tianshan"), "Tianshan");
  assert.equal(frame("mountains", "Tengri Tag"), "Tengri Tag");
  assert.equal(frame("mountains", "Safed Koh"), "Safed Koh");
  assert.equal(frame("mountains", "Lingaparvata"), "Lingaparvata");
  assert.equal(frame("mountains", "Nilagiri"), "Nilagiri");
  assert.equal(frame("mountains", "Anaimalai"), "Anaimalai");
  assert.equal(frame("mountains", "Sahyadri"), "Sahyadri");
  assert.equal(frame("mountains", "Mauna Kea"), "Mauna Kea");
  // Explicit exceptions that carry no matchable stem.
  assert.equal(frame("mountains", "Himalaya"), "Himalaya");
  assert.equal(frame("mountains", "Karakoram"), "Karakoram");
  assert.equal(frame("mountains", "Pamir"), "Pamir");
});

test("frame drops redundant generics for islands, jungle, and deserts", () => {
  // Islands: Japanese -shima/-jima, Sanskrit/Dhivehi -dvipa/-divu already mean island.
  assert.equal(frame("islands", "Sicilia"), "Isle of Sicilia");
  assert.equal(frame("islands", "Miyajima"), "Miyajima");
  assert.equal(frame("islands", "Oshima"), "Oshima");
  assert.equal(frame("islands", "Nagadvipa"), "Nagadvipa");
  assert.equal(frame("islands", "Maladivu"), "Maladivu");
  assert.equal(frame("islands", "Nainativu"), "Nainativu");
  assert.equal(frame("islands", "Lakadib"), "Lakadib");
  // Jungle: Thai "dong" and Sanskrit -vana/-vanam/-aranya already mean forest.
  assert.equal(frame("jungle", "Dong Yai"), "Dong Yai");
  assert.equal(frame("jungle", "Vrindavana"), "Vrindavana");
  assert.equal(frame("jungle", "Kadambavanam"), "Kadambavanam");
  assert.equal(frame("jungle", "Vindhyaranya"), "Vindhyaranya");
  // Deserts: "Sahra" already means desert; the separate "Sahara" keeps the generic.
  assert.equal(frame("deserts", "Sahra"), "Sahra");
  assert.equal(frame("deserts", "Sahara"), "Sahara Desert");
});

test("frame formats water features (lakes, reefs, atolls)", () => {
  assert.equal(frame("lakes", "Superior"), "Lake Superior");
  assert.equal(frame("lakes", "Titiqaqa"), "Lake Titiqaqa");
  assert.equal(frame("reefs", "Tubbataha"), "Tubbataha Reef");
  assert.equal(frame("atolls", "Bikini"), "Bikini Atoll");
});

test("frame formats basins, estuaries, and island groups", () => {
  assert.equal(frame("seas", "Sapphire"), "Sapphire Sea");
  assert.equal(frame("gulfs", "Coral"), "Gulf of Coral");
  assert.equal(frame("bays", "Crescent"), "Crescent Bay");
  assert.equal(frame("sounds", "Narrows"), "Narrows Sound");
  assert.equal(frame("inlets", "Cove"), "Cove Inlet");
  assert.equal(frame("fjords", "Sogne"), "Sogne Fjord");
  assert.equal(frame("estuaries", "Nile"), "Nile Estuary");
  assert.equal(frame("archipelagos", "Farne"), "Farne Archipelago");
  assert.equal(frame("keys", "Pelican"), "Pelican Keys");
});

test("styleText uppercases and inserts non-breaking spacing", () => {
  const out = styleText("abc def");
  assert.match(out, /^A/);
  assert.ok(out.includes("\u00a0"));
  assert.ok(out.includes("D"));
});

test("scaledFont is bounded and monotonic around normal sizes", () => {
  const small = scaledFont(2, 1.0);
  const medium = scaledFont(20, 1.0);
  const large = scaledFont(200, 1.0);
  assert.ok(small >= 5 && small <= 16);
  assert.ok(medium >= small);
  assert.ok(large >= medium);
  assert.ok(large <= 16);
});

test("axisAngleDeg returns stable orientation for a diagonal region", () => {
  const plots = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
    { x: 4, y: 4 },
  ];
  const deg = axisAngleDeg(plots);
  assert.ok(Number.isInteger(deg));
  assert.ok(deg >= -90 && deg <= 90);
});
