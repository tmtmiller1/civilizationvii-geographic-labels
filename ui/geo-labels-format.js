/**
 * Pure formatting/math helpers used by the layer.
 */

const NBSP = String.fromCharCode(0xa0);

export function scaledFont(size, fontScale) {
  const f = (3 + 1.15 * Math.log(Math.max(2, size))) * fontScale;
  return Math.max(5, Math.min(16, Math.round(f * 10) / 10));
}

// Wrapped-map X helpers: the map wraps horizontally, so a region straddling the
// x=0/x=w-1 seam must use circular statistics, not a raw arithmetic mean, or its
// centroid/orientation lands on the wrong (numeric-middle) side of the map.
// When `w` is falsy the helpers fall back to plain (non-wrapped) arithmetic.
export function wrapDeltaX(a, b, w) {
  if (!w) return a - b;
  let d = (a - b) % w;
  if (d > w / 2) d -= w;
  else if (d < -w / 2) d += w;
  return d;
}

export function circularMeanX(plots, w) {
  if (!w) {
    let sx = 0;
    for (const p of plots) sx += p.x;
    return sx / plots.length;
  }
  const k = (2 * Math.PI) / w;
  let ss = 0;
  let sc = 0;
  for (const p of plots) {
    ss += Math.sin(p.x * k);
    sc += Math.cos(p.x * k);
  }
  return (((Math.atan2(ss, sc) / k) % w) + w) % w;
}

// Principal-axis orientation of a region (degrees), for laying a label along a range/desert in flat mode.
function covariance(plots, w) {
  const mx = circularMeanX(plots, w);
  let my = 0;
  for (const p of plots) my += p.y;
  my /= plots.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of plots) {
    const dx = wrapDeltaX(p.x, mx, w);
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  return { sxx, syy, sxy };
}

function normalizeAngle(deg) {
  if (deg > 90) return deg - 180;
  if (deg < -90) return deg + 180;
  return deg;
}

export function axisAngleDeg(plots, w) {
  if (!plots || plots.length < 4) return 0;
  const { sxx, syy, sxy } = covariance(plots, w);
  const raw = (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI;
  return Math.round(normalizeAngle(raw));
}

export function styleText(s) {
  const up = String(s).toUpperCase();
  const wordGap = NBSP + NBSP + NBSP + NBSP;
  return up
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/([A-Z0-9])(?=[A-Z0-9])/g, "$1" + NBSP))
    .join(wordGap);
}

// Some toponyms already carry their own geographic word (often in the source
// language), so bolting the English generic on top reads redundantly — e.g.
// "Hindu Kush Mountains", "Isle of Miyajima" (…-island), "Dong Yai Jungle"
// (dong = forest). For those we render the bare name; everything else keeps the
// generic, which is the safe default ("Atlas Mountains", "Isle of Sicilia").

// Names with no matchable word-stem that still shouldn't take a generic.
const NO_GENERIC_EXACT = {
  mountains: new Set(["himalaya", "himavat", "karakoram", "pamir", "aravalli", "siwalik"]),
};

// Geographic word-stems embedded in a name, matched against the whole
// lowercased name. Only categories with real offenders are listed.
const EMBEDDED_WORD = {
  // kush, -shan, tag, koh; Sanskrit -parvata/-giri/-adri, Tamil -malai;
  // Hawaiian mauna; European range words. "ridge" is excluded so
  // "Blue Ridge Mountains" stays intact.
  mountains: /(?:kush|shan\b|\btag\b|\bkoh\b|parvata|giri\b|malai\b|adri\b|sierra|cordillera|\brange\b|mauna\b)/i,
  // Arabic sahra = "desert" (distinct from the separate, correct "Sahara").
  deserts: /(?:sahra\b)/i,
  // Thai/Isan "dong" = forest; Sanskrit -vana/-vanam/-aranya = forest.
  jungle: /(?:\bdong\b|vana\b|vanam\b|aranya\b)/i,
  // Japanese -shima/-jima, Sanskrit -dvipa/-dwipa, Tamil -tivu, Dhivehi
  // -divu/-dib — all meaning "island".
  islands: /(?:shima\b|jima\b|dvipa\b|dwipa\b|divu\b|tivu\b|dib\b)/i,
};

const GENERIC_SUFFIX = {
  deserts: " Desert",
  mountains: " Mountains",
  taiga: " Taiga",
  jungle: " Jungle",
  reefs: " Reef",
  atolls: " Atoll",
  seas: " Sea",
  bays: " Bay",
  sounds: " Sound",
  inlets: " Inlet",
  fjords: " Fjord",
  rivers: " River",
  estuaries: " Estuary",
  archipelagos: " Archipelago",
  keys: " Keys",
};

const GENERIC_PREFIX = {
  islands: "Isle of ",
  lakes: "Lake ",
  gulfs: "Gulf of ",
};

// True when the category's generic would be redundant because the name already
// reads as one of those features.
function carriesOwnWord(typeKey, name) {
  const n = String(name).trim().toLowerCase();
  const exact = NO_GENERIC_EXACT[typeKey];
  if (exact && exact.has(n)) return true;
  const re = EMBEDDED_WORD[typeKey];
  return !!(re && re.test(n));
}

export function frame(typeKey, name) {
  if (carriesOwnWord(typeKey, name)) return name;
  const prefix = GENERIC_PREFIX[typeKey];
  if (prefix) return prefix + name;
  const suffix = GENERIC_SUFFIX[typeKey];
  return suffix ? name + suffix : name;
}
