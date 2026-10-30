"use client";

import { Component, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text } from "troika-three-text";
import { createFluid } from "@/lib/stableFluid";

// One R3F canvas for the whole hero: a GPU stable-fluids simulation (velocity
// + ink) drawn as a soft ink layer, plus Troika copies of the hero text whose
// glyph vertices are displaced by a decaying displacement field carried in
// the same simulation. The DOM text stays in place (it owns layout, selection
// and the fallback) and is only made transparent once its Troika twin is
// ready, so a failed/disabled canvas leaves the hero exactly as it was.

const CONFIG = {
  SIM_HEIGHT_DESKTOP: 144,
  SIM_HEIGHT_TABLET: 96,
  PRESSURE_ITERATIONS_DESKTOP: 16,
  PRESSURE_ITERATIONS_TABLET: 10,
  // how fast the flow calms after a stroke (higher = settles sooner, less
  // sloshing); the ink itself fades on DYE_DISSIPATION, unchanged
  VELOCITY_DISSIPATION: 1.9,
  DYE_DISSIPATION: 1.1,
  // brush follows the pointer with inertia instead of snapping to it
  BRUSH_STIFFNESS: 16,
  VELOCITY_SMOOTHING: 10,
  MIN_SPEED: 40,
  // safety cap on the brush velocity (px/s) - far above any real stroke, it
  // only stops a hitch from turning into one oversized impulse
  MAX_SPEED: 6000,
  MAX_SPLATS: 8,
  SPLAT_FORCE: 0.48, // push per stroke
  SPLAT_RADIUS: 0.001,
  SPLAT_RADIUS_SPEED: 0.002,
  INK_BASE: 0.05,
  INK_SPEED: 0.2,
  COLOR_CYCLE_PX: 500,
  COLOR_A: "#ffffff",
  COLOR_B: "#ffffff",
  INK_ALPHA: 0.36,
  // soft halo around the ink, and the glossy highlight riding its surface
  BLOOM: 0.14,
  SHEEN: 0.85,
  // text displacement: px of drift added per px/s of flow, and its soft cap
  DISPLACE_GAIN: 0.055,
  DISPLACE_MAX: 12,
  SETTLE_MS: 4500,
};

