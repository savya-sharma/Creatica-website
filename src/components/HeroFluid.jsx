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
  VELOCITY_DISSIPATION: 1.5,
  DYE_DISSIPATION: 1.1,
  // brush follows the pointer with inertia instead of snapping to it
  BRUSH_STIFFNESS: 16,
  VELOCITY_SMOOTHING: 10,
  MIN_SPEED: 40,
  // safety cap on the brush velocity (px/s) - far above any real stroke, it
  // only stops a hitch from turning into one oversized impulse
  MAX_SPEED: 6000,
  MAX_SPLATS: 8,
  SPLAT_FORCE: 0.55,
  SPLAT_RADIUS: 0.001,
  SPLAT_RADIUS_SPEED: 0.002,
  INK_BASE: 0.05,
  INK_SPEED: 0.2,
  COLOR_CYCLE_PX: 500,
  COLOR_A: "#ffffff",
  COLOR_B: "#ffffff",
  INK_ALPHA: 0.36,
  // soft halo around the ink, and the glossy highlight riding its surface
  BLOOM: 0.22,
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

// tx/ty is the raw pointer, bx/by the brush; the brush is only ever seeded
// from a real pointer sample (see useFrame), never from this origin
function resetPointer(p) {
  return Object.assign(p, {
    tx: 0, ty: 0, inside: false, init: false,
    bx: 0, by: 0, svx: 0, svy: 0, phase: 0,
    activeUntil: 0, visible: true,
  });
}

function Scene({ root, tablet }) {
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
        inkAlpha: CONFIG.INK_ALPHA,
        bloom: CONFIG.BLOOM,
        sheen: CONFIG.SHEEN,
        colorA: CONFIG.COLOR_A,
        colorB: CONFIG.COLOR_B,
      }),
    []
  );
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
    scene.add(fluid.displayMesh);
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
  }, [scene, fluid, gl, invalidate]);

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

export default function HeroFluid() {
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
          <Scene root={state.root} tablet={state.tablet} />
        </Canvas>
        </FluidBoundary>
      )}
    </div>
  );
}
