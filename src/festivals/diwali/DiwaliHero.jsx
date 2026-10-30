"use client";

import { useLayoutEffect, useRef } from "react";
import Sticker from "./Sticker";
import Diya from "./Diya";
import { diwaliAsset, DIWALI_ASSETS } from "./assets";
import { animateHero } from "./motion";
import "./diwali.css";

// The Diwali composition in the home hero (FestivalSlot area="hero"): art
// around the edges and corners, the middle left open for the content. Under
// the hero's text (z-index 0, before the headline's layer), never
// interactive:
//   - the mandala: the dominant piece, its centre near the right edge a
//     little below the middle - the part past the edge is cropped by the
//     viewport, the rest of the circle always shows
//   - marigold clusters entering from the edges, each its own composition
//     in its own wrapper: a row under the eave turning down the left edge
//     (the corner), a tall trail beside the lead word "where" (left edge),
//     and the same trail mirrored under the menu button (right edge)
//   - a tiled eave entering from the upper-left, two lanterns hanging from it
//     (tablet and up)
//   - two small diyas just after the headline's last line
// Each piece can be switched off in the festival registry (`decorations`).
// Motion (motion.js, settings in the festival registry): the mandala opens
// like an iris and turns imperceptibly; diyas float, their flames breathe and
// they lean from a nearby pointer; lanterns sway; the clusters fade in and
// then stay still.
//
// The content wins: the mandala's size and height and the diyas' place are
// measured, not fixed, against the text (line by line), the notes and their
// doodles. The clusters and the eave are placed by CSS; one that would still
// touch the text, the notes or the nav at some size - judged by where its art
// actually is (the asset's coverage mask), not its box - is left out there.

const DESIGN_SHARE = 0.62; // the mandala's largest size, of the hero height
const DESIGN_MAX = 736; // px (46rem)
const PHONE_SHARE = 0.62; // of the width, on phones
const MIN_SIZE = 96; // px: smaller and the mandala is left out
const PAST_EDGE = 0.084; // share of the mandala's size its centre sits in from the right edge
const TARGET_Y = 0.58; // where its centre would like to be, of the hero height
const EDGE = 16; // px kept between the mandala and the hero's top and bottom
// then grown and let down over the next section (the brands): as large as
// GROW_SHARE of the hero height (GROW_MAX at most), with between BLEED_MIN
// and BLEED_MAX of it below the hero, as the content above leaves room
const GROW_SHARE = 0.72;
const GROW_MAX = 760; // px
const BLEED_MIN = 0.08;
const BLEED_MAX = 0.3;
// px kept between the mandala and each kind of obstacle
const GAP = { text: 24, note: 24, doodle: 12, diyas: 12, nav: 12 };
// the diyas: their height as a share of a headline line, and the smallest
const DIYA_SHARE = 0.62;
const DIYA_MIN = 22;

const LANTERN_HOOKS = DIWALI_ASSETS.find((a) => a.id === "diwali-eave")?.hooks;

// distance from a point to a rectangle (0 inside it)
const pointGap = (o, x, y) => Math.hypot(Math.max(o.l - x, 0, x - o.r), Math.max(o.t - y, 0, y - o.b));
// distance between two rectangles (0 when they overlap)
const rectGap = (a, b) => Math.hypot(Math.max(a.l - b.r, 0, b.l - a.r), Math.max(a.t - b.b, 0, b.t - a.b));

// a text element's lines, in hero coordinates
function textLines(el, box) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return [...range.getClientRects()]
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ kind: "text", l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top }));
}

// what the decoration keeps clear of, in hero coordinates: the text line by
// line, the note cards, their doodles, and the nav over the hero's top. The
// headline's lines are set tighter than their font boxes, so each one counts
// as one line-step tall around its middle (else neighbours overlap and no
// line has room beside it); they are also returned on their own, in order.
function measureObstacles(hero, box) {
  const list = [];
  const add = (kind, r) => {
    if (r.width > 0 && r.height > 0) list.push({ kind, l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top });
  };
  hero.querySelectorAll(".hero-eyebrow, .hero-heading-lead").forEach((el) => list.push(...textLines(el, box)));
  const heading = hero.querySelector(".hero-heading");
  const lines = heading ? textLines(heading, box) : [];
  const step = lines.length > 1 ? (lines[lines.length - 1].t - lines[0].t) / (lines.length - 1) : Infinity;
  lines.forEach((line) => {
    const mid = (line.t + line.b) / 2;
    const half = Math.min(line.b - line.t, step) / 2;
    line.t = mid - half;
    line.b = mid + half;
  });
  list.push(...lines);
  hero.querySelectorAll(".hero-note-card").forEach((el) => add("note", el.getBoundingClientRect()));
  hero.querySelectorAll(".hero-doodle, .hero-flight").forEach((el) => add("doodle", el.getBoundingClientRect()));
  const nav = document.querySelector("nav");
  if (nav) list.push({ kind: "nav", l: 0, t: 0, r: box.width, b: nav.offsetHeight });
  return { obstacles: list, lines };
}

