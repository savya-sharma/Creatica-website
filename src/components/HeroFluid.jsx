"use client";

import { Component, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text } from "troika-three-text";

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

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
  }
`;

const ADVECT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  uniform float uDt;
  uniform float uDissipation;
  void main() {
    vec2 v = texture2D(uVelocity, vUv).xy;
    vec4 r = texture2D(uSource, vUv - uDt * v * uTexel);
    gl_FragColor = r / (1.0 + uDissipation * uDt);
  }
`;

const SPLAT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTarget;
  uniform vec2 uPoint;
  uniform vec4 uColor;
  uniform float uRadius;
  uniform float uAspect;
  void main() {
    vec2 d = vUv - uPoint;
    d.x *= uAspect;
    gl_FragColor = texture2D(uTarget, vUv) + uColor * exp(-dot(d, d) / uRadius);
  }
`;

const DIVERGENCE = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  void main() {
    float l = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
    float t = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
    gl_FragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
  }
`;

const PRESSURE = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 uTexel;
  void main() {
    float l = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    float div = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((l + r + b + t - div) * 0.25, 0.0, 0.0, 1.0);
  }
`;

const GRADIENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  void main() {
    float l = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    vec2 v = texture2D(uVelocity, vUv).xy - 0.5 * vec2(r - l, t - b);
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;

// zw of the dye texture is the text displacement (px): it integrates the
// flow, is carried along by it, and decays with the ink, which is what lets
// the text drift with the liquid and then ease back to rest
const INTEGRATE = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uDye;
  uniform sampler2D uVelocity;
  uniform float uGain;
  uniform float uDt;
  void main() {
    vec4 d = texture2D(uDye, vUv);
    d.zw += texture2D(uVelocity, vUv).xy * uGain * uDt;
    gl_FragColor = d;
  }
`;

