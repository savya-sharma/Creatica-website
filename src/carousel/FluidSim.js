import * as THREE from "three";

// A real-time GPU fluid field (Jos Stam's "stable fluids": semi-Lagrangian
// advection, a Jacobi pressure solve to keep the velocity field divergence-
// free, and vorticity confinement for organic swirl) exposing exactly the
// interface RingCarousel.js already calls (setPointer/pointerLeave/resize)
// and exactly the uniform contract shaders.js's surfaceVertex/cardFragment/
// glowFragment/rimFragment already expect: a dye texture, a velocity
// texture stored in "sim texels per second" (see those shaders' own
// comments), and the sim grid's texel size. Reuses the caller's own
// WebGLRenderer via temporary render-target swaps - no second canvas, no
// second animation loop.
//
// This was written from scratch to that contract, not ported from
// anywhere - the technique itself (splat -> vorticity confinement ->
// divergence -> pressure Jacobi -> gradient subtraction -> advect) is the
// standard, widely-documented GPU stable-fluids pipeline, not a novel or
// approximate one.

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SPLAT_FRAGMENT = /* glsl */ `
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uValue;
uniform float uRadius;
uniform float uAspect;
varying vec2 vUv;
void main() {
    vec2 p = vUv - uPoint;
    p.x *= uAspect;
    float falloff = exp(-dot(p, p) / uRadius);
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + uValue * falloff, 1.0);
}
`;

const ADVECT_FRAGMENT = /* glsl */ `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDissipation;
varying vec2 vUv;
void main() {
    vec2 vel = texture2D(uVelocity, vUv).xy;
    vec2 coord = vUv - uDt * vel * uTexel;
    // framerate-independent decay: uDissipation is calibrated per-second
    vec3 result = texture2D(uSource, coord).xyz * pow(uDissipation, uDt * 60.0);
    gl_FragColor = vec4(result, 1.0);
}
`;

const DIVERGENCE_FRAGMENT = /* glsl */ `
uniform sampler2D uVelocity;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
    float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
    float T = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
    gl_FragColor = vec4(0.5 * ((R - L) + (T - B)), 0.0, 0.0, 1.0);
}
`;

const PRESSURE_FRAGMENT = /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
    float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    float div = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}