// the mandala: the largest size (up to its design size) whose circle, with
// its centre PAST_EDGE in from the right edge, fits between the hero's top
// and bottom clear of the content - at the height nearest TARGET_Y
function placeMandala(width, height, obstacles) {
  const design = width <= 640 ? width * PHONE_SHARE : Math.min(height * DESIGN_SHARE, DESIGN_MAX);
  const target = height * TARGET_Y;
  for (let size = design; size >= MIN_SIZE; size -= Math.max(4, design * 0.02)) {
    const r = size / 2;
    const x = width - size * PAST_EDGE;
    const lo = EDGE + r;
    const hi = height - EDGE - r;
    if (hi < lo) continue;
    let best = null;
    for (let y = lo; y <= hi; y += 4) {
      if (best !== null && Math.abs(y - target) >= Math.abs(best - target)) continue;
      if (obstacles.every((o) => !(o.kind in GAP) || pointGap(o, x, y) >= r + GAP[o.kind])) best = y;
    }
    if (best !== null) return { x, y: best, r, ...growIntoNext(width, height, obstacles, size) };
  }
  return null;
}

// then: the largest size (up to the grow cap, never smaller than it already
// is) that, anchored the same way at the right edge, reaches down over the
// top of the section below - the hero lets it out downward (diwali.css) - by
// BLEED_MIN to BLEED_MAX of its size, as little as fits, clear of the
// content; where nothing fits (the content runs down to the hero's bottom
// beside it) it stays as placed
function growIntoNext(width, height, obstacles, size) {
  const cap = width <= 640 ? size : Math.max(size, Math.min(height * GROW_SHARE, GROW_MAX));
  for (let s = cap; s >= size - 0.5; s -= 4) {
    const r = s / 2;
    const x = width - s * PAST_EDGE;
    for (let bleed = BLEED_MIN; bleed <= BLEED_MAX + 0.001; bleed += 0.01) {
      const y = height - r + bleed * s;
      if (obstacles.every((o) => !(o.kind in GAP) || pointGap(o, x, y) >= r + GAP[o.kind])) return { x, y, r };
    }
  }
  return {};
}

// the two diyas: just after a headline line - the last one if they fit
// beside it, else the nearest line above with room - at about half a line's
// height, centred on the line; smaller only if no line has room otherwise.
// Placed before the mandala, which then keeps clear of them.
function placeDiyas(group, width, lines, obstacles) {
  for (let share = DIYA_SHARE; share >= 0.3 - 0.001; share -= 0.05) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const h = Math.max(DIYA_MIN, (line.b - line.t) * share);
      group.style.setProperty("--diya-h", `${h}px`);
      const w = group.offsetWidth;
      const gh = group.offsetHeight;
      const x = line.r + h * 0.35;
      const y = (line.t + line.b) / 2 - gh / 2;
      const box = { l: x, t: y, r: x + w, b: y + gh };
      if (box.r > width - 12) continue;
      if (obstacles.some((o) => o !== line && o.kind !== "nav" && rectGap(o, box) < 6)) continue;
      return { x, y, w, h: gh };
    }
  }
  return null;
}

// where a CSS-placed piece's art is, in hero coordinates: the cells of its
// asset's coverage mask that are on screen (flipped with the piece), or its
// whole box when the asset has no mask
function artBoxes(piece, width, height) {
  const box = { l: piece.offsetLeft, t: piece.offsetTop, r: piece.offsetLeft + piece.offsetWidth, b: piece.offsetTop + piece.offsetHeight };
  const mask = diwaliAsset(piece.dataset.asset)?.mask;
  if (!mask) return [box];
  const flip = piece.classList.contains("diwali-bunch--flip");
  const cw = (box.r - box.l) / mask.cols;
  const ch = (box.b - box.t) / mask.rows.length;
  const cells = [];
  mask.rows.forEach((row, r) => {
    for (let c = 0; c < mask.cols; c++) {
      if (row[c] !== "1") continue;
      const l = box.l + (flip ? mask.cols - 1 - c : c) * cw;
      const t = box.t + r * ch;
      if (l + cw > 0 && l < width && t + ch > 0 && t < height) cells.push({ l, t, r: l + cw, b: t + ch });
    }
  });
  return cells;
}

// the marigold clusters: [place, asset]
const CLUSTERS = [
  ["corner", "diwali-marigold-corner"],
  ["where", "diwali-marigold-trail"],
  ["menu", "diwali-marigold-trail"],
];

