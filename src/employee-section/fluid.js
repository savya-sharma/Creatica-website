// One shared GPU velocity field for the whole carousel.
//
// Space: "ribbon space" - x = arc length along the formation curve (0 = the
// screen centre), y = height, both in world units. Every plane fragment knows
// its own ribbon coordinate, so all planes sample one coherent field, and the
// field's directions map straight onto plane UVs regardless of the plane's
// rotation, depth or bend. Each step the field is shifted by the carousel's
// scroll, so the liquid travels with the images instead of sliding over them.
//
// Per step (all on the GPU, ping-pong half-float targets):
//   advect (+ scroll shift, + exponential dissipation)
//   -> inject the mouse stroke (elongated along its direction, with turbulence)
//   -> curl -> vorticity confinement (swirls)
//   -> divergence -> Jacobi pressure -> subtract gradient
// Velocities are stored in world units per second.
//
// Optionally the field also carries dye (a density advected by the velocity),
// which the About-page background renders as smoke (backgroundFluid.js).
//
// Smoothed outputs: consumers read the field through a small blur (so its
// grid never shows). That blur runs once per step at field resolution
// (`smooth: true` for velocity, always for dye) instead of in every pixel
// and vertex that samples it.

import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Raycaster,
  Vector2,
  Vector4,
  WebGLRenderTarget,
} from "three";
import { intersectRibbon } from "./formation.js";
import { expDamp } from "./math.js";

const baseVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Neighbour taps for the finite-difference passes.
const neighbourVertex = /* glsl */ `
  uniform vec2 uTexel;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  void main() {
    vUv = uv;
    vL = uv - vec2(uTexel.x, 0.0);
    vR = uv + vec2(uTexel.x, 0.0);
    vT = uv + vec2(0.0, uTexel.y);
    vB = uv - vec2(0.0, uTexel.y);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Pre-smoothing for consumers: 5-tap diagonal kernel (velocity) or 3x3
// kernel (dye), offsets of 1.5 texels.
const blurFragment = /* glsl */ `
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  uniform int uKernel;       // 0 = 5-tap, 1 = 9-tap
  varying vec2 vUv;
  void main() {
    vec2 o = uTexel * 1.5;
    vec4 centre = texture2D(uSource, vUv);
    vec4 diagonal = texture2D(uSource, vUv + o) + texture2D(uSource, vUv - o)
      + texture2D(uSource, vUv + vec2(o.x, -o.y)) + texture2D(uSource, vUv + vec2(-o.x, o.y));
    if (uKernel == 0) {
      gl_FragColor = centre * 0.4 + diagonal * 0.15;
      return;
    }
    vec4 axis = texture2D(uSource, vUv + vec2(o.x, 0.0)) + texture2D(uSource, vUv - vec2(o.x, 0.0))
      + texture2D(uSource, vUv + vec2(0.0, o.y)) + texture2D(uSource, vUv - vec2(0.0, o.y));
    gl_FragColor = centre * 0.25 + axis * 0.125 + diagonal * 0.0625;
  }
`;

const advectFragment = /* glsl */ `
  uniform sampler2D uVelocity;
  uniform vec2 uDomain;      // world size of the field
  uniform float uDt;
  uniform float uAdvection;
  uniform float uDissipation;
  uniform vec2 uShift;       // content scroll this step, world units
  varying vec2 vUv;
  void main() {
    vec2 v = texture2D(uVelocity, vUv).xy;
    // semi-Lagrangian: where did this fluid come from (self-advection plus
    // the content scrolling underneath)
    vec2 from = vUv - (uDt * uAdvection * v + uShift) / uDomain;
    vec2 inside = step(vec2(0.0), from) * step(from, vec2(1.0));
    vec2 carried = texture2D(uVelocity, from).xy * inside.x * inside.y;
    gl_FragColor = vec4(carried * exp(-uDissipation * uDt), 0.0, 1.0);
  }
