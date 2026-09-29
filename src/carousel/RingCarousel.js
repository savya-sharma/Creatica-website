import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { FluidSim } from "./FluidSim.js";
import { SpaceBackground } from "./SpaceBackground.js";
import {
    surfaceVertex,
    cardFragment,
    glowFragment,
    sideFragment,
    rimFragment,
    backdropVertex,
    backdropFragment,
    floorShader,
} from "./shaders.js";

const TAU = Math.PI * 2;
const damp = (from, to, lambda, dt) => from + (to - from) * (1 - Math.exp(-lambda * dt));
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const mod = (a, n) => ((a % n) + n) % n;

const DEFAULTS = {
    autoSpeed: 0.3,         // cards per second while idle
    friction: 2.4,          // momentum decay rate
    followDamping: 5,       // how quickly the ring eases toward its target (lower = heavier)
    releaseMomentum: 0.5,   // share of the release speed kept as momentum
    dragSensitivity: 1,     // 1 = the front cards follow the pointer 1:1
    maxVelocity: 8,         // cards per second
    planeWidthScale: 0.9,   // plane proportions relative to the framing card
    planeHeightScale: 1.02,
    minGap: 0.045,          // gap between planes, as a fraction of card width
    maxGap: 0.08,
    edgeFill: 0.9,          // < 1 pushes the ring's sides past the viewport edges
    maxPlanes: 72,
    // Border glow, computed per card from its rounded-rect shape (no
    // screen-space bloom). Widths are fractions of the card width.
    borderColor: "#586A6B",
    borderWidth: 0.008,     // falloff width of the luminous edge
    edgeLight: 2.2,         // edge brightness, as a multiple of the border colour
    edgeOpacity: 0.7,       // how much the edge covers the image at the outline
    coreWhiteness: 0.45,    // lower rim line: how far its core leans from the theme colour toward white
    innerGlow: 0.14,        // subtle glow just inside the edge
    glowStrength: 0.8,      // outer halo brightness
    // Falloff of the outer tail. Kept below the gap between planes so
    // neighbouring tails don't merge into a band under the row.
    glowWidth: 0.028,
    glowMargin: 0.2,        // how far the glow quad extends past the card
    cardThickness: 0.07,    // extruded depth behind each plane, of card width
    cardBevel: 0.45,        // rounding of the back edge, as a share of the thickness
    sideShade: 0.7,         // sidewall brightness relative to the border colour
    sideBloom: 1.5,         // soft highlight where the rounded edge catches the light
    // Centre focus: the plane crossing the screen centre gets the strong glow.
    focusWidth: 1,          // falloff span, in plane spacings from the centre
    focusDamping: 10,       // smoothing of each plane's focus amount
    glowUnfocused: 0.45,    // outer-glow multiplier away from the centre
    glowFocused: 2.6,       // outer-glow multiplier at the centre
    focusCore: 0.5,         // extra edge brightness at the centre
    focusInner: 1.6,        // extra inner glow at the centre
    centerTint: 0.55,       // soft theme-colour fade on the centred image (0 = off)
    // Soft image edges and theme light bleeding into them (fractions of card height).
    edgeFeather: 0.03,      // width of the soft falloff into the outline
    featherDepth: 0.22,     // how much the image dims at the very edge
    edgeBloom: 0.35,        // edge bleed on side/rear planes
    edgeBloomFocused: 0.9,  // edge bleed on the centred plane
    bloomWidth: 0.05,       // falloff of the edge bleed
    surfaceBloom: 0.18,     // faint, broad spill onto the centred image
    // Lower rim beneath the planes (fractions of card width / height).
    rimOffset: 0.03,        // gap below the plane bottoms, of card height
    rimCoreWidth: 0.004,    // half-width of the bright line
    rimHaloWidth: 0.03,     // falloff of its soft glow
    rimStrength: 0.7,
    leanAngle: 1.5,         // max hover lean in degrees, away from the mouse
    leanDamping: 2.5,       // how quickly the lean follows the mouse
    // Full-screen mouse fluid behind the carousel (off with reduced motion).
    fluid: true,
    fluidStrength: 0.75,
    fluidCoreWhiteness: 0.6, // fluid core: theme colour blended this far toward white
    // How the same fluid field acts on the planes it passes over.
    fluidDisplace: 0.015,   // seconds of flow applied as image drift
    fluidMaxShift: 0.015,   // cap on the drift, in plane uv (keeps images readable)
    fluidTint: 0.55,        // theme-coloured sheen where the liquid crosses a plane
    fluidRefract: 500,      // liquid-lens bend at the edges of the ink
    fluidChroma: 0.08,      // colour separation where the displacement peaks
    // Physical surface deformation from the same field (fractions of card width).
    fluidWarp: 0.022,       // seconds of flow applied as surface push
    fluidMaxWarp: 0.045,    // cap on the push
    fluidBulge: 0.025,      // bulge toward the viewer where the ink is dense
    surfaceSegments: [20, 30], // plane subdivision so it can bend smoothly
    fluidGlow: 0.9,         // extra border glow where the liquid passes
    externalPointer: false, // true: pointer data comes from setPointerInput()
    onActiveChange: null,   // (index, item) => void
};

// Rendering quality is chosen once, at startup, from the device.
function detectQuality() {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const dpr = window.devicePixelRatio || 1;
    const shortSide = Math.min(window.innerWidth, window.innerHeight);

    if (coarse && shortSide < 700) {
        return { pixelRatio: Math.min(dpr, 1.5), msaa: 0, reflectionScale: 0.3, particles: 50, upperParticles: 35, fluid: { simResolution: 80, dyeResolution: 256, pressureIterations: 12 } };
    }
    if (coarse || window.innerWidth < 1024) {
        return { pixelRatio: Math.min(dpr, 1.5), msaa: 2, reflectionScale: 0.4, particles: 80, upperParticles: 60, fluid: { simResolution: 104, dyeResolution: 384, pressureIterations: 16 } };
    }
    return { pixelRatio: Math.min(dpr, 2), msaa: dpr >= 2 ? 2 : 4, reflectionScale: 0.5, particles: 120, upperParticles: 85, fluid: { simResolution: 128, dyeResolution: 512, pressureIterations: 20 } };
}

// Per-breakpoint card size, lens, how tall the front card appears
// (fraction of viewport height) and the inward lean of the planes.
function getPreset(width) {
    if (width < 640) return { cardW: 1.2, cardH: 1.55, fov: 45, cardFraction: 0.25, tilt: 4 };
    if (width < 1024) return { cardW: 1.35, cardH: 1.72, fov: 40, cardFraction: 0.28, tilt: 5 };
    return { cardW: 1.5, cardH: 1.9, fov: 35, cardFraction: 0.3, tilt: 5 };
}

/**
 * Solve the ring for the viewport: the radius that makes the ring span the
 * full width while the front card keeps its intended size, then the plane
 * count and gap that pack cards tightly around that radius.
 */
