"use client";

import { Component, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createFluid } from "@/lib/stableFluid";

// The Contact page's side image drawn through the same stable-fluids engine
// as the Hero (lib/stableFluid.js): the pointer stirs the velocity field, the
// field integrates into a displacement map, and the image is sampled through
// that map - so its own surface bends and flows, then eases back to rest. No
// ink is laid down, so nothing is drawn over the image. The <img> underneath
// stays the real element (alt text, layout, fallback); this canvas only
// covers it once its first frame is ready.

const CONFIG = {
  SIM_HEIGHT_FINE: 128,
  SIM_HEIGHT_COARSE: 64,
  PRESSURE_ITERATIONS_FINE: 12,
  PRESSURE_ITERATIONS_COARSE: 6,
  VELOCITY_DISSIPATION: 1.1,
  // how fast the displacement decays, i.e. how long the surface takes to settle
  DYE_DISSIPATION: 0.9,
  BRUSH_STIFFNESS: 14,
  VELOCITY_SMOOTHING: 9,
  MIN_SPEED: 20,
  MAX_SPEED: 5000,
  MAX_SPLATS: 6,
  SPLAT_FORCE: 0.45,
  SPLAT_RADIUS: 0.0015,
  SPLAT_RADIUS_SPEED: 0.003,
  // px of drift per px/s of flow, and the soft cap that keeps the image
  // recognisable however hard the stroke
  DISPLACE_GAIN: 0.05,
  DISPLACE_MAX: 22,
  // strength of the soft light the warped surface catches
  REFRACTION: 0.012,
  SETTLE_MS: 4000,
  // the bloom on the image's highlights: where it starts (luma), how softly
  // it ramps in above that, and how strongly it is screened over the image
  BLOOM_THRESHOLD: 0.78,
  BLOOM_KNEE: 0.18,
  BLOOM_STRENGTH: 0.75,
};

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
  }
`;

const IMAGE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uImage;
  uniform sampler2D uBloom;
  uniform float uBloomStrength;
  uniform sampler2D uDisp;
  uniform vec2 uSize;
  uniform vec2 uCover;
  uniform vec2 uTexel;
  uniform float uMax;
  uniform float uRefraction;

  vec2 disp(vec2 uv) {
    vec2 d = texture2D(uDisp, uv).zw;
    return uMax * tanh(d / uMax);
  }

  void main() {
    vec2 d = disp(vUv);
    // sample from upstream: the image content is carried along the flow
    vec2 uv = vUv - d / uSize;
    // object-fit: cover, centred - the same crop as the <img> underneath
    vec2 imageUv = (uv - 0.5) * uCover + 0.5;
    vec3 color = texture2D(uImage, imageUv).rgb;

    // the bloom is in image space too, so it bends with the image; screened
    // on, so highlights glow softly instead of clipping
    vec3 bloom = texture2D(uBloom, imageUv).rgb * uBloomStrength;
    color = 1.0 - (1.0 - color) * (1.0 - bloom);

    // a faint light on the warped surface, from the displacement's own slope,
    // so the bend reads as liquid refraction rather than a flat smear. Taken
    // over two cells, so it stays a soft sheen and never bands
    vec2 tx = vec2(uTexel.x * 2.0, 0.0);
    vec2 ty = vec2(0.0, uTexel.y * 2.0);
    vec2 slope = vec2(
      length(disp(vUv + tx)) - length(disp(vUv - tx)),
      length(disp(vUv + ty)) - length(disp(vUv - ty))
    ) / uMax;
    color += dot(slope, vec2(-0.6, 0.8)) * uRefraction * 8.0;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

// -- bloom ------------------------------------------------------------------
// Built once per image, on the GPU: a soft-knee bright pass at half
// resolution, then that light blurred at three scales (1/2, 1/4, 1/8) and
// summed - the wide levels give the long, gentle falloff of a lens, the
// tight one keeps the glow hugging its source. The image never changes, so
// the result is just a texture the image pass samples: no cost per frame.

const BRIGHT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform float uThreshold;
  uniform float uKnee;
  void main() {
    vec3 c = texture2D(uSource, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + uKnee, l), 1.0);
  }
`;

