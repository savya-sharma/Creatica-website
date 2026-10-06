import * as THREE from "three";

// The GPU stable-fluids engine shared by the effects built on it (the Hero's
// ink + text, the Contact image's liquid surface). Each caller owns its own
// instance for as long as it is mounted; nothing here is global. Besides
// velocity and ink, the dye target's zw carries a displacement field (px)
// that the flow integrates, carries along and lets decay - what lets
// anything sampled through it drift with the liquid and ease back to rest.
//
// options: velocityDissipation, dyeDissipation, displaceGain, displaceMax,
// and for the ink layer (displayMesh) inkAlpha, bloom, sheen, colorA, colorB.

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

export function createFluid(options) {
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
      uAlpha: { value: options.inkAlpha },
      uBloom: { value: options.bloom },
      uSheen: { value: options.sheen },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  // the ink layer writes sRGB values straight to the canvas
  const colA = new THREE.Color(options.colorA);
  const colB = new THREE.Color(options.colorB);
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
    max: { value: options.displaceMax },
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
    u.uDissipation.value = options.velocityDissipation;
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
    u.uDissipation.value = options.dyeDissipation;
    run(renderer, mats.advect, dye.write);
    dye.swap();

    u = mats.integrate.uniforms;
    u.uDye.value = dye.read.texture;
    u.uVelocity.value = vel.read.texture;
    u.uGain.value = cellPx * options.displaceGain * options.dyeDissipation;
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
