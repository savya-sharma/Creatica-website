import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

// Original Diwali illustrations for Creatica Crown, drawn as code (SVG) and
// rendered to transparent PNG masters with sharp. Deterministic: the same
// seed always draws the same art, so it can be tuned here and regenerated.
//
//   node scripts/festival-art/diwali-art.mjs
//
// Writes the masters to assets-src/festivals/diwali/ (and the SVG sources
// next to them); then `node scripts/optimize-festival-assets.mjs` checks them
// and writes the web versions. Only objects are drawn - no glow, light or
// motion beyond a flame's own soft halo; those are added in code.

const OUT = path.resolve("assets-src/festivals/diwali");

// the palette (assets-src/festivals/diwali/README.md)
const C = {
  gold: "#C9A227",
  goldHi: "#E8C766",
  goldLo: "#8A6A12",
  vermilion: "#E34234",
  red: "#8E1B1B",
  teal: "#0F5A5E",
  tealHi: "#1E7F82",
  tealLo: "#093A3E",
  saffron: "#F4A300",
  marigold: "#FF9933",
  magenta: "#C2185B",
  chalk: "#F3EAD3",
  leaf: "#2F6B3A",
  leafLo: "#1E4A28",
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => +n.toFixed(2);
const polar = (r, deg) => [f(r * Math.sin((deg * Math.PI) / 180)), f(-r * Math.cos((deg * Math.PI) / 180))];
// repeat a shape (drawn pointing "up", centred at 0,0) n times around the centre
const ring = (n, body, offset = 0) =>
  Array.from({ length: n }, (_, i) => `<g transform="rotate(${f(offset + (360 / n) * i)})">${body}</g>`).join("");

const svg = (w, h, defs, body, viewBox = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}"><defs>${defs}</defs>${body}</svg>`;

const linear = (id, stops, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
const radial = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</radialGradient>`;

// a rounded lotus petal: broad, with a soft point
function lotus(r0, r1, w) {
  const h = r1 - r0;
  return `M${-w * 0.55},${-r0} C${-w * 1.25},${-r0 - h * 0.45} ${-w * 0.6},${-r1 + h * 0.08} 0,${-r1} C${w * 0.6},${-r1 + h * 0.08} ${w * 1.25},${-r0 - h * 0.45} ${w * 0.55},${-r0} Z`;
}

// ---------------------------------------------------------------------------
// shared: a marigold seen from above
// ---------------------------------------------------------------------------
// a ruffled petal pointing up, for the flower seen from above
function ruffledPetal(len, w, rand) {
  const wob = () => f((rand() - 0.5) * w * 0.25);
  return `M0,0 C${-w},${f(-len * 0.25)} ${f(-w * 1.05)},${f(-len * 0.78)} ${f(-w * 0.6)},${f(-len * 0.95)} Q${f(-w * 0.3)},${f(-len + Number(wob()))} 0,${f(-len * 0.97)} Q${f(w * 0.3)},${f(-len + Number(wob()))} ${f(w * 0.6)},${f(-len * 0.95)} C${f(w * 1.05)},${f(-len * 0.78)} ${w},${f(-len * 0.25)} 0,0 Z`;
}

const ORANGE = ["#A83F08", "#C9530A", "#E0690E", C.marigold, "#FFA53A", "#FFB84A", "#FFC95E", "#FFD978"];

function marigoldTop(cx, cy, r, rand, tones = ORANGE) {
  const out = [`<g transform="translate(${cx} ${cy}) scale(1 0.88) translate(${-cx} ${-cy})">`];
  for (let ringI = 0; ringI < 8; ringI++) {
    const len = r * (1 - ringI * 0.115) * (0.94 + rand() * 0.08);
    const n = Math.round(20 + (7 - ringI) * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 360 + ringI * 13 + (rand() - 0.5) * 14;
      const l = len * (0.9 + rand() * 0.14);
      out.push(
        `<path d="${ruffledPetal(l, l * (0.2 + rand() * 0.06), rand)}" transform="translate(${cx} ${cy}) rotate(${f(a)})" fill="${tones[ringI]}" stroke="${tones[Math.max(0, ringI - 2)]}" stroke-width="${f(r * 0.006)}" stroke-opacity="0.7"/>`,
      );
    }
  }
  out.push("</g>");
  // the heart: a golden disc with fine radial florets, a dark eye
  out.push(`<circle cx="${cx}" cy="${cy}" r="${f(r * 0.17)}" fill="#F2A21C"/>`);
  out.push(`<circle cx="${cx}" cy="${cy}" r="${f(r * 0.12)}" fill="#FFC64A"/>`);
  for (let i = 0; i < 18; i++) {
    const [x0, y0] = polar(r * 0.05, i * 20);
    const [x1, y1] = polar(r * 0.15, i * 20 + (rand() - 0.5) * 8);
    out.push(`<line x1="${f(cx + x0)}" y1="${f(cy + y0)}" x2="${f(cx + x1)}" y2="${f(cy + y1)}" stroke="#B5620A" stroke-width="${f(r * 0.012)}" stroke-linecap="round" opacity="0.8"/>`);
  }
  for (let i = 0; i < 10; i++) {
    const [x, y] = polar(r * 0.06 * rand(), rand() * 360);
    out.push(`<circle cx="${f(cx + x)}" cy="${f(cy + y)}" r="${f(r * 0.02)}" fill="#7A3A06"/>`);
  }
  return out.join("");
}

// a mango leaf with veins, pointing along `angle`
function mangoLeaf(cx, cy, len, angle) {
  const w = len * 0.2;
  const veins = Array.from({ length: 6 }, (_, i) => {
    const t = 0.14 + i * 0.1;
    const reach = w * 0.62 * Math.sin(Math.PI * Math.min(1, t + 0.15));
    return `M0,${f(-len * t)} L${f(reach)},${f(-len * (t + 0.07))} M0,${f(-len * t)} L${f(-reach)},${f(-len * (t + 0.07))}`;
  }).join(" ");
  return (
    `<g transform="translate(${cx} ${cy}) rotate(${angle})">` +
    `<path d="M0,0 C${f(w * 1.3)},${f(-len * 0.25)} ${f(w * 0.9)},${f(-len * 0.8)} 0,${-len} C${f(-w * 0.9)},${f(-len * 0.8)} ${f(-w * 1.3)},${f(-len * 0.25)} 0,0 Z" fill="url(#leaf)" stroke="${C.leafLo}" stroke-width="2"/>` +
    `<path d="M0,0 L0,${f(-len * 0.96)}" stroke="#9CC27A" stroke-width="2.2"/>` +
    `<path d="${veins}" stroke="#7FA85E" stroke-width="1.4" opacity="0.8"/></g>`
  );
}

// ---------------------------------------------------------------------------
// 2. the diya, with its flame
// ---------------------------------------------------------------------------
// the flame's centre in the 1200x900 canvas - also the code glow's anchor
export const DIYA_FLAME = { x: 950, y: 236 };

function diya() {
  const defs = [
    linear("clay", [[0, "#D06A35"], [0.55, "#A5441C"], [1, "#6E2810"]]),
    linear("clayFoot", [[0, "#B5532A"], [1, "#5E220E"]]),
    radial("oil", [[0, "#5A2C0C"], [0.7, "#2A1206"], [1, "#160903"]]),
    linear("dGold", [[0, C.goldHi], [0.5, C.gold], [1, C.goldLo]]),
    radial("flameOuter", [[0, "#FFE9A8"], [0.45, C.saffron], [0.85, C.vermilion], [1, C.vermilion, 0]], 0.5, 0.72, 0.6),
    radial("flameCore", [[0, "#FFFFFF"], [0.5, "#FFF6D6"], [1, "#FFE08A", 0]], 0.5, 0.7, 0.55),
    radial("halo", [[0, "#FFD27A", 0.42], [0.55, "#FFB347", 0.14], [1, "#FFB347", 0]]),
    linear("shade", [[0, "#000000", 0], [0.55, "#000000", 0.05], [1, "#000000", 0.32]], 1, 0),
    `<clipPath id="body"><path d="M262,472 C272,612 418,706 600,706 C782,706 918,612 932,472 Z"/></clipPath>`,
  ].join("");
  const b = [];
  // pedestal foot
  b.push(`<path d="M520,690 C520,740 470,760 452,790 L748,790 C730,760 680,740 680,690 Z" fill="url(#clayFoot)"/>`);
  b.push(`<rect x="448" y="784" width="304" height="22" rx="10" fill="url(#dGold)"/>`);
  b.push(`<path d="M478,760 L722,760" stroke="${C.goldHi}" stroke-width="5" opacity="0.8"/>`);
  // the bowl
  b.push(`<path d="M262,472 C272,612 418,706 600,706 C782,706 918,612 932,472 Z" fill="url(#clay)"/>`);
  // painted bands, clipped to the bowl
  const band = (y, curve) => `M240,${y} Q600,${y + curve} 960,${y}`;
  const deco = [];
  deco.push(`<path d="${band(520, 120)}" fill="none" stroke="url(#dGold)" stroke-width="20"/>`);
  deco.push(`<path d="${band(560, 120)}" fill="none" stroke="${C.vermilion}" stroke-width="16"/>`);
  deco.push(`<path d="${band(600, 110)}" fill="none" stroke="${C.teal}" stroke-width="22"/>`);
  deco.push(`<path d="${band(636, 100)}" fill="none" stroke="url(#dGold)" stroke-width="8"/>`);
  // dots and scallops along the bands (sampled on the curve)
  const onCurve = (y, curve, t) => {
    const x = 240 + 720 * t;
    const yy = y + 2 * (1 - t) * t * curve;
    return [f(x), f(yy)];
  };
  for (let i = 1; i < 24; i++) {
    const [x, y] = onCurve(520, 120, i / 24);
    deco.push(`<circle cx="${x}" cy="${y}" r="5" fill="${C.red}"/>`);
    const [sx, sy] = onCurve(560, 120, (i - 0.5) / 24);
    deco.push(`<path d="M${sx - 13},${sy - 4} Q${sx},${sy + 16} ${sx + 13},${sy - 4}" fill="none" stroke="${C.chalk}" stroke-width="3"/>`);
    const [tx, ty] = onCurve(600, 110, i / 24);
    deco.push(`<path d="M${tx - 11},${ty + 8} L${tx},${ty - 9} L${tx + 11},${ty + 8} Z" fill="${C.goldHi}"/>`);
  }
  // a lotus painted on the front
  deco.push(
    `<g transform="translate(600 664) scale(0.42)">${ring(8, `<path d="${lotus(10, 70, 22)}" fill="${C.saffron}" stroke="${C.gold}" stroke-width="4"/>`)}<circle r="14" fill="${C.vermilion}"/></g>`,
  );
  // volume: light from the upper left, shade to the right, a glaze highlight
  deco.push(`<rect x="240" y="440" width="720" height="300" fill="url(#shade)"/>`);
  deco.push(`<path d="M318,512 Q336,610 430,670" fill="none" stroke="#FFF1D6" stroke-width="16" stroke-linecap="round" opacity="0.18"/>`);
  b.push(`<g clip-path="url(#body)">${deco.join("")}</g>`);
  // the spout, pinched toward the wick on the right
  b.push(`<path d="M846,440 C900,414 940,380 958,352 C960,392 944,438 912,482 Z" fill="url(#clay)"/>`);
  b.push(`<path d="M856,446 C904,420 936,392 952,366" fill="none" stroke="${C.goldHi}" stroke-width="5" stroke-linecap="round"/>`);
  // the rim and the oil
  b.push(`<ellipse cx="597" cy="470" rx="336" ry="74" fill="url(#dGold)"/>`);
  b.push(`<ellipse cx="597" cy="470" rx="316" ry="60" fill="url(#oil)"/>`);
  b.push(`<path d="M380,452 Q597,418 812,452" fill="none" stroke="#FFE7B0" stroke-width="6" opacity="0.35" stroke-linecap="round"/>`);
  b.push(`<ellipse cx="597" cy="470" rx="336" ry="74" fill="none" stroke="${C.goldLo}" stroke-width="3"/>`);
  // the wick, resting in the spout
  b.push(`<path d="M934,372 Q944,356 948,334" fill="none" stroke="#3B2410" stroke-width="9" stroke-linecap="round"/>`);
  // the flame: a restrained halo, then layered tongues of fire
  const { x, y } = DIYA_FLAME;
  b.push(`<ellipse cx="${x}" cy="${y + 20}" rx="150" ry="170" fill="url(#halo)"/>`);
  b.push(`<path d="M${x},${y - 150} C${x + 66},${y - 60} ${x + 58},${y + 70} ${x + 4},${y + 104} C${x - 54},${y + 70} ${x - 60},${y - 30} ${x},${y - 150} Z" fill="url(#flameOuter)"/>`);
  b.push(`<path d="M${x + 2},${y - 92} C${x + 34},${y - 30} ${x + 30},${y + 52} ${x + 2},${y + 82} C${x - 28},${y + 52} ${x - 30},${y - 10} ${x + 2},${y - 92} Z" fill="url(#flameCore)"/>`);
  return svg(1200, 900, defs, b.join(""));
}

// ---------------------------------------------------------------------------
// 3. a hanging lantern: a pagoda-roofed, hexagonal iron lantern with lit
//    paper panels, on a rod, with a long tassel
// ---------------------------------------------------------------------------

// a pagoda roof seen from the front, symmetric about cx: ridge half-width
// `top` at y0, swept concave down to eaves half-width `eave` at y1, the tips
// flicked up by `curl`, `depth` thick at the eaves
function pagodaRoof(cx, y0, top, eave, y1, curl, depth) {
  const L = (x) => f(cx - x);
  const R = (x) => f(cx + x);
  const span = eave - top;
  const outline =
    `M${L(top)},${y0} L${R(top)},${y0} ` +
    `C${R(top + span * 0.12)},${f(y0 + (y1 - y0) * 0.72)} ${R(eave - span * 0.32)},${f(y1 + depth * 0.2)} ${R(eave)},${f(y1 - curl)} ` +
    `Q${R(eave + 6)},${f(y1 - curl - 10)} ${R(eave + 14)},${f(y1 - curl - 18)} ` +
    `C${R(eave - span * 0.04)},${f(y1 + depth * 0.4)} ${R(eave - span * 0.3)},${f(y1 + depth)} ${R(eave * 0.55)},${f(y1 + depth)} ` +
    `L${L(eave * 0.55)},${f(y1 + depth)} ` +
    `C${L(eave - span * 0.3)},${f(y1 + depth)} ${L(eave - span * 0.04)},${f(y1 + depth * 0.4)} ${L(eave + 14)},${f(y1 - curl - 18)} ` +
    `Q${L(eave + 6)},${f(y1 - curl - 10)} ${L(eave)},${f(y1 - curl)} ` +
    `C${L(eave - span * 0.32)},${f(y1 + depth * 0.2)} ${L(top + span * 0.12)},${f(y0 + (y1 - y0) * 0.72)} ${L(top)},${y0} Z`;
  return outline;
}

function lantern() {
  const rand = rng(41);
  const cx = 450;
  const defs = [
    linear("iron", [[0, "#5A5149"], [0.35, "#332D28"], [1, "#16130F"]]),
    linear("ironSide", [[0, "#17140F"], [0.5, "#3D362F"], [1, "#17140F"]], 1, 0),
    radial("paper", [[0, "#FFF7E4"], [0.4, "#FBE6BA"], [0.8, "#EDBE7E"], [1, "#D49A57"]], 0.5, 0.42, 0.62),
    linear("paperL", [[0, "#B07238"], [1, "#E8BC7C"]], 1, 0),
    linear("paperR", [[0, "#E8BC7C"], [1, "#B07238"]], 1, 0),
    linear("band", [[0, "#F6D9A4"], [1, "#E2A962"]]),
    linear("brass", [[0, C.goldHi], [0.5, C.gold], [1, C.goldLo]], 1, 0),
    linear("tassel", [[0, "#1F3550"], [0.5, "#16263C"], [1, "#0C1626"]], 1, 0),
    `<clipPath id="mainRoof"><path d="${pagodaRoof(cx, 716, 150, 352, 842, 52, 34)}"/></clipPath>`,
    `<clipPath id="capRoof"><path d="${pagodaRoof(cx, 566, 64, 214, 648, 30, 22)}"/></clipPath>`,
  ].join("");
  const b = [];

  // the rod it hangs from (runs off the top edge), with a joint ring
  b.push(`<rect x="443" y="0" width="14" height="452" fill="url(#ironSide)"/>`);
  b.push(`<rect x="434" y="300" width="32" height="14" rx="5" fill="url(#iron)"/>`);
  b.push(`<ellipse cx="${cx}" cy="470" rx="22" ry="24" fill="none" stroke="#2A2520" stroke-width="10"/>`);
  // finial: a bud on stacked discs
  b.push(`<path d="M${cx},484 C470,500 474,522 ${cx},540 C426,522 430,500 ${cx},484 Z" fill="url(#iron)"/>`);
  b.push(`<rect x="426" y="538" width="48" height="12" rx="4" fill="#2A2520"/>`, `<rect x="414" y="550" width="72" height="16" rx="5" fill="url(#iron)"/>`);

  // the small upper roof, with tile ribs
  const roofRibs = (clip, y0, y1, top, eave, n) =>
    `<g clip-path="url(#${clip})">${Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n - 0.5;
      return `<line x1="${f(cx + t * top * 2)}" y1="${y0}" x2="${f(cx + t * eave * 2.1)}" y2="${y1 + 40}" stroke="#6A6058" stroke-width="3" opacity="0.55"/>`;
    }).join("")}</g>`;
  b.push(`<path d="${pagodaRoof(cx, 566, 64, 214, 648, 30, 22)}" fill="url(#iron)"/>`);
  b.push(roofRibs("capRoof", 566, 648, 64, 214, 12));
  b.push(`<path d="M${cx - 64},566 L${cx + 64},566" stroke="#7A6E62" stroke-width="5" stroke-linecap="round"/>`);

  // the drum between the roofs: dark, with lit slits
  b.push(`<rect x="356" y="672" width="188" height="46" rx="4" fill="url(#iron)"/>`);
  for (let i = 0; i < 7; i++) b.push(`<rect x="${370 + i * 24}" y="684" width="12" height="22" rx="2" fill="url(#band)" opacity="0.85"/>`);

  // the main roof: tiles, a lit eave edge, curled tips
  b.push(`<path d="${pagodaRoof(cx, 716, 150, 352, 842, 52, 34)}" fill="url(#iron)"/>`);
  b.push(roofRibs("mainRoof", 716, 842, 150, 352, 22));
  b.push(`<g clip-path="url(#mainRoof)"><path d="M${cx - 360},${842 + 8} Q${cx},${842 + 40} ${cx + 360},${842 + 8}" fill="none" stroke="#0E0C0A" stroke-width="22" opacity="0.7"/></g>`);
  b.push(`<path d="M${cx - 150},716 L${cx + 150},716" stroke="#7A6E62" stroke-width="6" stroke-linecap="round"/>`);
  // a small brass bead and drop hanging from each eave tip
  [-1, 1].forEach((s) => {
    const x = cx + s * 366;
    b.push(`<circle cx="${x}" cy="${842 - 52 - 18}" r="11" fill="none" stroke="#2A2520" stroke-width="6"/>`);
    b.push(`<line x1="${x}" y1="${842 - 52 - 8}" x2="${x}" y2="${842 + 30}" stroke="#2A2520" stroke-width="3"/>`);
    b.push(`<circle cx="${x}" cy="${842 + 38}" r="9" fill="url(#brass)"/>`);
    b.push(`<path d="M${x},${842 + 46} L${x + 7},${842 + 86} L${x - 7},${842 + 86} Z" fill="#1F3550"/>`);
  });
  // collar under the roof
  b.push(`<rect x="196" y="872" width="508" height="18" rx="4" fill="#211D19"/>`);

  // the body: six-sided, three faces showing - a broad lit front, two
  // foreshortened sides; dark posts between
  const top = 890;
  const bot = 1470;
  // lattice friezes above and below the panels: lit paper behind dark fretwork
  const frieze = (y, h) => {
    const g = [`<rect x="200" y="${y}" width="500" height="${h}" fill="url(#band)"/>`, `<rect x="200" y="${y}" width="500" height="${h}" fill="none" stroke="#1E1A16" stroke-width="10"/>`];
    const cells = 14;
    const w = 500 / cells;
    for (let i = 0; i < cells; i++) {
      const x = 200 + i * w;
      // a key-fret cell: alternating hooks, like the window lattice
      g.push(
        i % 2
          ? `<path d="M${f(x + 4)},${y + 8} H${f(x + w - 6)} V${y + h - 16} H${f(x + 12)} V${y + 18}" fill="none" stroke="#1E1A16" stroke-width="6"/>`
          : `<path d="M${f(x + w - 4)},${y + h - 8} H${f(x + 6)} V${y + 16} H${f(x + w - 12)} V${y + h - 18}" fill="none" stroke="#1E1A16" stroke-width="6"/>`,
      );
    }
    return g.join("");
  };
  b.push(frieze(top, 76));
  // panels
  b.push(`<rect x="214" y="${top + 76}" width="92" height="${bot - top - 152}" fill="url(#paperL)"/>`);
  b.push(`<rect x="594" y="${top + 76}" width="92" height="${bot - top - 152}" fill="url(#paperR)"/>`);
  b.push(`<rect x="306" y="${top + 76}" width="288" height="${bot - top - 152}" fill="url(#paper)"/>`);
  // the paper's grain, and a faint lotus painted on the front face
  for (let i = 0; i < 26; i++) {
    const x = 310 + rand() * 280;
    b.push(`<line x1="${f(x)}" y1="${top + 80}" x2="${f(x + (rand() - 0.5) * 6)}" y2="${bot - 80}" stroke="#C98E4E" stroke-width="1.2" opacity="${f(0.08 + rand() * 0.1)}"/>`);
  }
  const lotusAt = `translate(${cx} ${top + 410})`;
  b.push(
    `<g transform="${lotusAt}" opacity="0.32">` +
      [-62, -31, 0, 31, 62].map((a) => `<path d="${lotus(0, a === 0 ? 120 : 98, 34)}" transform="rotate(${a})" fill="#C1793A"/>`).join("") +
      `<path d="M-74,6 Q0,30 74,6" fill="none" stroke="#C1793A" stroke-width="6" stroke-linecap="round"/></g>`,
  );
  // the frame: thin rails at the panel edges, then the posts
  b.push(`<rect x="306" y="${top + 76}" width="288" height="${bot - top - 152}" fill="none" stroke="#2A2520" stroke-width="6"/>`);
  b.push(`<rect x="320" y="${top + 92}" width="260" height="${bot - top - 184}" fill="none" stroke="#2A2520" stroke-width="2" opacity="0.6"/>`);
  [[190, 26], [296, 22], [582, 22], [684, 26]].forEach(([x, w]) => b.push(`<rect x="${x}" y="${top - 6}" width="${w}" height="${bot - top + 12}" rx="3" fill="url(#ironSide)"/>`));
  b.push(frieze(bot - 76, 76));

  // the base: a small inverted eave, stepped down to a knob
  b.push(`<path d="M160,${bot} L740,${bot} Q760,${bot - 6} 770,${bot - 22} Q752,${bot + 30} 700,${bot + 40} L200,${bot + 40} Q148,${bot + 30} 130,${bot - 22} Q140,${bot - 6} 160,${bot} Z" fill="url(#iron)"/>`);
  b.push(`<rect x="252" y="${bot + 40}" width="396" height="30" rx="4" fill="#211D19"/>`);
  for (let i = 0; i < 9; i++) b.push(`<rect x="${276 + i * 40}" y="${bot + 47}" width="18" height="14" rx="2" fill="url(#band)" opacity="0.7"/>`);
  b.push(`<path d="M300,${bot + 70} L600,${bot + 70} L560,${bot + 104} L340,${bot + 104} Z" fill="url(#iron)"/>`);
  b.push(`<ellipse cx="${cx}" cy="${bot + 122}" rx="34" ry="22" fill="url(#iron)"/>`);
  b.push(`<path d="M${cx - 12},${bot + 140} L${cx + 12},${bot + 140} L${cx},${bot + 172} Z" fill="#211D19"/>`);

  // the cord, a brass bead, and the long tassel
  b.push(`<line x1="${cx}" y1="${bot + 170}" x2="${cx}" y2="${bot + 262}" stroke="#2A2520" stroke-width="5"/>`);
  b.push(`<circle cx="${cx}" cy="${bot + 280}" r="20" fill="url(#brass)"/>`);
  b.push(`<path d="M${cx - 14},${bot + 296} Q${cx - 30},${bot + 330} ${cx - 34},${bot + 366} L${cx + 34},${bot + 366} Q${cx + 30},${bot + 330} ${cx + 14},${bot + 296} Z" fill="url(#tassel)"/>`);
  b.push(`<rect x="${cx - 37}" y="${bot + 362}" width="74" height="14" rx="5" fill="url(#brass)"/>`);
  const tTop = bot + 376;
  b.push(`<rect x="${cx - 34}" y="${tTop}" width="68" height="${2200 - tTop}" fill="url(#tassel)"/>`);
  for (let i = 0; i < 24; i++) {
    const x = cx - 32 + i * 2.8;
    const end = 2196 + rand() * 34;
    b.push(`<line x1="${f(x)}" y1="${tTop + 6}" x2="${f(x + (rand() - 0.5) * 3)}" y2="${f(end)}" stroke="${i % 3 ? "#0F1B2C" : "#2C4566"}" stroke-width="2.2" stroke-linecap="round"/>`);
  }
  return svg(900, 2250, defs, b.join(""));
}