function computeLayout(width, height, itemCount, options) {
    const preset = getPreset(width);
    const { fov, cardFraction } = preset;
    const aspect = width / height;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const halfWidthSlope = tanHalf * aspect;

    // Framing uses the preset card size, so the camera and ring radius don't
    // move when the plane proportions change.
    const frameH = preset.cardH;
    // The planes themselves: narrower and taller than the framing card.
    const cardW = preset.cardW * options.planeWidthScale;
    const cardH = preset.cardH * options.planeHeightScale;

    // Front card distance for the target size, then the radius whose sides
    // reach the viewport edges: (front + R) * slope = edgeFill * R.
    const frontDistance = frameH / (2 * cardFraction * tanHalf);
    const idealRadius = (frontDistance * halfWidthSlope) / Math.max(options.edgeFill - halfWidthSlope, 0.1);

    // Neighbouring centres sit one chord apart: chord = cardW * (1 + gap).
    const chordAngle = 2 * Math.asin(Math.min(0.99, (cardW * (1 + options.minGap)) / (2 * idealRadius)));
    // Independent of the number of images: planes pick up images as they
    // pass round the back (see assignItems), so any dataset size works.
    const planeCount = clamp(Math.round(TAU / chordAngle), Math.min(itemCount, 8), options.maxPlanes);

    const halfStep = Math.PI / planeCount;
    const gap = clamp((2 * idealRadius * Math.sin(halfStep)) / cardW - 1, options.minGap, options.maxGap);
    const radius = (cardW * (1 + gap)) / (2 * Math.sin(halfStep));

    const distance = Math.max((options.edgeFill * radius) / halfWidthSlope, radius + frameH * 1.5);

    return {
        ...preset,
        cardW,
        cardH,
        frameH,
        aspect,
        tanHalf,
        planeCount,
        radius,
        gap,
        distance,
        frontDistance: distance - radius,
        tiltRad: THREE.MathUtils.degToRad(preset.tilt),
    };
}

export class RingCarousel {
    constructor(container, items, options = {}) {
        if (!items?.length) throw new Error("RingCarousel needs at least one item");

        this.container = container;
        this.items = items;
        this.options = { ...DEFAULTS, ...options };
        this.quality = detectQuality();
        this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        this.step = TAU / items.length;
        this.turnOffset = 0;        // whole turns removed from offset by wrapping
        this.visibleCos = -1;       // far-side culling threshold (set on resize)
        this.offset = 0;            // rendered rotation (rad)
        this.targetOffset = 0;      // where the ring is heading; offset eases toward it
        this.velocity = 0;          // rad/s
        this.autoBlend = 1;
        this.autoDir = -1;          // right -> left, fixed: nothing ever changes it
        this.activeIndex = -1;
        this.radPerPixel = 0.003;
        this.drag = null;
        // set true as the very first step of dispose() - guards every async
        // texture callback (getTexture's onLoad/onError) against writing
        // into this instance's materials/textures after it's been torn
        // down, e.g. a load kicked off just before a fast SPA navigation
        // away from /work resolving after the next instance already exists
        this.disposed = false;
        this.elapsed = 0;
        this.lastTime = performance.now();

        this.pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0, px: -1e4, py: -1e4, energy: 0, lastX: 0, lastY: 0, lastT: 0 };
        this.lean = { target: 0, current: 0 }; // hover lean, -1..1 (+ = toward the right)
        this.rect = container.getBoundingClientRect();

        this.initRenderer();

        // One theme colour drives the whole palette: borders, glow, rim,
        // sidewalls, fluid, background and floor are all derived from it.
        const theme = new THREE.Color(this.options.borderColor); // linear
        this.theme = theme;
        const peak = Math.max(theme.r, theme.g, theme.b, 1e-4);
        const dye = theme.clone().multiplyScalar(1 / peak); // same hue, max channel 1
        const dyeAlt = dye.clone().lerp(new THREE.Color(1, 1, 1), 0.35);

        this.fluid = this.options.fluid && !this.reducedMotion
            ? new FluidSim(this.renderer, {
                ...this.quality.fluid,
                dyeColor: dye.toArray(),
                dyeColorAlt: dyeAlt.toArray(),
            })
            : null;
        this.fluidCore = theme.clone().lerp(new THREE.Color(1, 1, 1), this.options.fluidCoreWhiteness);
        // The dye keeps its old strength (max channel 1) so density-driven
        // behaviour is unchanged; only its displayed colour is scaled to the
        // old violet's brightness (luminance ~0.25), since a teal of the same
        // strength is far brighter and would turn milky.
        const luminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        this.fluidDyeScale = 0.25 / luminance(dye.clone().lerp(dyeAlt, 0.5));
        this.initScene();
        this.initCards();
        this.initFloor();
        this.initComposer();
        this.bindEvents();