const DISPLAY = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uDye;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec2 uTexel;
  uniform float uAlpha;
  uniform float uBloom;
  uniform float uSheen;

  float density(vec2 uv) {
    vec2 ab = max(texture2D(uDye, uv).xy, 0.0);
    return ab.x + ab.y;
  }

  void main() {
    vec2 ab = max(texture2D(uDye, vUv).xy, 0.0);
    float d = ab.x + ab.y;

    // cheap bloom: two rings of taps around the pixel spread the ink out
    // into a soft halo
    float halo = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982;
      vec2 dir = vec2(cos(a), sin(a));
      halo += density(vUv + dir * uTexel * 3.0);
      halo += density(vUv + dir * uTexel * 7.0);
    }
    halo /= 16.0;

    // sheen: a soft specular streak from the ink's own surface slope
    vec2 grad = vec2(
      density(vUv + vec2(uTexel.x, 0.0)) - density(vUv - vec2(uTexel.x, 0.0)),
      density(vUv + vec2(0.0, uTexel.y)) - density(vUv - vec2(0.0, uTexel.y))
    );
    vec3 n = normalize(vec3(-grad * 6.0, 0.35));
    float spec = pow(max(dot(n, normalize(vec3(-0.5, 0.7, 0.55))), 0.0), 18.0);

    float body = 1.0 - exp(-d * 2.2);
    float glow = 1.0 - exp(-halo * 2.6);
    float a = body * uAlpha + glow * uBloom + spec * uSheen * body;
    a = max(a - 0.004, 0.0);

    vec3 tint = mix(uColorA, uColorB, ab.y / max(d, 0.0001));
    vec3 col = mix(tint, vec3(1.0), clamp(spec * 0.8 + glow * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(col, min(a, 0.85));
  }
`;

function makeTarget(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
}

function makePair(w, h) {
  const pair = {
    read: makeTarget(w, h),
    write: makeTarget(w, h),
    swap() {
      const t = pair.read;
      pair.read = pair.write;
      pair.write = t;
    },
    dispose() {
      pair.read.dispose();
      pair.write.dispose();
    },
  };
  return pair;
}

function createFluid() {
  const shader = (fragmentShader, uniforms) =>
    new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
  const tex = () => ({ value: null });
  const texel = () => ({ value: new THREE.Vector2(1, 1) });

  const mats = {
    advect: shader(ADVECT, {
      uVelocity: tex(),
      uSource: tex(),
      uTexel: texel(),
      uDt: { value: 0 },
      uDissipation: { value: 0 },
    }),
    splat: shader(SPLAT, {
      uTarget: tex(),
      uPoint: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Vector4() },
      uRadius: { value: 0.002 },
      uAspect: { value: 1 },
    }),
    divergence: shader(DIVERGENCE, { uVelocity: tex(), uTexel: texel() }),
    pressure: shader(PRESSURE, {
      uPressure: tex(),
      uDivergence: tex(),
      uTexel: texel(),
    }),
    gradient: shader(GRADIENT, {
      uPressure: tex(),
      uVelocity: tex(),
      uTexel: texel(),
    }),
    integrate: shader(INTEGRATE, {
      uDye: tex(),
      uVelocity: tex(),
      uGain: { value: 0 },
      uDt: { value: 0 },
    }),
  };

  const display = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: DISPLAY,
    uniforms: {
      uDye: tex(),
      uColorA: { value: new THREE.Vector3() },
      uColorB: { value: new THREE.Vector3() },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uAlpha: { value: CONFIG.INK_ALPHA },
      uBloom: { value: CONFIG.BLOOM },
      uSheen: { value: CONFIG.SHEEN },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  // the ink layer writes sRGB values straight to the canvas
  const colA = new THREE.Color(CONFIG.COLOR_A);
  const colB = new THREE.Color(CONFIG.COLOR_B);
  colA.convertLinearToSRGB();
  colB.convertLinearToSRGB();
  display.uniforms.uColorA.value.set(colA.r, colA.g, colA.b);
  display.uniforms.uColorB.value.set(colB.r, colB.g, colB.b);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const passQuad = new THREE.Mesh(geometry, mats.advect);
  passQuad.frustumCulled = false;
  const passScene = new THREE.Scene();
  passScene.add(passQuad);
  const passCamera = new THREE.Camera();

  const displayMesh = new THREE.Mesh(geometry, display);
  displayMesh.frustumCulled = false;
  displayMesh.renderOrder = 0;

  const state = { simW: 0, simH: 0, vel: null, dye: null, pressure: null, divergence: null };
  // shared with the text materials
  const textUniforms = {
    disp: { value: null },
    size: { value: new THREE.Vector2(1, 1) },
    max: { value: CONFIG.DISPLACE_MAX },
  };

  const savedClear = new THREE.Color();
  function clearTargets(renderer, targets) {
    const previousTarget = renderer.getRenderTarget();
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(savedClear);
    renderer.setClearColor(0x000000, 0);
    for (const target of targets) {
      renderer.setRenderTarget(target);
      renderer.clear(true, false, false);
    }
    renderer.setClearColor(savedClear, previousAlpha);
    renderer.setRenderTarget(previousTarget);
  }

  // Allocates every buffer and clears it to the neutral state right away, so
  // no pass (and no visible frame) ever samples an unallocated target or a
  // null texture - three binds nothing for null, which WebGL samples as
  // (0,0,0,1), i.e. a 1px text displacement until the first step.
  function resize(renderer, simW, simH) {
    if (state.simW === simW && state.simH === simH) return false;
    state.vel?.dispose();
    state.dye?.dispose();
    state.pressure?.dispose();
    state.divergence?.dispose();
    state.simW = simW;
    state.simH = simH;
    state.vel = makePair(simW, simH);
    state.dye = makePair(simW, simH);
    state.pressure = makePair(simW, simH);
    state.divergence = makeTarget(simW, simH);
    clearTargets(renderer, [
      state.vel.read, state.vel.write,
      state.dye.read, state.dye.write,
      state.pressure.read, state.pressure.write,
      state.divergence,
    ]);
    display.uniforms.uDye.value = state.dye.read.texture;
    textUniforms.disp.value = state.dye.read.texture;
    display.uniforms.uTexel.value.set(1 / simW, 1 / simH);
    for (const m of [mats.advect, mats.divergence, mats.pressure, mats.gradient]) {
      m.uniforms.uTexel.value.set(1 / simW, 1 / simH);
    }
    return true;
  }

  function run(renderer, material, target) {
    passQuad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(passScene, passCamera);
  }

  function splat(renderer, pair, x, y, r, g, radius, aspect) {
    const u = mats.splat.uniforms;
    u.uTarget.value = pair.read.texture;
    u.uPoint.value.set(x, y);
    u.uColor.value.set(r, g, 0, 0);
    u.uRadius.value = radius;
    u.uAspect.value = aspect;
    run(renderer, mats.splat, pair.write);
    pair.swap();
  }

  function step(renderer, dt, splats, splatCount, aspect, cellPx, iterations) {
    const { vel, dye, pressure, divergence } = state;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    let u = mats.advect.uniforms;
    u.uVelocity.value = vel.read.texture;
    u.uSource.value = vel.read.texture;
    u.uDt.value = dt;
    u.uDissipation.value = CONFIG.VELOCITY_DISSIPATION;
    run(renderer, mats.advect, vel.write);
    vel.swap();

    for (let i = 0; i < splatCount; i++) {
      const s = splats[i];
      splat(renderer, vel, s.x, s.y, s.vx, s.vy, s.radius, aspect);
      splat(renderer, dye, s.x, s.y, s.a, s.b, s.radius, aspect);
    }

    mats.divergence.uniforms.uVelocity.value = vel.read.texture;
    run(renderer, mats.divergence, divergence);

    mats.pressure.uniforms.uDivergence.value = divergence.texture;
    for (let i = 0; i < iterations; i++) {
      mats.pressure.uniforms.uPressure.value = pressure.read.texture;
      run(renderer, mats.pressure, pressure.write);
      pressure.swap();
    }

    mats.gradient.uniforms.uPressure.value = pressure.read.texture;
    mats.gradient.uniforms.uVelocity.value = vel.read.texture;
    run(renderer, mats.gradient, vel.write);
    vel.swap();

    u = mats.advect.uniforms;
    u.uVelocity.value = vel.read.texture;
    u.uSource.value = dye.read.texture;
    u.uDissipation.value = CONFIG.DYE_DISSIPATION;
    run(renderer, mats.advect, dye.write);
    dye.swap();

    u = mats.integrate.uniforms;
    u.uDye.value = dye.read.texture;
    u.uVelocity.value = vel.read.texture;
    u.uGain.value = cellPx * CONFIG.DISPLACE_GAIN * CONFIG.DYE_DISSIPATION;
    u.uDt.value = dt;
    run(renderer, mats.integrate, dye.write);
    dye.swap();

    renderer.autoClear = previousAutoClear;
    renderer.setRenderTarget(previousTarget);

    display.uniforms.uDye.value = dye.read.texture;
    textUniforms.disp.value = dye.read.texture;
  }

  function dispose() {
    state.vel?.dispose();
    state.dye?.dispose();
    state.pressure?.dispose();
    state.divergence?.dispose();
    state.vel = state.dye = state.pressure = state.divergence = null;
    state.simW = state.simH = 0;
    display.uniforms.uDye.value = null;
    textUniforms.disp.value = null;
    Object.values(mats).forEach((m) => m.dispose());
    display.dispose();
    geometry.dispose();
  }

  // Compiling ~8 programs lazily inside the first frames blocks the main
  // thread on each link. compileAsync uses KHR_parallel_shader_compile where
  // available, so the driver compiles them all in the background instead.
  // three keys each program on the colour space of the target bound while it
  // is built (linear for a render target, sRGB for the canvas), so the pass
  // materials must be compiled with a render target bound: compiled against
  // the canvas they never match, and the first step() used to link all six
  // synchronously - a long stall on a first visit, before the GPU program
  // cache is warm, that the next frame turned into a jump of the brush.
  function warm(renderer) {
    const sceneOf = (materials) => {
      const s = new THREE.Scene();
      for (const material of materials) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        s.add(mesh);
      }
      return s;
    };
    const passScene = sceneOf(Object.values(mats));
    const screenScene = sceneOf([display]);
    const probe = makeTarget(1, 1);
    const previousTarget = renderer.getRenderTarget();
    let pending;
    try {
      renderer.setRenderTarget(probe);
      const passes = renderer.compileAsync(passScene, passCamera);
      renderer.setRenderTarget(null);
      const screen = renderer.compileAsync(screenScene, passCamera);
      pending = Promise.all([passes, screen]);
    } catch (error) {
      pending = Promise.reject(error);
    } finally {
      renderer.setRenderTarget(previousTarget);
    }
    return pending
      .catch(() => {})
      .finally(() => {
        passScene.clear();
        screenScene.clear();
        probe.dispose();
      });
  }

  return { resize, step, warm, dispose, displayMesh, textUniforms, state };
}

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

  const fluid = useMemo(() => createFluid(), []);
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
