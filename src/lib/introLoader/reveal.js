import * as THREE from "three";
import gsap from "gsap";
import { vertexShader, fragmentShader } from "./shader";
import { renderPixelRatio, FrameWatch } from "@/lib/renderQuality";

// The intro's shader: one full-screen canvas inside the intro overlay, under
// the dial. It starts flowing as soon as it is created and keeps rendering
// (on the GSAP ticker, uniforms written in place) for the whole countdown;
// play() then dissolves it into the hero; dispose() stops it all.
//
// Cost control: rendered at most ~60 times a second (a slow flow gains
// nothing at 120Hz), at an adaptive resolution (lib/renderQuality.js) that
// may step down only in its first 1.5s, while the field settles in -
// never later. The flow clock only advances by real frame time, capped, so a
// hidden tab or a stall never makes the pattern jump. A lost WebGL context
// (iOS under memory pressure) just stops drawing: IntroLoader then fades the
// overlay instead of dissolving it.
export class IntroReveal {
  constructor(container, config) {
    this.config = config;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "intro-canvas";
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, premultipliedAlpha: true, antialias: false });
    this.renderer.setPixelRatio(renderPixelRatio());
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    const color = (hex) => new THREE.Color(hex).convertLinearToSRGB();
    this.uniforms = {
      uEmerge: { value: 0 },
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uColor: { value: color(config.color) },
      uDark: { value: color(config.darkColor) },
      uSilver: { value: color(config.silverColor) },
      uAccent: { value: color(config.accentColor) },
      uDarkness: { value: config.darkness },
      uContrast: { value: config.contrast },
      uScale: { value: config.flowScale },
      uWarp: { value: config.warp },
      uStriations: { value: config.striationDensity },
      uStriationWidth: { value: config.striationWidth },
      uStriationContrast: { value: config.striationContrast },
      uFlowSpeed: { value: config.flowSpeed },
      uDeform: { value: config.deform },
      uDetail: { value: config.detail },
      uAccentIntensity: { value: config.accentIntensity },
      uAccentCoverage: { value: config.accentCoverage },
      uAccentWidth: { value: config.accentWidth },
      uGrain: { value: config.grain },
      uGrainScale: { value: config.grainScale },
      uRevealSoftness: { value: config.revealSoftness },
      uSeed: { value: config.seed },
    };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, transparent: true, depthTest: false }),
    );
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    // resize events (address bar, rotation) are applied once, on the next frame
    this.needsResize = true;
    this.onResize = () => (this.needsResize = true);
    window.addEventListener("resize", this.onResize);
    this.resize();
    this.lost = false;
    this.onLost = (event) => {
      event.preventDefault();
      this.lost = true;
      this.onContextLost?.();
    };
    this.canvas.addEventListener("webglcontextlost", this.onLost);
    this.renderer.compile(this.scene, this.camera);
    this.ready = Promise.resolve(); // fully procedural: nothing to load

    // flowing from the first frame, independent of the countdown; the
    // contours fade in over the plain base colour so nothing pops
    this.createdAt = performance.now();
    this.clock = 0;
    this.lastTick = 0;
    this.lastRender = 0;
    this.watch = new FrameWatch();
    gsap.to(this.uniforms.uEmerge, { value: 1, duration: config.emergeDuration, ease: "sine.out" });
    this.tick = () => this.render();
    gsap.ticker.add(this.tick);
  }

  resize() {
    this.needsResize = false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = renderPixelRatio();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.uniforms.uAspect.value = w / h;
    this.uniforms.uPixelRatio.value = ratio;
  }

  render() {
    if (this.lost || this.disposed) return;
    const now = performance.now();
    // the flow clock: real frame time, capped
    if (this.lastTick) this.clock += Math.min(now - this.lastTick, 100);
    this.lastTick = now;
    // ~60fps is plenty for a slow flow; skip the in-between frames at 120Hz
    if (this.lastRender && now - this.lastRender < 14) return;
    this.lastRender = now;
    // a slow device steps down; the loader itself only applies that in its
    // first 1.5s (real time) while the field settles in, never visibly later -
    // a later step still lowers the shared setting for the page transitions
    if (this.watch.sample(now) && now - this.createdAt < 1500) this.needsResize = true;
    if (this.needsResize) this.resize();
    this.uniforms.uTime.value = this.clock / 1000;
    this.renderer.render(this.scene, this.camera);
  }

  // the dissolve into the hero; the field keeps flowing while it runs
  play(duration, ease) {
    return new Promise((resolve) => {
      this.tween = gsap.to(this.uniforms.uProgress, {
        value: 1,
        duration,
        ease,
        onComplete: () => {
          this.tween = null;
          resolve();
        },
        onInterrupt: resolve,
      });
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    gsap.ticker.remove(this.tick);
    gsap.killTweensOf(this.uniforms.uEmerge);
    this.tween?.kill();
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