        this.resize();
        this.renderer.setAnimationLoop(this.tick);
    }

    // -- setup ---------------------------------------------------------------

    initRenderer() {
        const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
        renderer.setPixelRatio(this.quality.pixelRatio);
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.domElement.classList.add("ring-carousel__canvas");
        this.container.appendChild(renderer.domElement);
        this.renderer = renderer;
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
        this.cameraBase = new THREE.Vector3();
        this.cameraTarget = new THREE.Vector3();

        // Everything that leans with the hover interaction: planes, glows,
        // rim, occluder and the floor (so the reflection leans with it).
        // Rolling around the z axis pivots on the front card's centre.
        this.rig = new THREE.Group();
        this.scene.add(this.rig);

        this.backdrop = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.ShaderMaterial({
                uniforms: {
                    // Near-black and a faint glow, both in the theme hue.
                    uBase: { value: this.theme.clone().multiplyScalar(0.04) },
                    uGlow: { value: this.theme.clone().multiplyScalar(0.2) },
                    uAspect: { value: 1 },
                    uFluid: { value: null },
                    uFluidStrength: { value: this.fluid ? this.options.fluidStrength : 0 },
                    uFluidCore: { value: this.fluidCore },
                    uFluidDyeScale: { value: this.fluidDyeScale },
                },
                vertexShader: backdropVertex,
                fragmentShader: backdropFragment,
                depthTest: false,
                depthWrite: false,
            }),
        );
        this.backdrop.frustumCulled = false;
        this.backdrop.renderOrder = -3;
        this.scene.add(this.backdrop);

        // Grid and fireflies, drawn just after the backdrop.
        this.space = new SpaceBackground(this.scene, { color: this.theme, particleCount: this.quality.particles, upperCount: this.quality.upperParticles });
    }

    initCards() {
        const { options } = this;

        // Uniform objects shared by every card and glow material.
        const borderColor = new THREE.Color(options.borderColor);
        this.shared = {
            uSize: { value: new THREE.Vector2(1, 1) },
            uRadius: { value: 0.1 },
            uBorder: { value: 0.01 },
            uBorderColor: { value: borderColor },
            uCoreColor: { value: borderColor.clone().lerp(new THREE.Color(1, 1, 1), options.coreWhiteness) },
            uInnerGlow: { value: options.innerGlow },
            uMargin: { value: 0.2 },
            uGlowWidth: { value: 0.05 },
            uGlowStrength: { value: options.glowStrength },
            uGlowUnfocused: { value: options.glowUnfocused },
            uGlowFocused: { value: options.glowFocused },
            uFocusCore: { value: options.focusCore },
            uCenterTint: { value: options.centerTint },
            uEdgeLight: { value: options.edgeLight },
            uEdgeOpacity: { value: options.edgeOpacity },
            uFocusInner: { value: options.focusInner },
            uEdgeFeather: { value: 0.05 },
            uFeatherDepth: { value: options.featherDepth },
            uEdgeBloom: { value: options.edgeBloom },
            uEdgeBloomFocused: { value: options.edgeBloomFocused },
            uBloomWidth: { value: 0.1 },
            uSurfaceBloom: { value: options.surfaceBloom },
            uTime: { value: 0 },
            uPointer: { value: new THREE.Vector2(-1e4, -1e4) },
            uPointerEnergy: { value: 0 },
            uPointerRadius: { value: 200 },
            uDepthNear: { value: 1 },
            uDepthFar: { value: -1 },
            // Fullscreen fluid field, read by the planes and their glows.
            uFluidDye: { value: null },
            uFluidVelocity: { value: null },
            uFluidTexel: { value: new THREE.Vector2(1, 1) },
            uResolution: { value: new THREE.Vector2(1, 1) },
            uFluidOn: { value: this.fluid ? 1 : 0 },
            uFluidDisplace: { value: options.fluidDisplace },
            uFluidMaxShift: { value: options.fluidMaxShift },
            uFluidTint: { value: options.fluidTint },
            uFluidDyeScale: { value: this.fluidDyeScale },
            uFluidRefract: { value: options.fluidRefract },
            uFluidChroma: { value: options.fluidChroma },
            uFluidWarp: { value: options.fluidWarp },
            uFluidMaxWarp: { value: 0.1 },
            uFluidBulge: { value: 0.05 },
            uTanHalf: { value: 0.3 },
            uCamAspect: { value: 1 },
            uFluidGlow: { value: options.fluidGlow },
        };

        // Subdivided so the surface (and the border drawn on it) can bend.
        this.cardGeometry = new THREE.PlaneGeometry(1, 1, ...options.surfaceSegments);

        this.glows = [];
        this.focusPoint = new THREE.Vector3();

        // Card thickness: a closed body per plane (rounded sidewall + back),
        // extruded behind the face (toward the ring centre) along the
        // rounded-rect outline. One shared geometry (rebuilt on resize, in
        // world units so corners stay round); a material per card so the
        // edge highlight can follow that card's focus.
        this.sides = [];
        this.sideGeometry = new THREE.BufferGeometry();
        this.shared.uSideShade = { value: options.sideShade };
        this.shared.uSideBloom = { value: options.sideBloom };

        this.loader = new THREE.TextureLoader();
        this.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this.textures = new Map();
        this.cards = [];
        this.ring = new THREE.Group();
        this.rig.add(this.ring);

        // Curved occlusion mask: an open cone just inside the planes that
        // writes depth only. Its front half hides whatever lies behind it
        // (the rear planes seen through the gaps) while the floor and
        // backdrop, drawn earlier, stay visible. Geometry follows the layout.
        this.occluder = new THREE.Mesh(
            new THREE.BufferGeometry(),
            new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.FrontSide }),
        );
        this.occluder.renderOrder = -1;
        this.rig.add(this.occluder);

        // Lower rim: shares the border colours; geometry follows the layout.
        //
        // Draw order does the depth work (opaque list, by renderOrder):
        //   backdrop (-3) -> floor (-2) -> rim (-1.5) -> occluder (-1) -> planes (0)
        // The rim goes in before the occluder writes depth, so its far half
        // is not masked: it shows through the gaps between the front planes
        // as the ring continuing behind. The front planes are drawn after it
        // and cover it everywhere else, and the far-side planes still fail
        // the depth test against the occluder, so only dark background and
        // the rim ever show through the gaps.
        this.rim = new THREE.Mesh(
            new THREE.BufferGeometry(),
            new THREE.ShaderMaterial({
                uniforms: {
                    // Shared: border colours plus the fluid field and surface
                    // deformation settings, so the rim reacts like the planes.
                    ...this.shared,
                    uBandHeight: { value: 0.1 },
                    uCoreWidth: { value: 0.005 },
                    uHaloWidth: { value: 0.03 },
                    uRimStrength: { value: options.rimStrength },
                },
                vertexShader: surfaceVertex,
                fragmentShader: rimFragment,
                side: THREE.DoubleSide, // near and far halves of the ring
                // Stays in the opaque list so renderOrder can place it before
                // the occluder; blending still applies additively.
                transparent: false,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }),
        );
        this.rim.renderOrder = -1.5;
        this.rig.add(this.rim);
    }

    // Items that share an image share one texture.
    //
    // uReady on a card's material is only ever *read* from entry.loaded at
    // the moment buildPlanes() constructs that material - loading is always
    // asynchronous, so on every fresh mount that moment always comes before
    // the load finishes, and nothing was pushing the update back afterward.
    // The image would only ever appear by the coincidence of buildPlanes()
    // running again later for an unrelated reason (a resize that changes
    // the plane count) after the load had already finished by then - which
    // explains every symptom: works "eventually" when that coincidence
    // lines up, breaks on SPA revisit when it doesn't, "needs another
    // reload" to get lucky again. The fix is for the load itself to update
    // whichever card(s) are currently showing this image, directly.
    getTexture(src) {
        let entry = this.textures.get(src);
        if (entry) return entry;

        entry = { texture: null, aspect: 1, loaded: false, failed: false };
        entry.texture = this.loader.load(
            src,
            (texture) => {
                if (this.disposed) return; // this instance is gone; don't touch it
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = this.anisotropy;
                texture.needsUpdate = true;
                entry.aspect = texture.image.width / texture.image.height;
                entry.loaded = true;

                // this.cards is read fresh here (not captured earlier), so
                // this is correct even if buildPlanes() already replaced
                // the whole array by the time this fires
                this.cards.forEach((card) => {
                    if (card.userData.entry !== entry) return;
                    const uniforms = card.material.uniforms;
                    uniforms.uMap.value = entry.texture;
                    uniforms.uImageAspect.value = entry.aspect;
                    uniforms.uReady.value = 1;
                });
            },
            undefined,
            (error) => {
                if (this.disposed) return;
                entry.failed = true;
                // eslint-disable-next-line no-console
                console.error(`[RingCarousel] Failed to load texture: ${src}`, error);
            },
        );
        this.textures.set(src, entry);
        return entry;
    }

    // The ring holds more planes than items when the viewport needs a larger
    // radius; items repeat in order around it.
    buildPlanes(count) {
        this.cards.forEach((card) => {
            this.ring.remove(card);
            card.material.dispose();
        });
        this.sides.forEach((side) => {
            this.ring.remove(side);
            side.material.dispose();
        });
        this.sides = [];
        this.glows.forEach((glow) => {
            this.ring.remove(glow);
            glow.material.dispose();
        });
        this.cards = [];
        this.glows = [];

        for (let i = 0; i < count; i++) {
            const item = this.items[i % this.items.length];
            const entry = this.getTexture(item.src);
            // Centre-focus amount (0..1), shared by the card and its glow so
            // edge and halo brighten together. Set each frame by updateFocus.
            const focus = { value: 0 };
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    ...this.shared,
                    uFocus: focus,
                    uMap: { value: entry.texture },
                    uImageAspect: { value: entry.aspect },
                    uReady: { value: entry.loaded ? 1 : 0 },
                },
                vertexShader: surfaceVertex,
                fragmentShader: cardFragment,
                side: THREE.DoubleSide,
            });

            const card = new THREE.Mesh(this.cardGeometry, material);
            card.rotation.order = "YXZ"; // turn around the ring, then lean locally
            card.userData.entry = entry;
            this.ring.add(card);
            this.cards.push(card);

            // The outer glow: the dedicated emissive/highlight layer. Additive,
            // no depth writes, and pulled slightly toward the camera with
            // polygon offset so it never z-fights its own plane; it only draws
            // outside the card, so it never overlaps its own image.
            const glowMaterial = new THREE.ShaderMaterial({
                uniforms: { ...this.shared, uFocus: focus },
                vertexShader: surfaceVertex,
                fragmentShader: glowFragment,
                side: THREE.DoubleSide,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1,
            });
            const glow = new THREE.Mesh(this.cardGeometry, glowMaterial);
            glow.rotation.order = "YXZ";
            this.ring.add(glow);
            this.glows.push(glow);

            // The card body: opaque and depth-tested like the face, and bent
            // by the same fluid push, so face and body deform as one.
            const sideMaterial = new THREE.ShaderMaterial({
                uniforms: { ...this.shared, uFocus: focus },
                defines: { USE_PLANE_NORMAL: "" },
                vertexShader: surfaceVertex,
                fragmentShader: sideFragment,
                side: THREE.DoubleSide,
            });
            const side = new THREE.Mesh(this.sideGeometry, sideMaterial);
            side.rotation.order = "YXZ";
            this.ring.add(side);
            this.sides.push(side);
        }
    }

    initFloor() {
        const floor = new Reflector(new THREE.PlaneGeometry(400, 400), {
            shader: floorShader,
            color: this.theme.clone().multiplyScalar(0.1), // dark floor in the theme hue
            clipBias: 0.003,
            textureWidth: 256,
            textureHeight: 256,
            multisample: 0, // the reflection is blurred: MSAA buys nothing
        });
        floor.rotation.x = -Math.PI / 2;
        floor.renderOrder = -2;
        floor.material.uniforms.uTexel.value = new THREE.Vector2(1 / 256, 1 / 256);
        floor.material.uniforms.uResolution.value = new THREE.Vector2(1, 1);
        floor.material.uniforms.uBackdropBase.value = this.backdrop.material.uniforms.uBase.value;
        floor.material.uniforms.uBackdropGlow.value = this.backdrop.material.uniforms.uGlow.value;
        floor.material.uniforms.uFluidStrength.value = this.backdrop.material.uniforms.uFluidStrength.value;
        floor.material.uniforms.uFluidCore.value = this.fluidCore;
        floor.material.uniforms.uFluidDyeScale.value = this.fluidDyeScale;

        // The mirrored pass reflects only the planes, with dimmed edges.
        // Tightly packed, the reflected top edges form a near-continuous row
        // that the blur smears into a band under the carousel; so the edge
        // is dimmed and the inner glow and outer glow quads are left out.
        // Also left out: the lower rim (its reflection would be a second line
        // just below it), the backdrop (a screen-space gradient whose
        // reflection is a full-width band) and the pointer ripple
        // (screen-space, would appear in the wrong place).
        const s = this.shared;
        const renderReflection = floor.onBeforeRender;
        floor.onBeforeRender = (...args) => {
            const energy = s.uPointerEnergy.value;
            const edgeLight = s.uEdgeLight.value;
            const centerTint = s.uCenterTint.value;
            const innerGlow = s.uInnerGlow.value;
            const edgeBloom = s.uEdgeBloom.value;
            const edgeBloomFocused = s.uEdgeBloomFocused.value;
            const surfaceBloom = s.uSurfaceBloom.value;
            const sideBloom = s.uSideBloom.value;
            const fluidOn = s.uFluidOn.value;
            s.uPointerEnergy.value = 0;
            s.uFluidOn.value = 0; // screen-space field; wrong coordinates here
            s.uEdgeLight.value = 0.35; // dim edge: the reflected row would smear into a band
            s.uCenterTint.value = 0; // screen-space term; wrong coordinates here
            s.uInnerGlow.value = 0;
            s.uEdgeBloom.value = 0;
            s.uEdgeBloomFocused.value = 0;
            s.uSurfaceBloom.value = 0;
            s.uSideBloom.value = 0;
            this.backdrop.visible = false;
            this.space.visible = false;
            this.rim.visible = false;
            for (const glow of this.glows) glow.visible = false;

            renderReflection.apply(floor, args);

            for (let i = 0; i < this.glows.length; i++) this.glows[i].visible = this.cards[i].visible;
            this.rim.visible = true;
            this.backdrop.visible = true;
            this.space.visible = true;
            s.uFluidOn.value = fluidOn;
            s.uInnerGlow.value = innerGlow;
            s.uEdgeBloom.value = edgeBloom;
            s.uEdgeBloomFocused.value = edgeBloomFocused;
            s.uSurfaceBloom.value = surfaceBloom;
            s.uSideBloom.value = sideBloom;
            s.uEdgeLight.value = edgeLight;
            s.uCenterTint.value = centerTint;
            s.uPointerEnergy.value = energy;
        };

        this.rig.add(floor);
        this.floor = floor;
    }

    // Scene -> multisampled HDR target -> tone mapping. No bloom pass: the
    // border glow is drawn per card, so nothing is derived from the frame.
    initComposer() {
        const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.quality.msaa });
        this.composer = new EffectComposer(this.renderer, target);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.composer.addPass(new OutputPass());
    }

    bindEvents() {
        const canvas = this.renderer.domElement;
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onTouchMove = this.onTouchMove.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onPointerOut = this.onPointerOut.bind(this);
        this.onBlur = this.onBlur.bind(this);
        this.resize = this.resize.bind(this);

        canvas.addEventListener("pointerdown", this.onPointerDown);
        canvas.addEventListener("pointerup", this.onPointerUp);
        canvas.addEventListener("pointercancel", this.onPointerUp);
        canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
        window.addEventListener("pointermove", this.onPointerMove, { passive: true });
        document.addEventListener("pointerout", this.onPointerOut);
        window.addEventListener("blur", this.onBlur);
        this.container.addEventListener("wheel", this.onWheel, { passive: true });
        this.container.addEventListener("keydown", this.onKeyDown);

        this.resizeObserver = new ResizeObserver(this.resize);
        this.resizeObserver.observe(this.container);
    }

    // -- input ---------------------------------------------------------------

    get maxVelocity() {
        return this.options.maxVelocity * this.step;
    }

    // A press only records where it started. It becomes a drag once the
    // pointer actually moves; a click (press + release in place) never
    // touches the rotation, momentum or auto-rotation.
    onPointerDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        this.drag = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastT: performance.now(),
            active: false,
            horizontal: false,
        };
        this.renderer.domElement.setPointerCapture(e.pointerId);
    }

    onPointerMove(e) {
        if (!this.options.externalPointer) {
            this.feedFluid(e.clientX, e.clientY);
            this.trackPointer(e.clientX, e.clientY);
            // Hover lean from the horizontal position only, inverted: mouse
            // left -> lean right. Mouse/pen hover only; touch never leans.
            if (e.pointerType !== "touch") {
                this.lean.target = -clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
            }
        }

        const drag = this.drag;
        if (!drag || e.pointerId !== drag.id) return;

        const now = performance.now();
        if (!drag.active) {
            if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5) return;
            drag.active = true;
            drag.lastX = e.clientX;
            drag.lastT = now;
            this.velocity = 0;
            this.container.classList.add("is-dragging");
        }

        const dx = e.clientX - drag.lastX;
        if (!drag.horizontal && Math.abs(e.clientX - drag.startX) > Math.abs(e.clientY - drag.startY) + 4) {
            drag.horizontal = true;
        }

        // The drag moves the target; the rendered ring eases after it.
        const delta = dx * this.radPerPixel * this.options.dragSensitivity;
        this.targetOffset += delta;

        const dt = Math.max(now - drag.lastT, 1) / 1000;
        this.velocity = THREE.MathUtils.lerp(this.velocity, delta / dt, 0.35);
        drag.lastX = e.clientX;
        drag.lastT = now;
    }

    onPointerUp(e) {
        const drag = this.drag;
        if (!drag || e.pointerId !== drag.id) return;

        this.drag = null;
        if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
            this.renderer.domElement.releasePointerCapture(e.pointerId);
        }
        if (!drag.active) return; // a click: leave the rotation alone

        // A pause before release means the user stopped: no fling.
        if (performance.now() - drag.lastT > 90 || e.type === "pointercancel") this.velocity = 0;
        // Momentum only carries on in the rotation direction. A fling the
        // other way just settles where it was dropped (via the follow easing)
        // and auto-rotation resumes right -> left; the direction never flips.
        if (Math.sign(this.velocity) !== this.autoDir) this.velocity = 0;
        this.velocity = clamp(this.velocity * this.options.releaseMomentum, -this.maxVelocity, this.maxVelocity);

        this.container.classList.remove("is-dragging");
    }

    // The mouse left the window (no element it moved to): ease back to neutral.
    // Pointer -> fluid injection point, in viewport uv (y up).
    feedFluid(clientX, clientY) {
        if (!this.fluid) return;
        const { rect } = this;
        this.fluid.setPointer((clientX - rect.left) / rect.width, 1 - (clientY - rect.top) / rect.height);
    }

    onPointerOut(e) {
        if (!e.relatedTarget && e.pointerType !== "touch") this.lean.target = 0;
        if (!e.relatedTarget) this.fluid?.pointerLeave();
    }

    onBlur() {
        this.lean.target = 0;
        this.fluid?.pointerLeave();
    }

    // `touch-action: pan-y` lets vertical swipes scroll the page. Once a drag
    // has locked horizontally, block scrolling until the finger lifts.
    onTouchMove(e) {
        if (this.drag?.horizontal) e.preventDefault();
    }

    onWheel(e) {
        const max = this.maxVelocity;
        this.velocity = clamp(this.velocity - e.deltaY * 0.004 * this.step, -max, max);
    }

    onKeyDown(e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        // With exponential friction the ring coasts v / friction: one card.
        this.velocity += (e.key === "ArrowRight" ? 1 : -1) * this.step * this.options.friction;
    }

    trackPointer(clientX, clientY) {
        const p = this.pointer;
        const now = performance.now();
        const dt = Math.max(now - p.lastT, 1) / 1000;
        const speed = Math.hypot(clientX - p.lastX, clientY - p.lastY) / dt;

        this.setPointerFromClient(clientX, clientY);
        p.energy = Math.max(p.energy, Math.min(1, speed / 1800));
        p.lastX = clientX;
        p.lastY = clientY;
        p.lastT = now;
    }

    setPointerFromClient(clientX, clientY) {
        const { rect, pointer: p } = this;
        const pr = this.renderer.getPixelRatio();
        p.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        p.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
        p.px = (clientX - rect.left) * pr;
        p.py = (rect.height - (clientY - rect.top)) * pr;
    }

    /**
     * Feed pointer data from another system (e.g. a cursor fluid simulation)
     * instead of the built-in tracking. Enable with `externalPointer: true`.
     * @param {{ x: number, y: number, energy?: number }} input
     *   x/y in normalised device coords (-1..1, y up); energy 0..1.
     */
    setPointerInput({ x, y, energy = 0 }) {
        const { rect } = this;
        this.lean.target = -clamp(x, -1, 1);
        const clientX = rect.left + ((x + 1) / 2) * rect.width;
        const clientY = rect.top + ((1 - y) / 2) * rect.height;
        this.setPointerFromClient(clientX, clientY);
        this.feedFluid(clientX, clientY);
        this.pointer.energy = Math.max(this.pointer.energy, clamp(energy, 0, 1));
    }

    // -- layout --------------------------------------------------------------

    resize() {
        const { container, renderer, camera, quality } = this;
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!width || !height) return;
        if (width === this.lastWidth && height === this.lastHeight) return;
        this.lastWidth = width;
        this.lastHeight = height;

        this.rect = container.getBoundingClientRect();
        const layout = computeLayout(width, height, this.items.length, this.options);
        this.layout = layout;

        if (layout.planeCount !== this.cards.length) {
            // Keep the same item in front when the plane count changes.
            const frontItem = this.cards.length ? mod(this.frontSlot(), this.items.length) : 0;
            this.buildPlanes(layout.planeCount);
            this.step = TAU / layout.planeCount;
            const unwrapped = -frontItem * this.step;
            this.offset = mod(unwrapped, TAU);
            this.targetOffset = this.offset;
            this.turnOffset = unwrapped - this.offset;
        }

        camera.fov = layout.fov;
        camera.aspect = layout.aspect;
        camera.far = layout.distance + layout.radius * 4 + 50;
        camera.updateProjectionMatrix();
        this.cameraBase.set(0, layout.frameH * 0.45, layout.distance);
        // Aim at the front card (not the ring centre) so the visible arc sits
        // in the middle of the frame, with the reflection just below.
        this.cameraTarget.set(0, -layout.frameH * 0.1, layout.radius);

        // Pointer pixels -> radians so the front cards track the finger.
        const worldPerPixel = (2 * layout.frontDistance * layout.tanHalf * layout.aspect) / width;
        this.radPerPixel = worldPerPixel / layout.radius;
        // One plane spacing at the front, in normalised screen units (NDC x).
        this.focusSpan = (layout.cardW * (1 + layout.gap)) / (layout.frontDistance * layout.tanHalf * layout.aspect);

        const s = this.shared;
        s.uSize.value.set(layout.cardW, layout.cardH);
        // Rounder corners keep neighbouring borders visibly separate.
        s.uRadius.value = layout.cardW * 0.1;
        s.uBorder.value = layout.cardW * this.options.borderWidth;
        s.uGlowWidth.value = layout.cardW * this.options.glowWidth;
        s.uEdgeFeather.value = layout.cardH * this.options.edgeFeather;
        s.uBloomWidth.value = layout.cardH * this.options.bloomWidth;
        s.uMargin.value = layout.cardW * this.options.glowMargin;
        s.uFluidMaxWarp.value = layout.cardW * this.options.fluidMaxWarp;
        s.uFluidBulge.value = layout.cardW * this.options.fluidBulge;
        s.uTanHalf.value = layout.tanHalf;
        s.uCamAspect.value = layout.aspect;
        s.uDepthNear.value = layout.radius;
        s.uDepthFar.value = -layout.radius;
        s.uPointerRadius.value = Math.min(width, height) * 0.22 * renderer.getPixelRatio();

        this.cards.forEach((card) => card.scale.set(layout.cardW, layout.cardH, 1));
        const margin = 2 * s.uMargin.value;
        this.glows.forEach((glow) => glow.scale.set(layout.cardW + margin, layout.cardH + margin, 1));
        this.updateOccluder();
        this.updateRim();
        this.updateSides();

        // Silhouette of the ring from the camera: points beyond acos(R / D)
        // are behind the front of the ring. Margin: a plane's half-width, two
        // spacings, and the parallax/lean swing, so nothing visible is culled.
        const silhouette = Math.acos(Math.min(1, layout.radius / layout.distance));
        const halfCard = Math.atan(layout.cardW / 2 / layout.radius);
        const cullMargin = halfCard + this.step * 2 + THREE.MathUtils.degToRad(6);
        this.visibleCos = Math.cos(Math.min(Math.PI, silhouette + cullMargin));

        const pr = renderer.getPixelRatio();
        const floorUniforms = this.floor.material.uniforms;
        this.floor.position.y = -layout.cardH * 0.6;
        this.space.resize(layout, this.cameraBase.y, this.floor.position.y, height * pr, pr);
        // Reflection resolution in CSS pixels (device ratio capped at 1.25):
        // it is blurred, so full device resolution only costs fill rate. The
        // blur radius is in texels, so it is rescaled to stay the same size.
        const reflectionRatio = Math.min(pr, 1.25);
        const rw = Math.max(1, Math.round(width * reflectionRatio * quality.reflectionScale));
        const rh = Math.max(1, Math.round(height * reflectionRatio * quality.reflectionScale));
        floorUniforms.uBlur.value = 2 * (reflectionRatio / pr);
        this.floor.getRenderTarget().setSize(rw, rh);
        floorUniforms.uTexel.value.set(1 / rw, 1 / rh);
        floorUniforms.uRadius.value = layout.radius - (layout.cardH / 2) * Math.sin(layout.tiltRad);
        floorUniforms.uMaskSoftness.value = layout.cardH * 0.03;
        floorUniforms.uFadeLength.value = layout.cardH * 2.2;
        floorUniforms.uFrontDistance.value = layout.frontDistance;
        floorUniforms.uResolution.value.set(width * pr, height * pr);
        s.uResolution.value.set(width * pr, height * pr);

        this.backdrop.material.uniforms.uAspect.value = layout.aspect;
        this.fluid?.resize(width, height);

        renderer.setSize(width, height);
        this.composer.setSize(width, height);
        this.positionCards();
        this.assignItems();
    }

    // A cone matching the planes' lean: narrower at the bottom, like the ring.
    updateOccluder() {
        const { radius, cardW, cardH, tiltRad } = this.layout;
        const height = cardH * 1.3;
        // Kept just behind the card bodies so their thickness never pokes through.
        const inner = radius - Math.max(radius * 0.015, 0.05, cardW * this.options.cardThickness * 1.3);
        const slope = Math.tan(tiltRad) * (height / 2);

        this.occluder.geometry.dispose();
        this.occluder.geometry = new THREE.CylinderGeometry(inner + slope, inner - slope, height, 160, 1, true);
    }

    // The rim uses the planes' own surface: a leaning plane centred at radius
    // R reaches radius R + y * tan(tilt) at height y. The band is centred a
    // little below the plane bottoms and is a cone with that same slope, so
    // it sits on the ring's actual curve. It is rotationally symmetric, so it
    // stays aligned while the ring turns.
    updateRim() {
        const { radius, cardW, cardH, tiltRad } = this.layout;
        const { options } = this;
        const slope = Math.tan(tiltRad);
        const bottom = -(cardH / 2) * Math.cos(tiltRad);
        const centerY = bottom - cardH * options.rimOffset;
        const haloWidth = cardW * options.rimHaloWidth;
        const bandHeight = haloWidth * 8;
        const radiusAt = (y) => radius + y * slope;

        this.rim.geometry.dispose();
        this.rim.geometry = new THREE.CylinderGeometry(
            radiusAt(centerY + bandHeight / 2),
            radiusAt(centerY - bandHeight / 2),
            bandHeight,
            256,
            2, // a vertex row on the line itself, so the fluid bends it accurately
            true,
        );
        this.rim.position.y = centerY;

        const u = this.rim.material.uniforms;
        u.uBandHeight.value = bandHeight;
        u.uCoreWidth.value = cardW * options.rimCoreWidth;
        u.uHaloWidth.value = haloWidth;
    }

    // Card body: a closed volume behind the face, following its rounded-rect
    // outline (same size and corner radius) from the face (z = 0) back to
    // -thickness. The face's width and height are unchanged; depth only goes
    // backward. The back edge is rounded by an inset bevel; the front edge
    // is rounded in shading only (tilted normals at the seam), so the face
    // keeps its exact outline. Straight edges are split at the face's grid
    // lines so the body bends with the fluid-deformed face.
    updateSides() {
        const { cardW, cardH } = this.layout;
        const { options } = this;
        const radius = this.shared.uRadius.value;
        const depth = cardW * options.cardThickness;
        const bevel = depth * options.cardBevel;
        const hw = cardW / 2 - radius;
        const hh = cardH / 2 - radius;
        const [segX, segY] = options.surfaceSegments;
        const perCorner = 10;

        // Outline, counter-clockwise from the front: [x, y, outward nx, ny].
        const outline = [];
        const gridLine = (i, seg, size) => -size / 2 + (i / seg) * size;
        const edge = (from, to, seg, size, point) => {
            const lo = Math.min(from, to);
            const hi = Math.max(from, to);
            const inner = [];
            for (let i = 1; i < seg; i++) {
                const t = gridLine(i, seg, size);
                if (t > lo + 1e-6 && t < hi - 1e-6) inner.push(t);
            }
            if (from > to) inner.reverse();
            inner.forEach((t) => outline.push(point(t)));
        };
        const corners = [[hw, hh, 0], [-hw, hh, Math.PI / 2], [-hw, -hh, Math.PI], [hw, -hh, Math.PI * 1.5]];
        corners.forEach(([cx, cy, start], c) => {
            for (let k = 0; k <= perCorner; k++) {
                const a = start + (k / perCorner) * (Math.PI / 2);
                outline.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, Math.cos(a), Math.sin(a)]);
            }
            if (c === 0) edge(hw, -hw, segX, cardW, (x) => [x, cardH / 2, 0, 1]);
            if (c === 1) edge(hh, -hh, segY, cardH, (y) => [-cardW / 2, y, -1, 0]);
            if (c === 2) edge(-hw, hw, segX, cardW, (x) => [x, -cardH / 2, 0, -1]);
            if (c === 3) edge(-hh, hh, segY, cardH, (y) => [cardW / 2, y, 1, 0]);
        });

        // Profile from front to back: [inset, z, outward share, z share of the normal].
        const seamTilt = Math.SQRT1_2;
        const profile = [[0, 0, seamTilt, seamTilt], [0, -(depth - bevel), 1, 0]];
        const bevelSteps = 4;
        for (let k = 1; k <= bevelSteps; k++) {
            const t = (k / bevelSteps) * (Math.PI / 2);
            profile.push([bevel * (1 - Math.cos(t)), -(depth - bevel) - bevel * Math.sin(t), Math.cos(t), -Math.sin(t)]);
        }

        const positions = [];
        const normals = [];
        const uvs = [];
        const index = [];
        const add = (x, y, z, nx, ny, nz) => {
            positions.push(x, y, z);
            normals.push(nx, ny, nz);
            uvs.push(x / cardW + 0.5, y / cardH + 0.5);
            return positions.length / 3 - 1;
        };

        // Sidewall rings.
        const count = outline.length;
        const rings = profile.map(([inset, z, out, nz]) =>
            outline.map(([x, y, nx, ny]) => add(x - nx * inset, y - ny * inset, z, nx * out, ny * out, nz)),
        );
        for (let r = 0; r < rings.length - 1; r++) {
            for (let i = 0; i < count; i++) {
                const j = (i + 1) % count;
                const a = rings[r][i];
                const b = rings[r][j];
                const c = rings[r + 1][i];
                const d = rings[r + 1][j];
                index.push(a, c, b, b, c, d);
            }
        }

        // Back: a flat fan over the inset outline (convex), facing -z.
        const center = add(0, 0, -depth, 0, 0, -1);
        const back = outline.map(([x, y, nx, ny]) => add(x - nx * bevel, y - ny * bevel, -depth, 0, 0, -1));
        for (let i = 0; i < count; i++) index.push(center, back[(i + 1) % count], back[i]);

        const geometry = this.sideGeometry;
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(index);
        geometry.computeBoundingSphere();
    }

    positionCards() {
        const { radius, tiltRad } = this.layout;
        this.cards.forEach((card, i) => {
            const angle = i * this.step + this.offset;
            card.position.set(radius * Math.sin(angle), 0, radius * Math.cos(angle));
            card.rotation.y = angle;
            // Top leans out, bottom leans in: the lower radius is smaller.
            card.rotation.x = tiltRad;

            // The glow shares the card's exact transform (same plane).
            const glow = this.glows[i];
            glow.position.copy(card.position);
            glow.rotation.copy(card.rotation);
            // Planes past the ring's silhouette (seen from the camera) are
            // behind the depth mask and can never be seen: skip drawing them
            // in both passes, with their glow and sidewall.
            const visible = Math.cos(angle) > this.visibleCos;
            card.visible = visible;
            glow.visible = visible;
            const side = this.sides[i];
            side.visible = visible;
            side.position.copy(card.position);
            side.rotation.copy(card.rotation);
        });
    }

    // -- per frame -----------------------------------------------------------

    // Auto-rotation, momentum and drag all move targetOffset; the rendered
    // offset eases toward it, which gives dragging its heavy, delayed feel.
    // In steady auto-rotation the ease just trails by a constant amount, so
    // the rotation speed is unchanged.
    // Auto-rotation never pauses: it keeps advancing the target during and
    // after a drag, so a drag (either way) is only an offset on top of it and
    // on release the eased ring flows straight back into right -> left.
    updateMotion(dt) {
        const { options } = this;
        this.autoBlend = damp(this.autoBlend, this.reducedMotion ? 0 : 1, 1.2, dt);
        const autoVelocity = options.autoSpeed * this.step * this.autoDir * this.autoBlend;
        this.targetOffset += autoVelocity * dt;

        // While dragging, `velocity` only samples the pointer (for the
        // release fling); the drag itself moves the target directly.
        //
        // ======================================================================
        // Everything below this point, through the end of the class, was never
        // provided (the paste cut off right above this line) and is written by
        // me, not copied from any source - reasoned from the variable names,
        // constructor state, and comments already in the rest of this file
        // (e.g. "Set each frame by updateFocus", the followDamping/friction
        // fields in DEFAULTS, this.turnOffset's own doc comment). Replace this
        // whole block without hesitation if the real methods turn up.
        // ======================================================================
        if (!this.drag) {
            // Momentum decays exponentially and keeps nudging the target
            // while it's non-zero (a release fling, or a wheel/arrow nudge);
            // dragging itself already moves targetOffset directly above.
            this.targetOffset += this.velocity * dt;
            this.velocity *= Math.exp(-options.friction * dt);
            if (Math.abs(this.velocity) < 1e-4) this.velocity = 0;
        }

        // The rendered offset eases toward the target - this is what gives
        // dragging its heavy, delayed feel (see the comment above this
        // method) and folds auto-rotation's own steady advance into the
        // same easing curve.
        this.offset = damp(this.offset, this.targetOffset, options.followDamping, dt);

        // Keep both offsets bounded so they never drift toward float
        // precision limits on a long-lived page - trig is periodic, so
        // removing whole turns from both at once changes no rendered angle.
        // turnOffset (see the constructor) accumulates exactly what's
        // removed, so frontSlot()'s own math stays correct across wraps.
        if (Math.abs(this.offset) > TAU) {
            const turns = Math.trunc(this.offset / TAU) * TAU;
            this.offset -= turns;
            this.targetOffset -= turns;
            this.turnOffset += turns;
        }
    }

    // Continuous "which slot is at the front" position: at the front,
    // i * step + offset ~= 0 (mod TAU), so i ~= -offset / step. Fractional
    // between two integers while the ring is mid-turn between them.
    frontSlot() {
        return -this.offset / this.step;
    }

    // Centre-focus amount per card/glow/side triple (see the shared `focus`
    // uniform object created per card in buildPlanes) - projects each
    // card's actual world position to screen space (NDC) rather than using
    // its array index, so the plane that reads as "centred" is always
    // whichever one is actually nearest screen-centre, lean/parallax
    // included. Falls off across `focusWidth` plane-spacings (focusSpan,
    // computed in resize()) and is damped like every other eased value here.
    updateFocus(dt) {
        // The camera's own position/orientation are set later in tick(),
        // right before this runs, but matrixWorld is only ever refreshed
        // lazily during a render pass - update it explicitly so the
        // projection below reflects this frame's camera, not last frame's.
        this.camera.updateMatrixWorld();
        this.cards.forEach((card, i) => {
            this.focusPoint.copy(card.position).project(this.camera);
            const distance = card.visible ? Math.abs(this.focusPoint.x) / (this.focusSpan * this.options.focusWidth) : Infinity;
            const target = clamp(1 - distance, 0, 1);
            const focusUniform = this.cards[i].material.uniforms.uFocus;
            focusUniform.value = damp(focusUniform.value, target, this.options.focusDamping, dt);
        });
    }

    // Maps the current front slot back to an item (buildPlanes assigns each
    // slot i a fixed item at items[i % items.length], so this never needs
    // to re-texture anything - it only tracks *which* item that currently
    // is) and fires onActiveChange when it changes, per the "center-screen
    // focus detection... never hardcoded by array index" requirement.
    assignItems() {
        if (!this.cards.length) return;
        const slot = mod(Math.round(this.frontSlot()), this.cards.length);
        const itemIndex = slot % this.items.length;
        if (itemIndex === this.activeIndex) return;
        this.activeIndex = itemIndex;
        this.options.onActiveChange?.(itemIndex, this.items[itemIndex]);
    }

    // Bound once as a class field (not in bindEvents' .bind() list) since
    // the constructor hands it straight to setAnimationLoop.
    tick = () => {
        const now = performance.now();
        // Clamped so a backgrounded/stalled tab catching back up doesn't
        // fling the ring through several seconds of motion in one jump.
        const dt = Math.min((now - this.lastTime) / 1000, 1 / 30);
        this.lastTime = now;
        this.elapsed += dt;

        this.updateMotion(dt);

        this.lean.current = damp(this.lean.current, this.lean.target, this.options.leanDamping, dt);
        // Negated: a positive Z rotation is counter-clockwise (top leans
        // left) in Three.js's convention, but onPointerMove's own comment
        // above ("mouse left -> lean right") states the opposite as the
        // intended visual result, so this sign flip is what actually
        // delivers that, not a contradiction of it.
        this.rig.rotation.z = -THREE.MathUtils.degToRad(this.options.leanAngle) * this.lean.current;

        this.positionCards();

        // Camera is effectively static (cameraBase/cameraTarget only change
        // on resize), but set every frame anyway - cheap, and guarantees
        // updateFocus() below always projects against this frame's camera.
        this.camera.position.copy(this.cameraBase);
        this.camera.lookAt(this.cameraTarget);

        this.updateFocus(dt);
        this.assignItems();

        // Pointer energy (drives the glass ripple in cardFragment) decays
        // on its own; trackPointer only ever raises it on real movement.
        this.pointer.energy = damp(this.pointer.energy, 0, 1.5, dt);
        this.shared.uPointer.value.set(this.pointer.px, this.pointer.py);
        this.shared.uPointerEnergy.value = this.pointer.energy;
        this.shared.uTime.value = this.elapsed;

        this.space.update(this.elapsed);

        // Advance the one shared fluid field and hand its two textures to
        // everything that reads them: the card/glow/rim shaders (uFluidDye/
        // uFluidVelocity/uFluidTexel, all in `shared`, see initCards), and
        // the backdrop and floor's own `uFluid` (both declared with
        // {value: null} in initScene/initFloor and never set elsewhere -
        // this is the one place all of it gets fed each frame).
        if (this.fluid) {
            this.fluid.step(dt);
            const dyeTexture = this.fluid.dyeTexture;
            this.shared.uFluidDye.value = dyeTexture;
            this.shared.uFluidVelocity.value = this.fluid.velocityTexture;
            this.shared.uFluidTexel.value.copy(this.fluid.texel);
            this.backdrop.material.uniforms.uFluid.value = dyeTexture;
            this.floor.material.uniforms.uFluid.value = dyeTexture;
        }

        this.composer.render();
    };

    // Mirrors the teardown style already used elsewhere in this codebase
    // (WorkBee.jsx, ManifestoMonitor.jsx): stop the loop first, then unwind
    // everything the constructor/resize created, in roughly reverse order.
    dispose() {
        // first, so any texture load already in flight sees it and skips
        // touching this instance's (about to be torn down) materials
        this.disposed = true;
        this.renderer.setAnimationLoop(null);
        this.resizeObserver.disconnect();

        const canvas = this.renderer.domElement;
        canvas.removeEventListener("pointerdown", this.onPointerDown);
        canvas.removeEventListener("pointerup", this.onPointerUp);
        canvas.removeEventListener("pointercancel", this.onPointerUp);
        canvas.removeEventListener("touchmove", this.onTouchMove);
        window.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerout", this.onPointerOut);
        window.removeEventListener("blur", this.onBlur);
        this.container.removeEventListener("wheel", this.onWheel);
        this.container.removeEventListener("keydown", this.onKeyDown);

        this.cards.forEach((card) => card.material.dispose());
        this.glows.forEach((glow) => glow.material.dispose());
        this.sides.forEach((side) => side.material.dispose());
        this.cardGeometry.dispose();
        this.sideGeometry.dispose();
        this.textures.forEach((entry) => entry.texture.dispose());

        this.occluder.geometry.dispose();
        this.occluder.material.dispose();
        this.rim.geometry.dispose();
        this.rim.material.dispose();

        this.space.dispose();
        this.backdrop.geometry.dispose();
        this.backdrop.material.dispose();

        this.floor.geometry.dispose();
        this.floor.material.dispose();
        this.floor.dispose?.();

        this.fluid?.dispose();

        this.composer.dispose();
        this.renderer.dispose();
        if (canvas.parentNode === this.container) this.container.removeChild(canvas);
    }
}
