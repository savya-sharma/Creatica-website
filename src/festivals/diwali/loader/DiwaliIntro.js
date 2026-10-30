import * as THREE from "three";
import gsap from "gsap";
import { vertexShader, fragmentShader } from "./shader";
import { renderPixelRatio, FrameWatch } from "@/lib/renderQuality";
import "./loader.css";

// The Diwali entry loader's scene (registry theme `loader.scene: "diwali"`):
// IntroLoader.jsx uses it in place of the default marble (IntroReveal),
// through the same interface - created behind the dial, it emerges from the
// overlay's colour and keeps rendering; setLoad() feeds it the count, play()
// opens it into the hero, dispose() stops it all. With no festival the
// loader never loads it.
//
// One full-screen canvas in the overlay (the default's own place), on the
// GSAP ticker, at most ~60 renders a second at an adaptive resolution
// (lib/renderQuality.js, stepping down only in its first 1.5s). The clock
// advances by real frame time, capped, so a stall never jumps it. A lost
// WebGL context just stops drawing: IntroLoader then fades the overlay.
export class DiwaliIntro {
  constructor(container, config) {
    this.config = config;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "intro-canvas";
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, premultipliedAlpha: true, antialias: false });
    this.renderer.setPixelRatio(renderPixelRatio());
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.uniforms = {
      uTime: { value: 0 },
      uLoad: { value: 0 },
      uProgress: { value: 0 },
      uEmerge: { value: 0 },
      uAspect: { value: 1 },
      // the overlay's own colour, so the first frames match it exactly
      uBase: { value: new THREE.Color(config.color).convertLinearToSRGB() },
    };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, transparent: true, depthTest: false }),
    );
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.needsResize = true;
    this.onResize = () => (this.needsResize = true);
    window.addEventListener("resize", this.onResize);
    this.resize();
    this.lost = false;
    this.onLost = (event) => {
      event.preventDefault();
      this.lost = true;
    };
    this.canvas.addEventListener("webglcontextlost", this.onLost);
    this.renderer.compile(this.scene, this.camera);
    this.ready = Promise.resolve(); // fully procedural: nothing to load

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
    const ratio = renderPixelRatio();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
  }

  /** The count, 0..1: the rangoli draws itself in with it. */
  setLoad(value) {
    this.uniforms.uLoad.value = Math.min(1, Math.max(0, value));
  }

  render() {
    if (this.lost || this.disposed) return;
    const now = performance.now();
    if (this.lastTick) this.clock += Math.min(now - this.lastTick, 100);
    this.lastTick = now;
    if (this.lastRender && now - this.lastRender < 14) return;
    this.lastRender = now;
    if (this.watch.sample(now) && now - this.createdAt < 1500) this.needsResize = true;
    if (this.needsResize) this.resize();
    this.uniforms.uTime.value = this.clock / 1000;
    this.renderer.render(this.scene, this.camera);
  }

  // the reveal: the flame flares, then the dark opens into the hero
  play(duration, ease) {
    this.setLoad(1);
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