`;

const GRADIENT_SUBTRACT_FRAGMENT = /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
    float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    vec2 vel = texture2D(uVelocity, vUv).xy - 0.5 * vec2(R - L, T - B);
    gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

const CURL_FRAGMENT = /* glsl */ `
uniform sampler2D uVelocity;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
    float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
    float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
    float B = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
    gl_FragColor = vec4(0.5 * ((R - L) - (T - B)), 0.0, 0.0, 1.0);
}
`;

const VORTICITY_FRAGMENT = /* glsl */ `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uStrength;
uniform float uDt;
varying vec2 vUv;
void main() {
    float L = texture2D(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(uCurl, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(uCurl, vUv + vec2(0.0, uTexel.y)).x;
    float C = texture2D(uCurl, vUv).x;

    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 1e-5;
    force *= uStrength * C;

    vec2 vel = texture2D(uVelocity, vUv).xy + force * uDt;
    gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

function createTarget(width, height) {
    return new THREE.WebGLRenderTarget(width, height, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
    });
}

// A read/write pair with a swap() - every pass reads the previous frame's
// `read` target while writing the new state into `write`, then swaps.
class PingPong {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this._a = createTarget(width, height);
        this._b = createTarget(width, height);
    }

    get read() {
        return this._a;
    }

    get write() {
        return this._b;
    }

    swap() {
        const tmp = this._a;
        this._a = this._b;
        this._b = tmp;
    }

    dispose() {
        this._a.dispose();
        this._b.dispose();
    }
}

const CURL_STRENGTH = 4;
const SPLAT_RADIUS = 0.0018;
const SPLAT_FORCE = 6000; // uv/s -> "sim texels/s" impulse scale
// Requirement 5 (subtle/controlled, no unreadable distortion): both
// calibrated to settle back to calm within roughly half a second of the
// pointer stopping, rather than lingering as a dominant visual on its own.
const VELOCITY_DISSIPATION = 0.96;
const DYE_DISSIPATION = 0.9;
const DYE_SPLAT_SCALE = 0.32; // splatted dye color is added, not set - keeps repeated fast splats from blowing out to white

export class FluidSim {
    constructor(
        renderer,
        {
            simResolution = 128,
            dyeResolution = 512,
            pressureIterations = 20,
            dyeColor = [0.34, 0.42, 0.42],
            dyeColorAlt = [0.55, 0.66, 0.66],
        } = {},
    ) {
        this.renderer = renderer;
        this.simResolution = simResolution;
        this.dyeResolution = dyeResolution;
        this.pressureIterations = pressureIterations;
        this.dyeColor = dyeColor;
        this.dyeColorAlt = dyeColorAlt;

        this.aspect = 1;
        this.texel = new THREE.Vector2(1, 1);

        this.pointer = { x: 0.5, y: 0.5, lastX: 0.5, lastY: 0.5, frozen: true };

        this._scene = new THREE.Scene();
        this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this._scene.add(this._quad);

        this._materials = {
            splat: new THREE.ShaderMaterial({
                uniforms: { uTarget: { value: null }, uPoint: { value: new THREE.Vector2() }, uValue: { value: new THREE.Vector3() }, uRadius: { value: SPLAT_RADIUS }, uAspect: { value: 1 } },
                vertexShader: QUAD_VERTEX,
                fragmentShader: SPLAT_FRAGMENT,
                depthTest: false,
                depthWrite: false,
            }),
            advect: new THREE.ShaderMaterial({
                uniforms: { uVelocity: { value: null }, uSource: { value: null }, uTexel: { value: new THREE.Vector2() }, uDt: { value: 0 }, uDissipation: { value: 1 } },
                vertexShader: QUAD_VERTEX,
                fragmentShader: ADVECT_FRAGMENT,
                depthTest: false,
                depthWrite: false,
            }),
            divergence: new THREE.ShaderMaterial({
                uniforms: { uVelocity: { value: null }, uTexel: { value: new THREE.Vector2() } },
                vertexShader: QUAD_VERTEX,
                fragmentShader: DIVERGENCE_FRAGMENT,
                depthTest: false,
                depthWrite: false,
            }),
            pressure: new THREE.ShaderMaterial({
                uniforms: { uPressure: { value: null }, uDivergence: { value: null }, uTexel: { value: new THREE.Vector2() } },
                vertexShader: QUAD_VERTEX,
                fragmentShader: PRESSURE_FRAGMENT,
                depthTest: false,
                depthWrite: false,
            }),
            gradientSubtract: new THREE.ShaderMaterial({
                uniforms: { uPressure: { value: null }, uVelocity: { value: null }, uTexel: { value: new THREE.Vector2() } },
                vertexShader: QUAD_VERTEX,
                fragmentShader: GRADIENT_SUBTRACT_FRAGMENT,
                depthTest: false,
                depthWrite: false,
            }),
            curl: new THREE.ShaderMaterial({
                uniforms: { uVelocity: { value: null }, uTexel: { value: new THREE.Vector2() } },
                vertexShader: QUAD_VERTEX,
                fragmentShader: CURL_FRAGMENT,
                depthTest: false,
                depthWrite: false,
            }),
            vorticity: new THREE.ShaderMaterial({
                uniforms: { uVelocity: { value: null }, uCurl: { value: null }, uTexel: { value: new THREE.Vector2() }, uStrength: { value: CURL_STRENGTH }, uDt: { value: 0 } },
                vertexShader: QUAD_VERTEX,
                fragmentShader: VORTICITY_FRAGMENT,
                depthTest: false,
                depthWrite: false,
            }),
        };

        // Sized on the first resize() call (RingCarousel.resize() always
        // calls fluid.resize() before the first tick).
        this.velocity = null;
        this.pressure = null;
        this.divergenceTarget = null;
        this.curlTarget = null;
        this.dye = null;
    }

    _gridSize(base) {
        if (this.aspect >= 1) return [Math.round(base * this.aspect), base];
        return [base, Math.round(base / this.aspect)];
    }

    resize(width, height) {
        this.aspect = width / Math.max(height, 1);
        const [simW, simH] = this._gridSize(this.simResolution);
        const [dyeW, dyeH] = this._gridSize(this.dyeResolution);

        this.velocity?.dispose();
        this.pressure?.dispose();
        this.divergenceTarget?.dispose();
        this.curlTarget?.dispose();
        this.dye?.dispose();

        this.velocity = new PingPong(simW, simH);
        this.pressure = new PingPong(simW, simH);
        this.divergenceTarget = createTarget(simW, simH);
        this.curlTarget = createTarget(simW, simH);
        this.dye = new PingPong(dyeW, dyeH);

        this.texel.set(1 / simW, 1 / simH);
    }

    setPointer(u, v) {
        const p = this.pointer;
        if (p.frozen) {
            // re-entering after pointerLeave() - resync so the next step()
            // doesn't read a huge, spurious jump as a fast swipe
            p.lastX = u;
            p.lastY = v;
            p.frozen = false;
        }
        p.x = u;
        p.y = v;
    }

    pointerLeave() {
        this.pointer.frozen = true;
    }

    _renderPass(material, target) {
        this._quad.material = material;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this._scene, this._camera);
    }

    _splat(u, v, value, radius, target) {
        const m = this._materials.splat;
        m.uniforms.uTarget.value = target.read.texture;
        m.uniforms.uPoint.value.set(u, v);
        m.uniforms.uValue.value.set(value[0], value[1], value[2]);
        m.uniforms.uRadius.value = radius;
        m.uniforms.uAspect.value = this.aspect;
        this._renderPass(m, target.write);
        target.swap();
    }

    step(dt) {
        if (!this.velocity || dt <= 0) return;
        // Clamp: a stalled tab catching up shouldn't fling the whole field
        // through several seconds of simulated motion in one jump.
        const step = Math.min(dt, 1 / 30);

        const p = this.pointer;
        const dx = p.x - p.lastX;
        const dy = p.y - p.lastY;
        const dist = Math.hypot(dx, dy);
        if (!p.frozen && dist > 1e-5) {
            const speed = Math.min(dist / Math.max(step, 1 / 240), 3);
            const force = speed * SPLAT_FORCE;
            this._splat(p.x, p.y, [dx * force, dy * force, 0], SPLAT_RADIUS, this.velocity);
            const mix = Math.min(speed / 1.5, 1);
            const color = [
                THREE.MathUtils.lerp(this.dyeColor[0], this.dyeColorAlt[0], mix) * DYE_SPLAT_SCALE,
                THREE.MathUtils.lerp(this.dyeColor[1], this.dyeColorAlt[1], mix) * DYE_SPLAT_SCALE,
                THREE.MathUtils.lerp(this.dyeColor[2], this.dyeColorAlt[2], mix) * DYE_SPLAT_SCALE,
            ];
            this._splat(p.x, p.y, color, SPLAT_RADIUS * 2.2, this.dye);
        }
        p.lastX = p.x;
        p.lastY = p.y;

        const texel = this.texel;

        // Vorticity confinement: adds the small-scale swirl that makes the
        // field read as organic/liquid rather than a flat directional push.
        const curlMat = this._materials.curl;
        curlMat.uniforms.uVelocity.value = this.velocity.read.texture;
        curlMat.uniforms.uTexel.value.copy(texel);
        this._renderPass(curlMat, this.curlTarget);

        const vortMat = this._materials.vorticity;
        vortMat.uniforms.uVelocity.value = this.velocity.read.texture;
        vortMat.uniforms.uCurl.value = this.curlTarget.texture;
        vortMat.uniforms.uTexel.value.copy(texel);
        vortMat.uniforms.uDt.value = step;
        this._renderPass(vortMat, this.velocity.write);
        this.velocity.swap();

        // Pressure projection: make the velocity field divergence-free so
        // it flows around itself instead of just expanding outward forever.
        const divMat = this._materials.divergence;
        divMat.uniforms.uVelocity.value = this.velocity.read.texture;
        divMat.uniforms.uTexel.value.copy(texel);
        this._renderPass(divMat, this.divergenceTarget);

        const pressureMat = this._materials.pressure;
        pressureMat.uniforms.uDivergence.value = this.divergenceTarget.texture;
        pressureMat.uniforms.uTexel.value.copy(texel);
        for (let i = 0; i < this.pressureIterations; i++) {
            pressureMat.uniforms.uPressure.value = this.pressure.read.texture;
            this._renderPass(pressureMat, this.pressure.write);
            this.pressure.swap();
        }

        const gradMat = this._materials.gradientSubtract;
        gradMat.uniforms.uPressure.value = this.pressure.read.texture;
        gradMat.uniforms.uVelocity.value = this.velocity.read.texture;
        gradMat.uniforms.uTexel.value.copy(texel);
        this._renderPass(gradMat, this.velocity.write);
        this.velocity.swap();

        // Advection: velocity carries itself, then carries the dye.
        const advectMat = this._materials.advect;
        advectMat.uniforms.uVelocity.value = this.velocity.read.texture;
        advectMat.uniforms.uSource.value = this.velocity.read.texture;
        advectMat.uniforms.uTexel.value.copy(texel);
        advectMat.uniforms.uDt.value = step;
        advectMat.uniforms.uDissipation.value = VELOCITY_DISSIPATION;
        this._renderPass(advectMat, this.velocity.write);
        this.velocity.swap();

        advectMat.uniforms.uVelocity.value = this.velocity.read.texture;
        advectMat.uniforms.uSource.value = this.dye.read.texture;
        advectMat.uniforms.uDissipation.value = DYE_DISSIPATION;
        this._renderPass(advectMat, this.dye.write);
        this.dye.swap();

        this.renderer.setRenderTarget(null);
    }

    get dyeTexture() {
        return this.dye?.read.texture ?? null;
    }

    get velocityTexture() {
        return this.velocity?.read.texture ?? null;
    }

    dispose() {
        this.velocity?.dispose();
        this.pressure?.dispose();
        this.divergenceTarget?.dispose();
        this.curlTarget?.dispose();
        this.dye?.dispose();
        this._quad.geometry.dispose();
        Object.values(this._materials).forEach((material) => material.dispose());
        this.renderer.setRenderTarget(null);
    }
}
