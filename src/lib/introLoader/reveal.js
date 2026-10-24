import * as THREE from "three";
import gsap from "gsap";
import { vertexShader, fragmentShader } from "./shader";

// The intro's shader: one full-screen canvas inside the intro overlay, under
// the dial. It starts flowing as soon as it is created and keeps rendering
// (on the GSAP ticker, uniforms written in place) for the whole countdown;
// play() then dissolves it into the hero; dispose() stops it all.
export class IntroReveal {
  constructor(container, config) {
    this.config = config;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "intro-canvas";
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, premultipliedAlpha: true, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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

    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    this.resize();
    this.renderer.compile(this.scene, this.camera);
    this.ready = Promise.resolve(); // fully procedural: nothing to load

    // flowing from the first frame, independent of the countdown; the
    // contours fade in over the plain base colour so nothing pops
    this.startedAt = performance.now();
    gsap.to(this.uniforms.uEmerge, { value: 1, duration: config.emergeDuration, ease: "sine.out" });
    this.tick = () => this.render();
    gsap.ticker.add(this.tick);
  }

  // applied on the next ticker frame (at most one resize per frame)
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.uniforms.uAspect.value = w / h;
  }

  render() {
    this.uniforms.uTime.value = (performance.now() - this.startedAt) / 1000;
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
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