// ---------------------------------------------------------------------------
// 4. marigold clusters: dense, overlapping orange marigolds with leaves, each
//    composed for its place on the hero's edges (one flattened illustration
//    per composition, so it reads as one arrangement)
// ---------------------------------------------------------------------------

// a cluster: leaves behind, then the flowers back to front, each with a soft
// shadow under it for depth
function cluster(w, h, seed, leaves, flowers) {
  const rand = rng(seed);
  const defs = [
    linear("leaf", [[0, "#4E8C4F"], [1, C.leafLo]], 1, 1),
    radial("bloomShade", [[0, "#5A2A06", 0.38], [0.7, "#5A2A06", 0.16], [1, "#5A2A06", 0]]),
  ].join("");
  // each leaf starts tucked under the blooms (70 back from the given base,
  // its tip where given), so it grows out from between them
  const b = leaves.map(([x, y, len, angle]) => {
    const [dx, dy] = polar(70, angle);
    return mangoLeaf(f(x - dx), f(y - dy), len + 70, angle);
  });
  flowers.forEach(([x, y, r]) => {
    b.push(`<ellipse cx="${f(x + r * 0.06)}" cy="${f(y + r * 0.1)}" rx="${f(r * 1.08)}" ry="${f(r * 0.98)}" fill="url(#bloomShade)"/>`);
    b.push(marigoldTop(x, y, r, rand));
  });
  return svg(w, h, defs, b.join(""));
}