`;

const strokeChunk = /* glsl */ `
  uniform vec2 uDomain;
  uniform vec2 uA;           // stroke start (field world coords)
  uniform vec2 uB;           // stroke end
  uniform vec2 uForce;       // smoothed mouse velocity * strength
  uniform float uRadius;
  uniform float uStretch;
  uniform float uTime;
  uniform float uNoiseScale;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  // Capsule along the stroke, stretched further along the direction of
  // travel: a streak, not a circle. Returns the weight; writes the direction
  // and its perpendicular.
  float stroke(vec2 p, out vec2 dir, out vec2 side) {
    vec2 ab = uB - uA;
    float len = length(ab);
    float speed = length(uForce);
    dir = len > 1e-5 ? ab / len : (speed > 1e-5 ? uForce / speed : vec2(1.0, 0.0));
    side = vec2(-dir.y, dir.x);
    vec2 ap = p - uA;
    float along = dot(ap, dir);
    float across = dot(ap, side);
    float beyond = along < 0.0 ? along : max(0.0, along - len);
    float alongRadius = uRadius * uStretch;
    return exp(-(across * across) / (uRadius * uRadius) - (beyond * beyond) / (alongRadius * alongRadius));
  }
`;

const splatFragment = /* glsl */ `
  uniform sampler2D uVelocity;
  uniform float uTurbulence;
  uniform float uBlend;      // frame-rate independent injection amount
  uniform float uMaxVelocity;
  varying vec2 vUv;
  ${strokeChunk}

  void main() {
    vec2 v = texture2D(uVelocity, vUv).xy;
    vec2 p = vUv * uDomain;
    vec2 dir;
    vec2 side;
    float w = stroke(p, dir, side);
    float speed = length(uForce);
    // irregular sideways component so the stroke breaks up into turbulence
    float n = noise(p * uNoiseScale + vec2(uTime * 1.7, -uTime * 1.3)) - 0.5;
    vec2 force = uForce + side * n * 2.0 * uTurbulence * speed;
    v = mix(v, v + force, w * uBlend);
    float m = length(v);
    if (m > uMaxVelocity) v *= uMaxVelocity / m;
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;

const dyeAdvectFragment = /* glsl */ `
  uniform sampler2D uVelocity;
  uniform sampler2D uDye;
  uniform vec2 uDomain;
  uniform float uDt;
  uniform float uAdvection;
  uniform float uDissipation;
  uniform vec2 uShift;
  varying vec2 vUv;
  void main() {
    vec2 v = texture2D(uVelocity, vUv).xy;
    vec2 from = vUv - (uDt * uAdvection * v + uShift) / uDomain;
    vec2 inside = step(vec2(0.0), from) * step(from, vec2(1.0));
    float d = texture2D(uDye, from).r * inside.x * inside.y;
    gl_FragColor = vec4(d * exp(-uDissipation * uDt), 0.0, 0.0, 1.0);
  }
`;

const dyeSplatFragment = /* glsl */ `
  uniform sampler2D uDye;
  uniform float uAmount;     // dye added this step at the stroke's core
  varying vec2 vUv;
  ${strokeChunk}

  void main() {
    float d = texture2D(uDye, vUv).r;
    vec2 p = vUv * uDomain;
    vec2 dir;
    vec2 side;
    float w = stroke(p, dir, side);
    // break the puff up so it reads as smoke rather than a soft brush
    float n = noise(p * uNoiseScale * 0.6 + vec2(uTime * 0.4, uTime * 0.3));
    d = min(1.5, d + w * uAmount * mix(0.8, 1.0, n));
    gl_FragColor = vec4(d, 0.0, 0.0, 1.0);
  }
`;

const curlFragment = /* glsl */ `
  uniform sampler2D uVelocity;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  void main() {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
  }
`;

const vorticityFragment = /* glsl */ `
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform float uStrength;
  uniform float uDt;
  uniform float uMaxVelocity;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  void main() {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 1e-4;
    force *= uStrength * C;
    force.y *= -1.0;
    vec2 v = texture2D(uVelocity, vUv).xy + force * uDt;
    float m = length(v);
    if (m > uMaxVelocity) v *= uMaxVelocity / m;
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;

const divergenceFragment = /* glsl */ `
  uniform sampler2D uVelocity;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  void main() {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;
    gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
  }
`;

const pressureFragment = /* glsl */ `
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  void main() {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    float d = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0);
  }