export default function DiwaliHero({ guides, motion, decorations = {} }) {
  const show = (piece) => decorations[piece] !== false;
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const hero = root?.parentElement;
    if (!root || !hero) return undefined;

    const layout = () => {
      const box = hero.getBoundingClientRect();
      const { width, height } = box;
      const { obstacles, lines } = measureObstacles(hero, box);

      // the diyas first, after the headline (they belong to it)
      const group = root.querySelector(".diwali-diyas");
      const spot = group?.children.length ? placeDiyas(group, width, lines, obstacles) : null;

      // the mandala, clear of the content and of the diyas
      const taken = spot ? [{ kind: "diyas", l: spot.x, t: spot.y, r: spot.x + spot.w, b: spot.y + spot.h }] : [];
      const ring = root.querySelector(".diwali-rangoli") ? placeMandala(width, height, [...obstacles, ...taken]) : null;
      root.style.setProperty("--rangoli", `${ring ? Math.floor(ring.r * 2) : 0}px`);
      root.style.setProperty("--rangoli-x", `${ring ? Math.round(ring.x) : 0}px`);
      root.style.setProperty("--rangoli-y", `${ring ? Math.round(ring.y) : 0}px`);
      root.dataset.rangoli = ring ? "on" : "off";

      if (group?.children.length) {
        group.dataset.placed = spot ? "on" : "off";
        if (spot) {
          root.style.setProperty("--diyas-x", `${Math.round(spot.x)}px`);
          root.style.setProperty("--diyas-y", `${Math.round(spot.y)}px`);
          // the embers' canvas: over the pair, with room above to rise
          const top = Math.max(0, spot.y - 150);
          root.style.setProperty("--embers-x", `${Math.round(spot.x - 50)}px`);
          root.style.setProperty("--embers-y", `${Math.round(top)}px`);
          root.style.setProperty("--embers-w", `${Math.round(spot.w + 100)}px`);
          root.style.setProperty("--embers-h", `${Math.round(spot.y - top + spot.h + 10)}px`);
        }
      }

      // the CSS-placed pieces: left out where they would touch the content
      const content = obstacles.filter((o) => o.kind === "text" || o.kind === "note" || o.kind === "nav");
      root.querySelectorAll(".diwali-bunch, .diwali-eave-group").forEach((piece) => {
        delete piece.dataset.clear;
        if (!piece.offsetParent) return;
        piece.dataset.clear = artBoxes(piece, width, height).some((b) => content.some((o) => rectGap(o, b) < 8)) ? "off" : "on";
      });
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(hero);
    const content = hero.querySelector(".hero-content");
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [guides]);

  // motion, once the pieces are in the DOM (re-run if guides switch pieces in)
  useLayoutEffect(() => (rootRef.current ? animateHero(rootRef.current, motion) : undefined), [motion, guides]);

  const hook = (which) =>
    LANTERN_HOOKS ? { left: `${LANTERN_HOOKS[which][0] * 100}%`, top: `${LANTERN_HOOKS[which][1] * 100}%` } : undefined;

  return (
    <div className="diwali-hero" ref={rootRef} aria-hidden="true">
      {show("mandala") && <Sticker id="diwali-mandala" className="diwali-rangoli" sizes="(max-width: 640px) 62vw, min(72vh, 760px)" guides={guides} />}
      {/* the lanterns' light in the air round them (bloom.js): behind the flowers, the eave and the lanterns */}
      {show("ornament") && show("bloom") && <canvas className="diwali-bloom" />}
      {show("marigold") &&
        CLUSTERS.map(([place, id]) => (
          <span key={place} className={`diwali-bunch diwali-bunch--${place}${place === "menu" ? " diwali-bunch--flip" : ""}`} data-asset={id}>
            <Sticker id={id} className="diwali-bunch-art" sizes="(max-width: 640px) 5rem, 10rem" guides={guides} />
          </span>
        ))}
      {show("ornament") && (
        <div className="diwali-eave-group">
          {/* the lanterns first, so the eave covers the tops of their rods */}
          {/* each with its light: a glow over its glass panels only (diwali.css) */}
          <span className="diwali-hanging diwali-hanging--large" style={hook("large")}>
            <Sticker id="diwali-lantern" className="diwali-hanging-art" sizes="6rem" guides={guides} />
            <span className="diwali-lantern-glow" />
          </span>
          <span className="diwali-hanging diwali-hanging--small" style={hook("small")}>
            <Sticker id="diwali-lantern" className="diwali-hanging-art" sizes="3rem" guides={guides} />
            <span className="diwali-lantern-glow" />
          </span>
          <Sticker id="diwali-eave" className="diwali-eave" sizes="(max-width: 1024px) 15rem, 20rem" guides={guides} />
        </div>
      )}
      {/* embers rise from the flames (motion.js): a small canvas over the diyas */}
      {show("diyas") && <canvas className="diwali-embers" />}
      {show("diyas") && (
        <div className="diwali-diyas">
          <Diya id="diwali-diya" variant="ornate" sizes="5rem" guides={guides} />
          <Diya id="diwali-diya" variant="plain" sizes="4.5rem" guides={guides} />
        </div>
      )}
    </div>
  );
}