// a tall trail: enters from one side (the left of the art; mirrored for the
// right edge), narrow at the top (it starts beside a word), wider and fuller
// lower down, leaves pointing out all round
function marigoldTrail() {
  return cluster(
    600,
    1200,
    61,
    [
      [170, 140, 150, -35],
      [290, 150, 110, 15],
      [470, 380, 130, 70],
      [110, 250, 120, -60],
      [480, 700, 110, 95],
      [470, 880, 110, 110],
      [480, 1050, 100, 140],
      [90, 1090, 100, -135],
      [260, 1140, 50, 180],
    ],
    [
      [200, 165, 100],
      [330, 330, 88],
      [140, 320, 125],
      [330, 420, 118],
      [125, 520, 112],
      [420, 560, 95],
      [250, 620, 135],
      [120, 760, 118],
      [370, 760, 118],
      [230, 900, 128],
      [420, 950, 92],
      [115, 1010, 104],
      [300, 1080, 98],
    ],
  );
}

// a corner: a row along the top (under the eave), turning down the left edge
function marigoldCorner() {
  return cluster(
    900,
    1100,
    83,
    [
      [800, 200, 90, 120],
      [560, 230, 110, 160],
      [380, 240, 120, 150],
      [300, 420, 120, 110],
      [300, 640, 120, 95],
      [290, 880, 120, 115],
    ],
    [
      [770, 150, 78],
      [630, 125, 95],
      [470, 145, 105],
      [300, 130, 115],
      [125, 150, 125],
      [200, 320, 115],
      [125, 450, 120],
      [215, 570, 105],
      [120, 690, 118],
      [210, 820, 100],
      [110, 940, 108],
      [200, 1020, 72],
    ],
  );
}

// ---------------------------------------------------------------------------

const ART = [
  { file: "diwali-diya", draw: diya, size: [1200, 900] },
  { file: "diwali-lantern", draw: lantern, size: [900, 2250] },
  { file: "diwali-marigold-trail", draw: marigoldTrail, size: [600, 1200] },
  { file: "diwali-marigold-corner", draw: marigoldCorner, size: [900, 1100] },
];

await mkdir(OUT, { recursive: true });
for (const { file, draw, size } of ART) {
  const source = draw();
  await writeFile(path.join(OUT, `${file}.svg`), source);
  const info = await sharp(Buffer.from(source), { density: 72 * (size[0] / parseFloat(source.match(/width="(\d+)"/)[1])) })
    .resize(size[0], size[1])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `${file}.png`));
  console.log(`${file}.png  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
}
