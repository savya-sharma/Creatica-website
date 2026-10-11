// Mouse-driven smoke behind the whole About page.
//
// The same GPU fluid as the portraits (fluid.js), plus its dye channel: the
// pointer injects velocity and smoke, the field advects/swirls/decays, and a
// full-screen quad draws the dye as a soft tint over the page background. The
// canvas is fixed behind all page content (people.css: the page becomes a
// stacking context and the canvas sits at z-index -1), so it never covers
// text and never takes pointer events.
//
// Field space = the viewport in units of 100 CSS px, y up. With followScroll
// the field is shifted by the page scroll, so smoke travels with the content
// instead of sticking to the screen.
//
// Strokes over the carousel stage paint smoke too: it shows through the
// stage around and between the portraits, while the portraits themselves
// keep their own fluid. Optional FluidText blocks (fluidText.js) are drawn
// into the same canvas and distorted by the same field.

import { Color, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from "three";
import { BACKGROUND_FLUID_CONFIG } from "./config.js";
import { FluidField, PointerStroke, supportsFluid } from "./fluid.js";
import { FluidText } from "./fluidText.js";
import { MAX_FRAME_DT } from "./math.js";

const UNIT = 100; // CSS px per field unit (matches fluidText.js)

const smokeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const smokeFragment = /* glsl */ `
  uniform sampler2D uDye;
  uniform vec3 uColor;       // sRGB
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float d = texture2D(uDye, vUv).r;
    // soft knee so thin wisps stay faint and dense smoke never goes opaque
    float a = (1.0 - exp(-d * 2.2)) * uIntensity;
    gl_FragColor = vec4(uColor * a, a); // premultiplied
  }
`;

export class AboutFluidBackground {
  /**
   * @param {HTMLElement} page the About page root; the smoke sits behind its content
   * @param {Partial<typeof BACKGROUND_FLUID_CONFIG>} options
   * @param {HTMLElement[]} texts optional text blocks to draw with the fluid (see collectFluidTexts)
   */
  constructor(page, options = {}, texts = []) {
    this.page = page;
    this.c = { ...BACKGROUND_FLUID_CONFIG, ...options };
    this.disposed = false;
    this.active = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!this.c.enabled || reducedMotion) return;

    this.renderer = new WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
    if (!supportsFluid(this.renderer)) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
      return;
    }
    this.active = true;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "about-fluid-background";
    this.canvas.setAttribute("aria-hidden", "true");
    page.classList.add("has-fluid-background");
    page.append(this.canvas); // last, so CSS like .about-section:first-child is unaffected

    this.field = new FluidField(this.renderer, { dye: true });
    this.stroke = new PointerStroke();
    this.target = new Vector2();
    this.hasTarget = false;

    // CSS colours are sRGB; the shader writes as-is into an sRGB canvas
    const color = new Color(this.c.color).convertLinearToSRGB();
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.smoke = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        vertexShader: smokeVertex,
        fragmentShader: smokeFragment,
        uniforms: {
          uDye: { value: null },
          uColor: { value: color },
          uIntensity: { value: this.c.intensity },
        },
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
      })
    );
    this.smoke.frustumCulled = false;
    this.scene.add(this.smoke);

    this.texts = texts.map((el) => new FluidText(el, this.c));
    for (const text of this.texts) this.scene.add(text.mesh);

    this.raf = 0;
    this.lastTime = 0;
    this.elapsed = 0;
    this.quietFor = Infinity;
    this.scrollY = window.scrollY;
    this.scrollShift = 0;
    this.tick = this.tick.bind(this);

    this.onPointerMove = (e) => {
      this.target.set(e.clientX / UNIT, (window.innerHeight - e.clientY) / UNIT);
      this.hasTarget = true;
      this.wake();
    };
    this.onPointerLeave = () => (this.hasTarget = false);
    this.onScroll = () => {
      const y = window.scrollY;
      // page scrolls down -> content (and its smoke) moves up (field y is up)
      if (this.c.followScroll) this.scrollShift += (y - this.scrollY) / UNIT;
      this.scrollY = y;
      if (this.texts.length) this.wake();
    };
    this.onResize = () => this.resize();
    this.onVisibility = () => (document.hidden ? this.sleep() : this.wake());

    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);

    this.resize();
    if (this.texts.length) {
      for (const text of this.texts) text.activate();
      this.wake();
    }
  }

  resize() {
    if (!this.active) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    // smoke is soft, so a low resolution is enough - unless text is drawn too
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = this.texts.length ? dpr : this.c.resolutionScale;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    this.field.resize(width / UNIT, height / UNIT, this.c.cellSize, 512, this.c.dyeScale);
    this.smoke.material.uniforms.uDye.value = this.field.dyeTexture;
    for (const text of this.texts) text.rasterize(dpr);
    this.stroke.reset();
    this.quietFor = Infinity;
    this.render();
  }

  wake() {
    if (!this.active || this.disposed || this.raf || document.hidden) return;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  sleep() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  tick(now) {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DT);
    this.lastTime = now;
    this.elapsed += dt;
    if (dt <= 0) return;

    const c = this.c;
    const shift = this.scrollShift;
    this.scrollShift = 0;
    // the pointer is measured on screen, so scrolling under a still mouse
    // moves the smoke but paints none
    const splat = this.stroke.step(dt, this.hasTarget ? this.target : null, 0, 0, c);

    if (splat) this.quietFor = 0;
    else this.quietFor += dt;
    // velocity and smoke have both decayed below ~2% (ln 50 ~ 3.9)
    const settle = 3.9 / Math.min(c.fluidDissipation, c.dyeDissipation);
    if (this.quietFor > settle) {
      if (!this.field.idle) this.field.clear();
      this.render();
      // with text on screen keep tracking its position; otherwise stop
      if (!this.texts.length) this.sleep();
      return;
    }

    this.field.advance(dt, this.elapsed, 0, shift, splat, c);
    this.render();
  }

  render() {
    const renderer = this.renderer;
    renderer.setRenderTarget(null);
    renderer.clear();
    this.smoke.visible = !this.field.idle;
    const velocity = this.field.idle ? null : this.field.texture;
    let resized = false;
    for (const text of this.texts) {
      resized = text.update(window.innerWidth, window.innerHeight, velocity, this.elapsed) || resized;
    }
    if (resized) for (const text of this.texts) text.rasterize(Math.min(window.devicePixelRatio || 1, 2));
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.active) return;
    this.sleep();
    window.removeEventListener("pointermove", this.onPointerMove);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const text of this.texts) text.dispose();
    this.texts = [];
    this.field.dispose();
    this.smoke.geometry.dispose();
    this.smoke.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this.page.classList.remove("has-fluid-background");
    this.active = false;
  }
}