`;

const gradientFragment = /* glsl */ `
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform float uAmount;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  void main() {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    vec2 v = texture2D(uVelocity, vUv).xy - uAmount * vec2(R - L, T - B);
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;

/** The stroke shape uniforms shared by the velocity and dye splats. */
function setStroke(u, splat, radius, c, time) {
  u.uA.value.copy(splat.a);
  u.uB.value.copy(splat.b);
  u.uForce.value.copy(splat.force);
  u.uRadius.value = radius;
  u.uStretch.value = splat.stretch;
  u.uTime.value = time;
  u.uNoiseScale.value = c.fluidNoiseScale ?? 9;
}

/** WebGL2 + renderable half floats, or the effect stays off. */
export function supportsFluid(renderer) {
  return (
    renderer.capabilities.isWebGL2 &&
    (renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float"))
  );
}

function makeTarget(width, height, filter) {
  return new WebGLRenderTarget(width, height, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: filter,
    magFilter: filter,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

export class FluidField {
  constructor(renderer, { dye = false, smooth = false } = {}) {
    this.renderer = renderer;
    this.hasDye = dye;
    this.hasSmooth = smooth;
    this.dyeTexel = new Vector2();
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(new PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.texel = new Vector2();
    this.domain = new Vector2(1, 1);
    this.targets = null;
    this.idle = true;

    const texel = { value: this.texel };
    const domain = { value: this.domain };
    const pass = (vertexShader, fragmentShader, uniforms) =>
      new ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false });

    this.materials = {
      advect: pass(baseVertex, advectFragment, {
        uVelocity: { value: null },
        uDomain: domain,
        uDt: { value: 0 },
        uAdvection: { value: 1 },
        uDissipation: { value: 1 },
        uShift: { value: new Vector2() },
      }),
      splat: pass(baseVertex, splatFragment, {
        uVelocity: { value: null },
        uNoiseScale: { value: 9 },
        uDomain: domain,
        uA: { value: new Vector2() },
        uB: { value: new Vector2() },
        uForce: { value: new Vector2() },
        uRadius: { value: 0.1 },
        uStretch: { value: 1 },
        uTurbulence: { value: 0 },
        uBlend: { value: 0 },
        uTime: { value: 0 },
        uMaxVelocity: { value: 8 },
      }),
      dyeAdvect: pass(baseVertex, dyeAdvectFragment, {
        uVelocity: { value: null },
        uDye: { value: null },
        uDomain: domain,
        uDt: { value: 0 },
        uAdvection: { value: 1 },
        uDissipation: { value: 1 },
        uShift: { value: new Vector2() },
      }),
      dyeSplat: pass(baseVertex, dyeSplatFragment, {
        uDye: { value: null },
        uAmount: { value: 0 },
        uDomain: domain,
        uA: { value: new Vector2() },
        uB: { value: new Vector2() },
        uForce: { value: new Vector2() },
        uRadius: { value: 0.1 },
        uStretch: { value: 1 },
        uTime: { value: 0 },
        uNoiseScale: { value: 9 },
      }),
      blurVelocity: pass(baseVertex, blurFragment, { uSource: { value: null }, uTexel: texel, uKernel: { value: 0 } }),
      blurDye: pass(baseVertex, blurFragment, { uSource: { value: null }, uTexel: { value: this.dyeTexel }, uKernel: { value: 1 } }),
      curl: pass(neighbourVertex, curlFragment, { uTexel: texel, uVelocity: { value: null } }),
      vorticity: pass(neighbourVertex, vorticityFragment, {
        uTexel: texel,
        uVelocity: { value: null },
        uCurl: { value: null },
        uStrength: { value: 0 },
        uDt: { value: 0 },
        uMaxVelocity: { value: 8 },
      }),
      divergence: pass(neighbourVertex, divergenceFragment, { uTexel: texel, uVelocity: { value: null } }),
      pressure: pass(neighbourVertex, pressureFragment, {
        uTexel: texel,
        uPressure: { value: null },
        uDivergence: { value: null },
      }),
      gradient: pass(neighbourVertex, gradientFragment, {
        uTexel: texel,
        uPressure: { value: null },
        uVelocity: { value: null },
        uAmount: { value: 1 },
      }),
    };
  }

  /** The raw velocity texture. */
  get texture() {
    return this.targets ? this.targets.velocity[0].texture : null;
  }

  /** Velocity pre-smoothed for sampling (only with { smooth: true }). */
  get smoothTexture() {
    return this.targets?.smooth ? this.targets.smooth.texture : null;
  }

  /** Dye pre-smoothed for display (only with { dye: true }). */
  get dyeTexture() {
    return this.targets?.dye ? this.targets.dyeSmooth.texture : null;
  }

  /**
   * Size the field to a ribbon-space rectangle. Called on layout changes
   * only; the field restarts empty.
   */
  resize(width, height, cellSize, maxCells = 512, dyeScale = 2) {
    const nx = Math.max(16, Math.min(maxCells, Math.round(width / cellSize)));
    const ny = Math.max(8, Math.min(maxCells, Math.round(height / cellSize)));
    this.domain.set(width, height);
    this.texel.set(1 / nx, 1 / ny);
    if (this.targets && this.targets.nx === nx && this.targets.ny === ny) {
      this.clear();
      return;
    }
    this.disposeTargets();
    this.targets = {
      nx,
      ny,
      velocity: [makeTarget(nx, ny, LinearFilter), makeTarget(nx, ny, LinearFilter)],
      pressure: [makeTarget(nx, ny, NearestFilter), makeTarget(nx, ny, NearestFilter)],
      curl: makeTarget(nx, ny, NearestFilter),
      divergence: makeTarget(nx, ny, NearestFilter),
      smooth: this.hasSmooth ? makeTarget(nx, ny, LinearFilter) : null,
      dye: null,
      dyeSmooth: null,
    };
    if (this.hasDye) {
      const dx = Math.round(nx * dyeScale);
      const dy = Math.round(ny * dyeScale);
      this.dyeTexel.set(1 / dx, 1 / dy);
      this.targets.dye = [makeTarget(dx, dy, LinearFilter), makeTarget(dx, dy, LinearFilter)];
      this.targets.dyeSmooth = makeTarget(dx, dy, LinearFilter);
    }
    this.clear();
  }

  /**
   * Draw every pass once, one per idle slot, then clear. Drivers often
   * finish building a shader only on its first draw; doing that while the
   * page is idle - a shader at a time - keeps the one-off cost out of the
   * user's first stroke and avoids one long block.
   */
  warmUp(schedule) {
    const passes = Object.entries(this.materials)
      .filter(([name]) => this.hasDye || !/dye/i.test(name))
      .map(([, material]) => material);
    const next = () => {
      if (!this.targets || this.disposed) return;
      const material = passes.shift();
      if (!material) return this.clear();
      const previous = this.renderer.getRenderTarget();
      this.run(material, this.targets.velocity[1]);
      this.renderer.setRenderTarget(previous);
      schedule(next);
    };
    schedule(next);
  }

  run(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  swap(pair) {
    const t = pair[0];
    pair[0] = pair[1];
    pair[1] = t;
  }

  allTargets() {
    const t = this.targets;
    return [...t.velocity, ...t.pressure, t.curl, t.divergence, t.smooth, ...(t.dye ?? []), t.dyeSmooth].filter(Boolean);
  }

  clear() {
    if (!this.targets) return;
    const previous = this.renderer.getRenderTarget();
    for (const t of this.allTargets()) {
      this.renderer.setRenderTarget(t);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setRenderTarget(previous);
    this.idle = true;
  }

  /**
   * Advance by a frame's dt in sub-steps of at most 1/30 s, so a long frame
   * gives the same result as several short ones (at 30 fps and up this is a
   * single step). The stroke and the scroll shift are split across them.
   */
  advance(dt, time, shiftX, shiftY, splat, c) {
    const n = Math.min(4, Math.ceil(dt * 30 - 1e-6) || 1);
    const h = dt / n;
    const dye = splat?.dye ?? 0;
    if (splat) splat.dye = dye / n;
    for (let i = 1; i <= n; i++) this.step(h, time - dt + h * i, shiftX / n, shiftY / n, splat, c);
    if (splat) splat.dye = dye;
  }

  /**
   * Advance the simulation by one step of dt.
   * @param {number} shiftX content scroll this step (world units)
   * @param {number} shiftY
   * @param {object|null} splat { a: Vector2, b: Vector2, force: Vector2, stretch, dye? }
   *   in field coordinates (world units from the field's min corner)
   * @param {object} c config
   */
  step(dt, time, shiftX, shiftY, splat, c) {
    if (!this.targets || dt <= 0) return;
    const { velocity, pressure, curl, divergence } = this.targets;
    const m = this.materials;
    const previous = this.renderer.getRenderTarget();
    this.idle = false;

    m.advect.uniforms.uVelocity.value = velocity[0].texture;
    m.advect.uniforms.uDt.value = dt;
    m.advect.uniforms.uAdvection.value = c.fluidAdvection;
    m.advect.uniforms.uDissipation.value = c.fluidDissipation;
    m.advect.uniforms.uShift.value.set(shiftX, shiftY);
    this.run(m.advect, velocity[1]);
    this.swap(velocity);

    if (splat) {
      const u = m.splat.uniforms;
      u.uVelocity.value = velocity[0].texture;
      setStroke(u, splat, c.fluidRadius, c, time);
      u.uTurbulence.value = c.fluidTurbulence;
      u.uBlend.value = 1 - Math.exp(-c.fluidInjection * dt);
      u.uMaxVelocity.value = c.maxMouseSpeed * c.fluidStrength;
      this.run(m.splat, velocity[1]);
      this.swap(velocity);
    }

    if (c.fluidVorticity > 0) {
      m.curl.uniforms.uVelocity.value = velocity[0].texture;
      this.run(m.curl, curl);
      const u = m.vorticity.uniforms;
      u.uVelocity.value = velocity[0].texture;
      u.uCurl.value = curl.texture;
      u.uStrength.value = c.fluidVorticity;
      u.uDt.value = dt;
      u.uMaxVelocity.value = c.maxMouseSpeed * c.fluidStrength;
      this.run(m.vorticity, velocity[1]);
      this.swap(velocity);
    }

    if (c.fluidPressure > 0 && c.fluidPressureIterations > 0) {
      m.divergence.uniforms.uVelocity.value = velocity[0].texture;
      this.run(m.divergence, divergence);
      // fresh solve each frame, starting from zero pressure
      this.renderer.setRenderTarget(pressure[0]);
      this.renderer.clear(true, false, false);
      m.pressure.uniforms.uDivergence.value = divergence.texture;
      for (let i = 0; i < c.fluidPressureIterations; i++) {
        m.pressure.uniforms.uPressure.value = pressure[0].texture;
        this.run(m.pressure, pressure[1]);
        this.swap(pressure);
      }
      const g = m.gradient.uniforms;
      g.uPressure.value = pressure[0].texture;
      g.uVelocity.value = velocity[0].texture;
      g.uAmount.value = c.fluidPressure;
      this.run(m.gradient, velocity[1]);
      this.swap(velocity);
    }

    if (this.targets.dye) {
      const dye = this.targets.dye;
      const a = m.dyeAdvect.uniforms;
      a.uVelocity.value = velocity[0].texture;
      a.uDye.value = dye[0].texture;
      a.uDt.value = dt;
      a.uAdvection.value = c.fluidAdvection;
      a.uDissipation.value = c.dyeDissipation;
      a.uShift.value.set(shiftX, shiftY);
      this.run(m.dyeAdvect, dye[1]);
      this.swap(dye);

      if (splat && splat.dye > 0) {
        const u = m.dyeSplat.uniforms;
        u.uDye.value = dye[0].texture;
        u.uAmount.value = splat.dye;
        setStroke(u, splat, c.dyeRadius ?? c.fluidRadius, c, time);
        this.run(m.dyeSplat, dye[1]);
        this.swap(dye);
      }
      m.blurDye.uniforms.uSource.value = dye[0].texture;
      this.run(m.blurDye, this.targets.dyeSmooth);
    }

    if (this.targets.smooth) {
      m.blurVelocity.uniforms.uSource.value = velocity[0].texture;
      this.run(m.blurVelocity, this.targets.smooth);
    }

    this.renderer.setRenderTarget(previous);
  }

  disposeTargets() {
    if (!this.targets) return;
    for (const target of this.allTargets()) target.dispose();
    this.targets = null;
  }

  dispose() {
    this.disposed = true;
    this.disposeTargets();
    for (const material of Object.values(this.materials)) material.dispose();
    this.quad.geometry.dispose();
  }
}

/**
 * Uniforms shared by every plane material (same objects, so one update
 * reaches all planes). With the effect off they simply stay inactive.
 */
export function createFluidUniforms(c) {
  return {
    uFluid: { value: null },
    uFluidActive: { value: 0 },
    uFluidDomain: { value: new Vector4(0, 0, 1, 1) },
    uDistortion: { value: c.distortionStrength },
    uSmear: { value: c.smearStrength },
    uChroma: { value: c.chromaticStrength },
    uChromaThreshold: { value: c.chromaticThreshold },
    uMaxDistortion: { value: c.maxDistortion },
    uTextDistortion: { value: c.captionDistortion },
    uTextChroma: { value: c.captionChroma },
    uMaxTextOffset: { value: c.maxCaptionOffset },
    uTextGrain: { value: c.captionGrain },
    uGrain: { value: c.fluidGrain },
    uGrainSize: { value: c.fluidGrainSize },
    uGrainFlow: { value: c.fluidGrainFlow },
    uGrainFps: { value: c.fluidGrainFps },
    uVertexDisplace: { value: c.vertexDisplacement },
    uVertexDepth: { value: c.vertexDepth },
    uMaxVertex: { value: c.maxVertexDisplacement },
  };
}

/**
 * Pointer stroke -> splat, shared by the carousel and the About background.
 * Works in field coordinates; the caller says how far the content (and so
 * the previous pointer point) moved this step, so the stroke's velocity is
 * measured against the content: a still mouse over the slow auto-scroll
 * stays below fluidMinSpeed and injects nothing.
 */
export class PointerStroke {
  constructor() {
    this.active = false;
    this.position = new Vector2();
    this.previous = new Vector2();
    this.velocity = new Vector2();
    this.splat = { a: new Vector2(), b: new Vector2(), force: new Vector2(), stretch: 1, dye: 0 };
  }

  reset() {
    this.active = false;
    this.velocity.set(0, 0);
  }

  /**
   * @param {Vector2|null} target pointer in field coordinates, null = no pointer
   * @param {number} shiftX content movement this step (field units)
   * @param {number} shiftY
   * @returns the splat for this step, or null
   */
  step(dt, target, shiftX, shiftY, c) {
    if (!target) {
      this.reset();
      return null;
    }
    if (!this.active) {
      this.active = true;
      this.position.copy(target);
      this.velocity.set(0, 0);
      return null;
    }
    // where the previous point is now, riding on the content
    this.previous.set(this.position.x + shiftX, this.position.y + shiftY);
    const k = expDamp(c.mouseSmoothing, dt);
    this.position.x += (target.x - this.position.x) * k;
    this.position.y += (target.y - this.position.y) * k;

    const kv = expDamp(c.fluidVelocityDamping, dt);
    this.velocity.x += ((this.position.x - this.previous.x) / dt - this.velocity.x) * kv;
    this.velocity.y += ((this.position.y - this.previous.y) / dt - this.velocity.y) * kv;
    const speed = this.velocity.length();
    if (speed > c.maxMouseSpeed) this.velocity.multiplyScalar(c.maxMouseSpeed / speed);
    const clamped = Math.min(speed, c.maxMouseSpeed);
    if (clamped < c.fluidMinSpeed) return null;

    const s = this.splat;
    s.a.copy(this.previous);
    s.b.copy(this.position);
    s.force.copy(this.velocity).multiplyScalar(c.fluidStrength);
    s.stretch = 1 + c.fluidStretch * clamped;
    s.dye = c.dyeAmount ? Math.min(1, clamped * c.dyeAmount) * (c.dyeRate ?? 1) * dt : 0;
    return s;
  }
}

// After the last stroke the field decays (exp(-fluidDissipation * t)); past
// this many seconds it is invisible, so it is cleared and the passes stop.
const SETTLE_SECONDS = 4;

/**
 * The carousel's mouse fluid: one field in ribbon space (arc, y) covering
 * the visible ribbon plus captions. The pointer is ray-cast onto the ribbon
 * surface, so strokes land exactly where the cursor is on the bent planes.
 */
export class FluidInteraction {
  constructor(carousel, uniforms) {
    this.carousel = carousel;
    this.uniforms = uniforms;
    this.field = new FluidField(carousel.renderer, { smooth: true });
    this.stroke = new PointerStroke();
    this.raycaster = new Raycaster();
    this.ndc = new Vector2();
    this.hit = { arc: 0, y: 0 };
    this.target = new Vector2();
    this.hasTarget = false;
    this.min = new Vector2();
    this.size = new Vector2(1, 1);
    this.quietFor = Infinity;
  }

  /** Field over the visible ribbon; restarts empty on every layout change. */
  resize(layout, visibleLimit) {
    const width = 2 * (visibleLimit + 0.75) * layout.pitch;
    const top = layout.planeHeight / 2 + layout.verticalLift * layout.planeHeight + 0.15;
    const bottom = -layout.planeHeight / 2 - 0.45; // captions sit below the planes
    this.min.set(-width / 2, bottom);
    this.size.set(width, top - bottom);
    this.field.resize(this.size.x, this.size.y, this.carousel.config.fluidCellSize);
    this.uniforms.uFluidDomain.value.set(this.min.x, this.min.y, this.size.x, this.size.y);
    this.uniforms.uFluid.value = this.field.smoothTexture;
    this.uniforms.uFluidActive.value = 0;
    this.stroke.reset();
    this.quietFor = Infinity;
  }

  onPointerMove(e) {
    const carousel = this.carousel;
    const layout = carousel.layout;
    if (!layout) return;
    const rect = carousel.getCanvasRect();
    if (!rect.width || !rect.height) return;
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
    this.raycaster.setFromCamera(this.ndc, carousel.camera);
    const ray = this.raycaster.ray;
    if (!intersectRibbon(layout, ray.origin, ray.direction, this.hit)) {
      this.onPointerLeave();
      return;
    }
    this.target.set(this.hit.arc - this.min.x, this.hit.y - this.min.y);
    this.hasTarget = true;
  }

  onPointerLeave() {
    this.hasTarget = false;
  }

  /**
   * @param {number} shift content scroll this frame along the ribbon (world)
   */
  update(dt, time, shift) {
    if (dt <= 0 || !this.field.targets) return;
    const c = this.carousel.config;
    const splat = this.stroke.step(dt, this.hasTarget ? this.target : null, shift, 0, c);

    if (splat) this.quietFor = 0;
    else this.quietFor += dt;
    if (this.quietFor > SETTLE_SECONDS) {
      if (!this.field.idle) this.field.clear();
      this.uniforms.uFluidActive.value = 0;
      return;
    }

    this.field.advance(dt, time, shift, 0, splat, c);
    this.uniforms.uFluid.value = this.field.smoothTexture;
    this.uniforms.uFluidActive.value = 1;
  }

  dispose() {
    this.field.dispose();
    this.uniforms.uFluid.value = null;
    this.uniforms.uFluidActive.value = 0;
  }
}
