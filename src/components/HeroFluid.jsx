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

  function resize(simW, simH) {
    if (state.simW === simW && state.simH === simH) return;
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
    display.uniforms.uTexel.value.set(1 / simW, 1 / simH);
    for (const m of [mats.advect, mats.divergence, mats.pressure, mats.gradient]) {
      m.uniforms.uTexel.value.set(1 / simW, 1 / simH);
    }
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

  function step(renderer, dt, splats, aspect, cellPx, iterations) {
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

    for (const s of splats) {
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
    Object.values(mats).forEach((m) => m.dispose());
    display.dispose();
    geometry.dispose();
  }

  // Compiling ~8 programs lazily inside the first frames blocks the main
  // thread on each link. compileAsync uses KHR_parallel_shader_compile where
  // available, so the driver compiles them all in the background instead.
  function warm(renderer) {
    const warmScene = new THREE.Scene();
    for (const material of [...Object.values(mats), display]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      warmScene.add(mesh);
    }
    return renderer
      .compileAsync(warmScene, passCamera)
      .catch(() => {})
      .finally(() => warmScene.clear());
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

function HeroText({ root, selector, font, textUniforms, onSynced }) {
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
    scene.add(text);

    let disposed = false;
    function measure() {
      if (disposed) return;
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
        onSynced();
        invalidate();
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
    document.fonts.ready.then(measure);
    measure();

    return () => {
      disposed = true;
      measureRef.current = null;
      observer.disconnect();
      scene.remove(text);
      text.dispose();
      material.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, selector, font, scene, textUniforms]);

  useEffect(() => {
    measureRef.current?.();
  }, [size.width, size.height]);

  return null;
}

const TEXTS = [
  { selector: ".hero-heading-lead", font: "/fonts/AppleGaramond-Italic.ttf" },
  { selector: ".hero-heading", font: "/fonts/AppleRegular.ttf" },
];

function Scene({ root, tablet }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const fluid = useMemo(() => createFluid(), []);
  const pointer = useRef({
    tx: 0, ty: 0, inside: false, init: false,
    bx: 0, by: 0, svx: 0, svy: 0, phase: 0,
    activeUntil: 0, visible: true,
  });
  const splats = useRef([]);
  const warmed = useRef(false);
  const syncedCount = useRef(0);

  const simHeight = tablet ? CONFIG.SIM_HEIGHT_TABLET : CONFIG.SIM_HEIGHT_DESKTOP;
  const iterations = tablet
    ? CONFIG.PRESSURE_ITERATIONS_TABLET
    : CONFIG.PRESSURE_ITERATIONS_DESKTOP;

  useEffect(() => {
    let cancelled = false;
    scene.add(fluid.displayMesh);
    fluid.warm(gl).then(() => {
      if (cancelled) return;
      warmed.current = true;
      invalidate();
    });
    return () => {
      cancelled = true;
      scene.remove(fluid.displayMesh);
      fluid.dispose();
    };
  }, [scene, fluid, gl, invalidate]);

  useEffect(() => {
    const simW = Math.max(2, Math.round((simHeight * size.width) / Math.max(size.height, 1)));
    fluid.resize(simW, simHeight);
    fluid.textUniforms.size.value.set(size.width, size.height);
    invalidate();
  }, [fluid, simHeight, size.width, size.height, invalidate]);

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
    const dt = Math.min(delta, 1 / 12) || 1 / 60;
    // splats inject force and ink once per frame, so what one frame adds is
    // scaled by its length relative to a 60fps frame: the same pointer motion
    // then puts in the same total force and ink at any frame rate
    const frameScale = dt * 60;
    const list = splats.current;
    list.length = 0;

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

        const speed = Math.hypot(p.svx, p.svy);
        if (speed > CONFIG.MIN_SPEED) {
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
              ? Math.min(8, Math.max(1, Math.ceil(travel / (Math.sqrt(radius) * height * 1.2))))
              : 1;
          const share = frameScale / steps;
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            list.push({
              x: (prevX + (p.bx - prevX) * t) / width,
              y: 1 - (prevY + (p.by - prevY) * t) / height,
              vx: (p.svx / cellPx) * CONFIG.SPLAT_FORCE * share,
              vy: (p.svy / cellPx) * CONFIG.SPLAT_FORCE * share,
              radius,
              a: ink * (1 - towardB) * share,
              b: ink * towardB * share,
            });
          }
        }
      }
    } else {
      p.init = false;
    }

    if (warmed.current && fluid.state.vel) {
      fluid.step(
        state.gl,
        dt,
        list,
        width / height,
        height / fluid.state.simH,
        iterations
      );
    }

    if (p.visible && performance.now() < p.activeUntil) state.invalidate();
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
          onSynced={() => {
            syncedCount.current = Math.min(syncedCount.current + 1, TEXTS.length);
            if (syncedCount.current >= TEXTS.length) {
              root.classList.add("hero-troika-ready");
            }
          }}
        />
      ))}
      <GLCleanup gl={gl} root={root} />
    </>
  );
}

// hand the hero back to its DOM text if the canvas goes away
function GLCleanup({ root }) {
  useEffect(() => () => root.classList.remove("hero-troika-ready"), [root]);
  return null;
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
    const onResize = () => setState((prev) => (prev.enabled ? { ...prev, tablet: window.innerWidth < 1024 } : prev));
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