function makeTextMaterial(textUniforms) {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  // Troika derives its SDF material from this one and calls this hook first,
  // so by begin_vertex `transformed` already holds the placed glyph corner
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFluidDisp = textUniforms.disp;
    shader.uniforms.uFluidSize = textUniforms.size;
    shader.uniforms.uFluidMax = textUniforms.max;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D uFluidDisp;
        uniform vec2 uFluidSize;
        uniform float uFluidMax;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vec4 fluidWorld = modelMatrix * vec4(transformed, 1.0);
          vec2 fluidUv = fluidWorld.xy / uFluidSize + 0.5;
          vec2 fluidDisp = texture2D(uFluidDisp, fluidUv).zw;
          transformed.xy += uFluidMax * tanh(fluidDisp / uFluidMax);
        }`
      );
  };
  return material;
}

// the browser's own line breaks, so Troika breaks exactly where the DOM does
function collectLines(el, upper) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const fontSize = parseFloat(getComputedStyle(el).fontSize);
  const lines = [];
  let lastTop = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (let i = 0; i < node.data.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      if (lastTop === null || Math.abs(rect.top - lastTop) > fontSize * 0.5) {
        lines.push("");
        lastTop = rect.top;
      }
      lines[lines.length - 1] += node.data[i];
    }
  }
  return lines
    .map((line) => line.replace(/\s+$/, ""))
    .map((line) => (upper ? line.toUpperCase() : line));
}

// Troika copies stay hidden until every one of them is typeset and its
// program linked, then all appear in the same frame the DOM text goes
// transparent - never a heading with neither copy, or with both drawn.
function createReveal(root, total) {
  const texts = new Set();
  const ready = new Set();
  let shown = false;
  return {
    add(text) {
      texts.add(text);
      text.visible = shown;
    },
    remove(text, key) {
      texts.delete(text);
      ready.delete(key);
    },
    ready(key) {
      ready.add(key);
      if (shown || ready.size < total) return;
      shown = true;
      texts.forEach((t) => {
        t.visible = true;
      });
      root.classList.add("hero-troika-ready");
    },
    // hand the hero back to its DOM text if the canvas goes away
    reset() {
      shown = false;
      ready.clear();
      texts.forEach((t) => {
        t.visible = false;
      });
      root.classList.remove("hero-troika-ready");
    },
  };
}

function precompile(gl, object, camera, scene) {
  try {
    return gl.compileAsync(object, camera, scene).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

function HeroText({ root, selector, font, textUniforms, reveal }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const measureRef = useRef(null);

  useEffect(() => {
    const el = root.querySelector(selector);
    if (!el) return undefined;

    const material = makeTextMaterial(textUniforms);
    const text = new Text();
    text.font = font;
    text.anchorX = "left";
    text.anchorY = "top-baseline";
    text.whiteSpace = "nowrap";
    text.material = material;
    text.renderOrder = 2;
    text.frustumCulled = false;
    reveal.add(text);
    scene.add(text);

    let disposed = false;
    // measuring before the page's web fonts are in lays the copy out with the
    // fallback font's line breaks, which then visibly re-typesets once they
    // land (first visit only - later visits have them cached)
    let fontsReady = false;
    let compiled = false;
    function measure() {
      if (disposed || !fontsReady) return;
      const cs = getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize);
      const lineHeight = parseFloat(cs.lineHeight);
      const lines = collectLines(el, cs.textTransform === "uppercase");
      if (!lines.length || !fontSize) return;

      text.text = lines.join("\n");
      text.fontSize = fontSize;
      text.lineHeight = Number.isFinite(lineHeight) ? lineHeight / fontSize : "normal";
      text.letterSpacing = (parseFloat(cs.letterSpacing) || 0) / fontSize;
      material.color.set(cs.color);

      const rootRect = root.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      // the first line's real baseline, from a zero-size probe: matches the
      // DOM whatever the font's own ascent/descent metrics are
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;";
      el.insertBefore(probe, el.firstChild);
      const baseline = probe.getBoundingClientRect().bottom;
      probe.remove();
      text.position.set(
        rect.left - rootRect.left - rootRect.width / 2,
        rootRect.height / 2 - (baseline - rootRect.top),
        0
      );
      text.sync(() => {
        if (disposed) return;
        if (compiled) {
          invalidate();
          return;
        }
        compiled = true;
        // link the SDF program off the main thread before the copy is shown,
        // instead of synchronously inside its first visible frame
        precompile(gl, text, camera, scene).then(() => {
          if (disposed) return;
          reveal.ready(selector);
          invalidate();
        });
      });
    }
    // The first typeset (font parse + glyph SDF rendering, which Troika does
    // on the main thread) runs immediately rather than waiting for browser
    // idle: the entry preloader's own multi-second runtime is what covers
    // this (see HeroFluid's mount effect). Until synced, the DOM text
    // simply stays visible.
    measureRef.current = measure;

    const observer = new ResizeObserver(measure);
    observer.observe(root);
    // resolves in a microtask when the fonts are already loaded
    document.fonts.ready.then(() => {
      fontsReady = true;
      measure();
    });

    return () => {
      disposed = true;
      measureRef.current = null;
      observer.disconnect();
      reveal.remove(text, selector);
      scene.remove(text);
      text.dispose();
      material.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, selector, font, scene, textUniforms, reveal]);

  useEffect(() => {
    measureRef.current?.();
  }, [size.width, size.height]);

  return null;
}

const TEXTS = [
  { selector: ".hero-heading-lead", font: "/fonts/AppleGaramond-Italic.ttf" },
  { selector: ".hero-heading", font: "/fonts/AppleRegular.ttf" },
];

// top/left of `el` inside `ancestor`, in layout px (CSS transforms ignored)
function offsetWithin(el, ancestor) {
  let x = 0;
  let y = 0;
  for (let node = el; node && node !== ancestor; node = node.offsetParent) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y };
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// mix a CSS colour with white, like color-mix(in srgb, c p%, #fff)
function mixWithWhite(css, p) {
  const c = new THREE.Color(css);
  const ch = (v) => Math.round((v * p + (1 - p)) * 255);
  c.convertLinearToSRGB();
  return `rgb(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)})`;
}

const NOTE_MARGIN = 28; // px of room around the paper for its shadow

// Draws one sticky note (paper, grain, fold, shadows, text) into a canvas,
// from the DOM note's own computed styles and word positions, so the
// fluid-warped copy matches what the page shows.
async function drawNote(note, dpr) {
  const card = note.querySelector(".hero-note-card");
  const paper = note.querySelector(".hero-note-paper");
  const textEl = note.querySelector(".hero-note-text");
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const cs = getComputedStyle(note);
  const fold = parseFloat(cs.getPropertyValue("--fold")) * parseFloat(getComputedStyle(document.documentElement).fontSize) || 24;
  const paperColor = cs.getPropertyValue("--paper").trim();
  const foldLeft = note.classList.contains("hero-note--ivory");

  // word boxes relative to the card, measured with the card's tilt removed
  // (the note's float translation cancels out); restored before any paint
  const prevTransform = card.style.transform;
  card.style.transform = "none";
  const cardRect = card.getBoundingClientRect();
  const ts = getComputedStyle(textEl);
  const words = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const match of node.textContent.matchAll(/\S+/g)) {
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const r = range.getBoundingClientRect();
      if (r.width) words.push({ text: match[0], x: r.left - cardRect.left, y: r.top - cardRect.top });
    }
  }
  card.style.transform = prevTransform;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round((w + NOTE_MARGIN * 2) * dpr);
  canvas.height = Math.round((h + NOTE_MARGIN * 2) * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.translate(NOTE_MARGIN, NOTE_MARGIN);

  const outline = new Path2D();
  if (foldLeft) {
    outline.moveTo(fold, 0);
    outline.lineTo(w, 0);
    outline.lineTo(w, h);
    outline.lineTo(0, h);
    outline.lineTo(0, fold);
  } else {
    outline.moveTo(0, 0);
    outline.lineTo(w - fold, 0);
    outline.lineTo(w, fold);
    outline.lineTo(w, h);
    outline.lineTo(0, h);
  }
  outline.closePath();

  // paper + its two soft shadows (same values as the CSS drop-shadows)
  ctx.fillStyle = paperColor;
  for (const [y, blur, alpha] of [[9, 14, 0.13], [1, 1, 0.1]]) {
    ctx.save();
    ctx.shadowColor = `rgba(7, 47, 51, ${alpha})`;
    ctx.shadowOffsetY = y;
    ctx.shadowBlur = blur;
    ctx.fill(outline);
    ctx.restore();
  }

  // the same fibre grain image the CSS paints
  const grainUrl = getComputedStyle(paper).backgroundImage.match(/url\("?(.*?)"?\)$/)?.[1];
  const grain = grainUrl ? await loadImage(grainUrl) : null;
  if (grain) {
    ctx.save();
    ctx.clip(outline);
    ctx.fillStyle = ctx.createPattern(grain, "repeat");
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // folded flap: lighter underside, crease highlight, small fold shadow
  const flap = new Path2D();
  const crease = new Path2D();
  const s = 0.07 * fold;
  if (foldLeft) {
    flap.moveTo(fold, 0);
    flap.lineTo(fold, fold);
    flap.lineTo(0, fold);
    crease.moveTo(fold, 0);
    crease.lineTo(0, fold);
    crease.lineTo(s, fold);
    crease.lineTo(fold, s);
  } else {
    flap.moveTo(w - fold, 0);
    flap.lineTo(w, fold);
    flap.lineTo(w - fold, fold);
    crease.moveTo(w - fold, 0);
    crease.lineTo(w, fold);
    crease.lineTo(w - s, fold);
    crease.lineTo(w - fold, s);
  }
  flap.closePath();
  crease.closePath();
  ctx.save();
  ctx.shadowColor = "rgba(7, 47, 51, 0.2)";
  ctx.shadowOffsetX = foldLeft ? 1 : -1;
  ctx.shadowOffsetY = 1.5;
  ctx.shadowBlur = 1.5;
  ctx.fillStyle = mixWithWhite(paperColor, 0.78);
  ctx.fill(flap);
  ctx.restore();
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fill(crease);

  // words at their exact on-page spots
  await document.fonts.load(`${ts.fontStyle} ${ts.fontWeight} ${ts.fontSize} ${ts.fontFamily}`);
  ctx.font = `${ts.fontStyle} ${ts.fontWeight} ${ts.fontSize} ${ts.fontFamily}`;
  ctx.fillStyle = ts.color;
  ctx.textBaseline = "alphabetic";
  for (const word of words) {
    const m = ctx.measureText(word.text);
    const ascent = m.fontBoundingBoxAscent ?? parseFloat(ts.fontSize) * 0.8;
    ctx.fillText(word.text, word.x, word.y + ascent);
  }
  return { canvas, width: w + NOTE_MARGIN * 2, height: h + NOTE_MARGIN * 2 };
}

// The sticky notes, warped by the same fluid as the headline. The DOM notes
// float on a CSS animation while this canvas sleeps between strokes, so the
// copies are only drawn while the fluid is active: each frame they follow
// their note's current float and tilt, and the DOM notes stop painting. When
// the fluid settles (its displacement has decayed by then) the copies hide
// and the DOM notes paint again.
function HeroNotes({ root, textUniforms, pointer }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  // one mutable holder (like Scene's pointer ref): the effect fills it, the
  // frame loop reads it
  const store = useRef(null);
  if (store.current === null) store.current = { items: [], frame: null };

  useEffect(() => {
    const items = [...root.querySelectorAll(".hero-note")].map((note) => {
      const material = makeTextMaterial(textUniforms);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 24, 16), material);
      mesh.renderOrder = -1; // under the hero's ink, like the DOM notes
      mesh.frustumCulled = false;
      mesh.visible = false;
      scene.add(mesh);
      return { note, card: note.querySelector(".hero-note-card"), mesh, material, texture: null, ready: false, tilt: 0, matrix: new DOMMatrix() };
    });
    store.current.items = items;
    // the same window Scene keeps the canvas awake for
    let shown = false;
    store.current.frame = (frame) => {
      if (!items.length) return;
      const p = pointer.current;
      const active = p.visible && performance.now() < p.activeUntil && items.every((i) => i.ready);
      if (active !== shown) {
        shown = active;
        for (const item of items) {
          item.mesh.visible = active;
          item.note.classList.toggle("hero-note--fluid", active);
        }
      }
      if (!active) return;
      const { width, height } = frame.size;
      for (const item of items) {
        // layout centre + the note's current float translation, then the tilt
        const m = item.matrix.setMatrixValue(getComputedStyle(item.note).transform || "none");
        const box = offsetWithin(item.note, root);
        const cx = box.x + item.note.offsetWidth / 2 + m.e;
        const cy = box.y + item.note.offsetHeight / 2 + m.f;
        item.mesh.position.set(cx - width / 2, height / 2 - cy, 0);
        item.mesh.rotation.z = -item.tilt;
      }
    };
    let disposed = false;
    let version = 0;

    async function build() {
      const v = ++version;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const item of items) {
        if (!item.note.offsetWidth || getComputedStyle(item.note).display === "none") continue;
        const drawn = await drawNote(item.note, dpr);
        if (disposed || v !== version) return;
        const texture = new THREE.CanvasTexture(drawn.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        item.texture?.dispose();
        item.texture = texture;
        item.material.map = texture;
        item.material.needsUpdate = true;
        // geometry at real px size, not a scaled unit plane: the fluid
        // displacement is added in local units, which must be px
        item.mesh.geometry.dispose();
        item.mesh.geometry = new THREE.PlaneGeometry(drawn.width, drawn.height, 24, 16);
        const m = new DOMMatrix(getComputedStyle(item.card).transform);
        item.tilt = Math.atan2(m.b, m.a);
        if (!item.ready) {
          await precompile(gl, item.mesh, camera, scene);
          if (disposed) return;
          item.ready = true;
        }
      }
    }

    const observer = new ResizeObserver(() => build());
    items.forEach((item) => observer.observe(item.card));
    document.fonts.ready.then(() => !disposed && build());

    return () => {
      disposed = true;
      observer.disconnect();
      for (const item of items) {
        item.note.classList.remove("hero-note--fluid");
        scene.remove(item.mesh);
        item.mesh.geometry.dispose();
        item.material.dispose();
        item.texture?.dispose();
      }
      store.current.items = [];
      store.current.frame = null;
    };
  }, [root, scene, textUniforms, gl, camera, pointer]);

  // the per-frame work lives in the effect (it owns the meshes); this only
  // forwards R3F's frame to it
  useFrame((frame) => store.current.frame?.(frame));

  return null;
}

// tx/ty is the raw pointer, bx/by the brush; the brush is only ever seeded
// from a real pointer sample (see useFrame), never from this origin
function resetPointer(p) {
  return Object.assign(p, {
    tx: 0, ty: 0, inside: false, init: false,
    bx: 0, by: 0, svx: 0, svy: 0, phase: 0,
    activeUntil: 0, visible: true,
  });
}

function Scene({ root, tablet, look, ink }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const fluid = useMemo(
    () =>
      createFluid({
        velocityDissipation: CONFIG.VELOCITY_DISSIPATION,
        dyeDissipation: CONFIG.DYE_DISSIPATION,
        displaceGain: CONFIG.DISPLACE_GAIN,
        displaceMax: CONFIG.DISPLACE_MAX,
        inkAlpha: look?.inkAlpha ?? CONFIG.INK_ALPHA,
        bloom: look?.bloom ?? CONFIG.BLOOM,
        sheen: look?.sheen ?? CONFIG.SHEEN,
        colorA: CONFIG.COLOR_A,
        colorB: CONFIG.COLOR_B,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once, like CONFIG
    []
  );
  // the look can change while the fluid runs (SiteFluid eases it as a
  // dark footer scrolls in): applied straight to the ink layer's uniforms
  const inkAlpha = look?.inkAlpha ?? CONFIG.INK_ALPHA;
  const bloom = look?.bloom ?? CONFIG.BLOOM;
  const sheen = look?.sheen ?? CONFIG.SHEEN;
  // tint: a look may carry its own ink colours (a festival's); else white
  const colorA = look?.colorA ?? CONFIG.COLOR_A;
  const colorB = look?.colorB ?? CONFIG.COLOR_B;
  useEffect(() => {
    fluid.setLook({ inkAlpha, bloom, sheen, colorA, colorB });
    invalidate();
  }, [fluid, inkAlpha, bloom, sheen, colorA, colorB, invalidate]);
  const reveal = useMemo(() => createReveal(root, TEXTS.length), [root]);
  const pointer = useRef(null);
  if (pointer.current === null) pointer.current = resetPointer({});
  // fixed pool: the frame loop fills it instead of allocating splats
  const splats = useRef(null);
  if (splats.current === null) {
    splats.current = Array.from({ length: CONFIG.MAX_SPLATS }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, radius: 0, a: 0, b: 0,
    }));
  }
  const warmed = useRef(false);
  // the first step after (re)initialising uses a nominal frame: the clock's
  // first delta spans canvas creation and set-up, not a real frame
  const fresh = useRef(true);
  // whether the previous frame asked for this one. With frameloop="demand"
  // the loop sleeps once the fluid settles, and the next frame's delta is
  // then the whole idle gap - not a long frame to catch up on
  const looping = useRef(false);

  const simHeight = tablet ? CONFIG.SIM_HEIGHT_TABLET : CONFIG.SIM_HEIGHT_DESKTOP;
  const iterations = tablet
    ? CONFIG.PRESSURE_ITERATIONS_TABLET
    : CONFIG.PRESSURE_ITERATIONS_DESKTOP;

  useEffect(() => {
    let cancelled = false;
    // every mount (including a Strict Mode re-run, which reuses the memoised
    // fluid and these refs) starts from the same neutral state
    resetPointer(pointer.current);
    warmed.current = false;
    fresh.current = true;
    looping.current = false;
    // without its ink the simulation still runs: it drives the text and
    // note warping, while a shared layer elsewhere draws the ink
    if (ink) scene.add(fluid.displayMesh);
    fluid.warm(gl).then(() => {
      if (cancelled) return;
      warmed.current = true;
      invalidate();
    });
    return () => {
      cancelled = true;
      warmed.current = false;
      scene.remove(fluid.displayMesh);
      fluid.dispose();
    };
  }, [scene, fluid, gl, invalidate, ink]);

  useEffect(() => () => reveal.reset(), [reveal]);

  useEffect(() => {
    // a zero-sized first layout would give an infinite aspect / texel size
    if (size.width < 1 || size.height < 1) return;
    const simW = Math.max(2, Math.round((simHeight * size.width) / size.height));
    if (fluid.resize(gl, simW, simHeight)) {
      // fresh buffers: re-seed the brush rather than streak across the reset
      pointer.current.init = false;
      fresh.current = true;
    }
    fluid.textUniforms.size.value.set(size.width, size.height);
    invalidate();
  }, [fluid, gl, simHeight, size.width, size.height, invalidate]);

  useEffect(() => {
    const p = pointer.current;
    function onMove(event) {
      if (event.pointerType === "touch") return;
      const rect = root.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      p.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      p.tx = x;
      p.ty = y;
      if (p.inside && p.visible) {
        p.activeUntil = performance.now() + CONFIG.SETTLE_MS;
        invalidate();
      }
    }
    function onLeave() {
      p.inside = false;
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    const observer = new IntersectionObserver(([entry]) => {
      p.visible = entry.isIntersecting;
      if (p.visible) invalidate();
    });
    observer.observe(root);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      observer.disconnect();
    };
  }, [root, invalidate]);

  useFrame((state, delta) => {
    const p = pointer.current;
    const { width, height } = state.size;
    // a long frame (power saving, throttled GPU, busy tab) must still move
    // the fluid by the real elapsed time, so the step is only capped well
    // above 30fps - the semi-Lagrangian advection stays stable at that size
    // Waking from sleep used to take that gap as a 1/12s frame: 5x the
    // normal force and ink in one splat, and the brush lunging 74% of the
    // way to the pointer - a burst at the start of every stroke begun after
    // the pointer had rested (the very first one after load included).
    const resumed = !looping.current;
    const dt = fresh.current || resumed ? 1 / 60 : Math.min(delta, 1 / 12) || 1 / 60;
    // the brush was frozen while asleep (or while the hero was scrolled
    // away), so it restarts from the pointer instead of streaking to it
    if (resumed) p.init = false;
    // splats inject force and ink once per frame, so what one frame adds is
    // scaled by its length relative to a 60fps frame: the same pointer motion
    // then puts in the same total force and ink at any frame rate
    const frameScale = dt * 60;
    const list = splats.current;
    let count = 0;
    const ready =
      warmed.current && fluid.state.vel !== null && width >= 1 && height >= 1;

    if (p.inside) {
      if (!p.init) {
        // entering (or re-entering) the hero: no jump, no streak
        p.bx = p.tx;
        p.by = p.ty;
        p.svx = p.svy = 0;
        p.init = true;
      } else {
        const prevX = p.bx;
        const prevY = p.by;
        const k = 1 - Math.exp(-dt * CONFIG.BRUSH_STIFFNESS);
        const nx = p.bx + (p.tx - p.bx) * k;
        const ny = p.by + (p.ty - p.by) * k;
        const kv = 1 - Math.exp(-dt * CONFIG.VELOCITY_SMOOTHING);
        p.svx += ((nx - p.bx) / dt - p.svx) * kv;
        p.svy += (-(ny - p.by) / dt - p.svy) * kv;
        p.bx = nx;
        p.by = ny;

        let speed = Math.hypot(p.svx, p.svy);
        if (speed > CONFIG.MAX_SPEED) {
          const s = CONFIG.MAX_SPEED / speed;
          p.svx *= s;
          p.svy *= s;
          speed = CONFIG.MAX_SPEED;
        }
        if (ready && speed > CONFIG.MIN_SPEED) {
          const cellPx = height / fluid.state.simH;
          const norm = Math.min(speed / 1800, 1);
          const ink = CONFIG.INK_BASE + norm * CONFIG.INK_SPEED;
          p.phase += (speed * dt) / CONFIG.COLOR_CYCLE_PX;
          const towardB = 0.5 - 0.5 * Math.cos(2 * Math.PI * p.phase);
          const radius = CONFIG.SPLAT_RADIUS + norm * CONFIG.SPLAT_RADIUS_SPEED;
          // on a long frame the brush has travelled far: lay the splat
          // along that path instead of dropping one blob at the end of it,
          // so slow frames don't leave a dotted, weaker trail
          const travel = Math.hypot(p.bx - prevX, p.by - prevY);
          const steps =
            frameScale > 1.5
              ? Math.min(
                  CONFIG.MAX_SPLATS,
                  Math.max(1, Math.ceil(travel / (Math.sqrt(radius) * height * 1.2)))
                )
              : 1;
          const share = frameScale / steps;
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const s = list[count++];
            s.x = (prevX + (p.bx - prevX) * t) / width;
            s.y = 1 - (prevY + (p.by - prevY) * t) / height;
            s.vx = (p.svx / cellPx) * CONFIG.SPLAT_FORCE * share;
            s.vy = (p.svy / cellPx) * CONFIG.SPLAT_FORCE * share;
            s.radius = radius;
            s.a = ink * (1 - towardB) * share;
            s.b = ink * towardB * share;
          }
        }
      }
    } else {
      p.init = false;
    }

    if (ready) {
      fresh.current = false;
      fluid.step(
        state.gl,
        dt,
        list,
        count,
        width / height,
        height / fluid.state.simH,
        iterations
      );
    }

    looping.current = p.visible && performance.now() < p.activeUntil;
    if (looping.current) state.invalidate();
  });

  return (
    <>
      {TEXTS.map((t) => (
        <HeroText
          key={t.selector}
          root={root}
          selector={t.selector}
          font={t.font}
          textUniforms={fluid.textUniforms}
          reveal={reveal}
        />
      ))}
      <HeroNotes root={root} textUniforms={fluid.textUniforms} pointer={pointer} />
    </>
  );
}

// Only cheap checks here. The old version created a throw-away WebGL2
// context just to test support, which stalled the main thread for its whole
// creation on mount - the real canvas is the only context this hero needs,
// and if it cannot be created the boundary below leaves the plain hero.
function prefersFluid() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  // touch / coarse-pointer devices keep the plain hero
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
  return typeof window.WebGL2RenderingContext !== "undefined";
}

class FluidBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// The hero fluid a touch softer, for dark pages (Work, About): there its
// white halo reads as a glow. Only the halo and ink opacity drop (hero:
// 0.14 / 0.36); the motion, colour and glossy sheen stay exactly the hero's.
export const HERO_FLUID_LOOK = { inkAlpha: CONFIG.INK_ALPHA, bloom: CONFIG.BLOOM, sheen: CONFIG.SHEEN };
export const DARK_FLUID_LOOK = { ...HERO_FLUID_LOOK, bloom: 0.085, inkAlpha: 0.3 };

// `look` optionally overrides the ink layer's strengths ({ inkAlpha,
// bloom, sheen } and optionally colorA / colorB) for another page; the hero itself uses CONFIG as is.
// `ink={false}` keeps the text/note warping but leaves the ink to a
// shared layer (the home page draws one across all its sections).
export default function HeroFluid({ look, ink = true } = {}) {
  const wrapRef = useRef(null);
  const [state, setState] = useState({ enabled: false, root: null, tablet: false });

  useEffect(() => {
    if (!prefersFluid()) return undefined;
    const root = wrapRef.current?.parentElement;
    if (!root) return undefined;
    // prefersFluid() already excludes reduced-motion, and only those users
    // get the full-screen entry preloader's multi-second runtime as cover -
    // so starting the renderer/simulation/text set-up immediately here (not
    // deferred to browser idle) is what lets it be ready by the moment the
    // preloader hands off, per the reveal below, without ever blocking a
    // menu/click on a page the preloader isn't also covering.
    setState({ enabled: true, root, tablet: window.innerWidth < 1024 });
    const onResize = () =>
      setState((prev) => {
        const tablet = window.innerWidth < 1024;
        return prev.enabled && prev.tablet !== tablet ? { ...prev, tablet } : prev;
      });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="hero-fluid" ref={wrapRef} aria-hidden="true">
      {state.enabled && (
        <FluidBoundary>
        <Canvas
          orthographic
          flat
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ position: [0, 0, 100], near: 0.1, far: 200, zoom: 1 }}
          gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        >
          <Scene root={state.root} tablet={state.tablet} look={look} ink={ink} />
        </Canvas>
        </FluidBoundary>
      )}
    </div>
  );
}