// 9-tap gaussian in 5 fetches (linear-sampling offsets), one axis per pass
const BLUR_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform vec2 uStep;
  void main() {
    vec3 c = texture2D(uSource, vUv).rgb * 0.2270270270;
    c += texture2D(uSource, vUv + uStep * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(uSource, vUv - uStep * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(uSource, vUv + uStep * 3.2307692308).rgb * 0.0702702703;
    c += texture2D(uSource, vUv - uStep * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const COMBINE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uLevel0;
  uniform sampler2D uLevel1;
  uniform sampler2D uLevel2;
  void main() {
    vec3 c = texture2D(uLevel0, vUv).rgb * 0.45
      + texture2D(uLevel1, vUv).rgb * 0.35
      + texture2D(uLevel2, vUv).rgb * 0.3;
    gl_FragColor = vec4(c, 1.0);
  }
`;

function bloomTarget(w, h) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
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

function buildBloom(renderer, texture) {
  const w = Math.round(texture.image.width / 2);
  const h = Math.round(texture.image.height / 2);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const quad = new THREE.Mesh(geometry);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();
  const pass = (fragmentShader, uniforms) =>
    new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
  const bright = pass(BRIGHT_FRAG, {
    uSource: { value: texture },
    uThreshold: { value: CONFIG.BLOOM_THRESHOLD },
    uKnee: { value: CONFIG.BLOOM_KNEE },
  });
  const blur = pass(BLUR_FRAG, {
    uSource: { value: null },
    uStep: { value: new THREE.Vector2() },
  });
  const combine = pass(COMBINE_FRAG, {
    uLevel0: { value: null },
    uLevel1: { value: null },
    uLevel2: { value: null },
  });

  const previousTarget = renderer.getRenderTarget();
  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  const draw = (material, target) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  };

  const temporary = [];
  const keep = (target) => {
    temporary.push(target);
    return target;
  };

  let source = keep(bloomTarget(w, h));
  draw(bright, source);

  // each level: downsample into its size, then blur it there
  const levels = [1, 2, 4].map((scale) => {
    const lw = Math.round(w / scale);
    const lh = Math.round(h / scale);
    const a = keep(bloomTarget(lw, lh));
    const b = keep(bloomTarget(lw, lh));
    blur.uniforms.uSource.value = source.texture;
    blur.uniforms.uStep.value.set(1 / lw, 0);
    draw(blur, a);
    blur.uniforms.uSource.value = a.texture;
    blur.uniforms.uStep.value.set(0, 1 / lh);
    draw(blur, b);
    // a second, wider round for a smooth, round falloff
    blur.uniforms.uSource.value = b.texture;
    blur.uniforms.uStep.value.set(2 / lw, 0);
    draw(blur, a);
    blur.uniforms.uSource.value = a.texture;
    blur.uniforms.uStep.value.set(0, 2 / lh);
    draw(blur, b);
    source = b;
    return b;
  });

  const result = bloomTarget(w, h);
  combine.uniforms.uLevel0.value = levels[0].texture;
  combine.uniforms.uLevel1.value = levels[1].texture;
  combine.uniforms.uLevel2.value = levels[2].texture;
  draw(combine, result);

  renderer.setRenderTarget(previousTarget);
  renderer.autoClear = previousAutoClear;
  temporary.forEach((target) => target.dispose());
  [bright, blur, combine].forEach((material) => material.dispose());
  geometry.dispose();
  return result;
}

function resetPointer(p) {
  return Object.assign(p, {
    tx: 0, ty: 0, inside: false, init: false,
    bx: 0, by: 0, svx: 0, svy: 0,
    activeUntil: 0, visible: true,
  });
}

function Scene({ root, src, coarse, onReady }) {
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
        // the ink layer is never drawn here
        inkAlpha: 0,
        bloom: 0,
        sheen: 0,
        colorA: "#ffffff",
        colorB: "#ffffff",
      }),
    []
  );

  const image = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: IMAGE_FRAG,
      uniforms: {
        uImage: { value: null },
        uBloom: { value: null },
        uBloomStrength: { value: CONFIG.BLOOM_STRENGTH },
        // the engine's own uniform object, kept pointing at the live field
        uDisp: fluid.textUniforms.disp,
        uSize: { value: new THREE.Vector2(1, 1) },
        uCover: { value: new THREE.Vector2(1, 1) },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uMax: { value: CONFIG.DISPLACE_MAX },
        uRefraction: { value: CONFIG.REFRACTION },
      },
      depthTest: false,
      depthWrite: false,
    });
    const geometry = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { material, geometry, mesh, aspect: 1 };
  }, [fluid]);

  const pointer = useRef(null);
  if (pointer.current === null) pointer.current = resetPointer({});
  const splats = useRef(null);
  if (splats.current === null) {
    splats.current = Array.from({ length: CONFIG.MAX_SPLATS }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, radius: 0, a: 0, b: 0,
    }));
  }
  const warmed = useRef(false);
  const fresh = useRef(true);
  const looping = useRef(false);
  const shown = useRef(false);

  const simHeight = coarse ? CONFIG.SIM_HEIGHT_COARSE : CONFIG.SIM_HEIGHT_FINE;
  const iterations = coarse
    ? CONFIG.PRESSURE_ITERATIONS_COARSE
    : CONFIG.PRESSURE_ITERATIONS_FINE;

  // object-fit: cover against the canvas's current size
  function fitCover(width, height) {
    const canvasAspect = width / height;
    image.material.uniforms.uCover.value.set(
      canvasAspect > image.aspect ? 1 : canvasAspect / image.aspect,
      canvasAspect > image.aspect ? image.aspect / canvasAspect : 1
    );
  }

  useEffect(() => {
    let cancelled = false;
    resetPointer(pointer.current);
    warmed.current = false;
    fresh.current = true;
    looping.current = false;
    shown.current = false;
    scene.add(image.mesh);
    let bloom = null;

    const texture = new THREE.TextureLoader().load(src, (loaded) => {
      if (cancelled) return;
      // raw sRGB values in and out, exactly as the <img> paints them
      loaded.colorSpace = THREE.NoColorSpace;
      loaded.minFilter = THREE.LinearFilter;
      loaded.generateMipmaps = false;
      image.aspect = loaded.image.width / loaded.image.height;
      image.material.uniforms.uImage.value = loaded;
      bloom = buildBloom(gl, loaded);
      image.material.uniforms.uBloom.value = bloom.texture;
      fitCover(size.width, size.height);
      image.mesh.visible = true;
      invalidate();
    });

    fluid.warm(gl).then(() => {
      if (cancelled) return;
      warmed.current = true;
      invalidate();
    });

    return () => {
      cancelled = true;
      warmed.current = false;
      scene.remove(image.mesh);
      texture.dispose();
      bloom?.dispose();
      image.material.uniforms.uImage.value = null;
      image.material.uniforms.uBloom.value = null;
      image.material.dispose();
      image.geometry.dispose();
      fluid.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, fluid, image, gl, invalidate, src]);

  useEffect(() => {
    if (size.width < 1 || size.height < 1) return;
    const simW = Math.max(2, Math.round((simHeight * size.width) / size.height));
    if (fluid.resize(gl, simW, simHeight)) {
      pointer.current.init = false;
      fresh.current = true;
    }
    const u = image.material.uniforms;
    u.uSize.value.set(size.width, size.height);
    u.uTexel.value.set(1 / simW, 1 / simHeight);
    fitCover(size.width, size.height);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fluid, image, gl, simHeight, size.width, size.height, invalidate]);

  useEffect(() => {
    const p = pointer.current;
    function onMove(event) {
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
    // a touch that turns into a scroll ends the stroke
    window.addEventListener("pointercancel", onLeave, { passive: true });
    window.addEventListener("pointerup", onLeave, { passive: true });
    const observer = new IntersectionObserver(([entry]) => {
      p.visible = entry.isIntersecting;
      if (p.visible) invalidate();
    });
    observer.observe(root);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointercancel", onLeave);
      window.removeEventListener("pointerup", onLeave);
      observer.disconnect();
    };
  }, [root, invalidate]);

  useFrame((state, delta) => {
    const p = pointer.current;
    const { width, height } = state.size;
    // with frameloop="demand" a wake-up's delta is the whole idle gap
    const resumed = !looping.current;
    const dt = fresh.current || resumed ? 1 / 60 : Math.min(delta, 1 / 12) || 1 / 60;
    if (resumed) p.init = false;
    const frameScale = dt * 60;
    const list = splats.current;
    let count = 0;
    const ready =
      warmed.current && fluid.state.vel !== null && width >= 1 && height >= 1;

    if (p.inside) {
      if (!p.init) {
        p.bx = p.tx;
        p.by = p.ty;
        p.svx = p.svy = 0;
        p.init = true;
      } else {
        // the brush trails the pointer with inertia, never snapping to it
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
          // force already scales with speed; the brush also widens a little
          // with it, so a fast stroke moves more of the surface
          const norm = Math.min(speed / 1800, 1);
          const radius = CONFIG.SPLAT_RADIUS + norm * CONFIG.SPLAT_RADIUS_SPEED;
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
            s.a = 0;
            s.b = 0;
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

    // reveal the canvas over the <img> only once it actually draws the image
    if (!shown.current && ready && image.mesh.visible) {
      shown.current = true;
      onReady();
    }

    looping.current = p.visible && performance.now() < p.activeUntil;
    if (looping.current) state.invalidate();
  });

  return null;
}

function prefersFluidImage() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
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

export default function ContactFluidImage({ src }) {
  const wrapRef = useRef(null);
  const [state, setState] = useState({ enabled: false, root: null, coarse: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!prefersFluidImage()) return;
    const root = wrapRef.current?.parentElement;
    if (!root) return;
    // touch screens get a lighter simulation and a lower resolution
    const coarse = !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    setState({ enabled: true, root, coarse });
  }, []);

  return (
    <div
      className={ready ? "contact-fluid is-ready" : "contact-fluid"}
      ref={wrapRef}
      aria-hidden="true"
    >
      {state.enabled && (
        <FluidBoundary>
          <Canvas
            orthographic
            flat
            frameloop="demand"
            dpr={state.coarse ? [1, 1.5] : [1, 2]}
            gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
          >
            <Scene
              root={state.root}
              src={src}
              coarse={state.coarse}
              onReady={() => setReady(true)}
            />
          </Canvas>
        </FluidBoundary>
      )}
    </div>
  );
}
