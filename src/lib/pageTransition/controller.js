import * as THREE from "three";
import gsap from "gsap";
import { MAX_POINTS, vertexShader, fragmentShader } from "./shader";
import { makePoints } from "./points";
import { whenIdle } from "@/lib/whenIdle";

// Draws the organic blob transition: one fixed full-screen canvas, hidden
// (and not rendering) while idle.
//
//   cover()      blobs grow from scattered points until the screen is full
//   reveal()     holes grow from a fresh set of points until it is empty
//   setCovered() jump straight to full cover (browser back/forward)
//   interrupt()  stop the running phase where it is (its promise resolves)
//
// cover() called mid-reveal shrinks the holes back closed instead of
// jumping, so rapid navigation never flickers.
export class BlobTransition {
  constructor(config) {
    this.config = config;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "page-transition";
    this.canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, premultipliedAlpha: true, antialias: false });
    // soft organic shapes need no high-DPI detail
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();

    const color = (hex) => new THREE.Color(hex).convertLinearToSRGB();
    this.uniforms = {
      uPoints: { value: Array.from({ length: MAX_POINTS }, () => new THREE.Vector4()) },
      uCount: { value: 0 },
      uProgress: { value: 0 },
      uInvert: { value: 0 },
      uNoise: { value: this.fallbackNoise() },
      uNoiseIntensity: { value: config.noiseIntensity },
      uNoiseScale: { value: config.noiseScale },
      uBlobScale: { value: config.blobScale },
      uEdgeSoftness: { value: config.edgeSoftness },
      uMoveSpeed: { value: config.moveSpeed },
      uNoiseSmoothing: { value: config.noiseSmoothing },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uColor: { value: color(config.color) },
      uRimColor: { value: color(config.rimColor) },
    };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, transparent: true, depthTest: false }),
    );
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    new THREE.TextureLoader().load(
      config.noiseTexture,
      (texture) => {
        if (this.disposed) return texture.dispose();
        // mirrored, not plain repeat: any image then tiles without a seam,
        // seamless or not, so the texture stays freely replaceable
        texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
        this.uniforms.uNoise.value.dispose();
        this.uniforms.uNoise.value = texture;
        // upload it now, not in the first frame of a transition
        this.renderer.initTexture(texture);
      },
      undefined,
      () => {}, // keep the generated fallback
    );

    this.seedCounter = 0;
    this.points = [];
    this.tween = null;
    this.resolveTween = null;
    // resize events arrive many times a frame while dragging: one resize
    // (and at most one render) per frame
    this.resizeFrame = 0;
    this.onResize = () => {
      if (!this.resizeFrame) this.resizeFrame = requestAnimationFrame(() => this.resize());
    };
    window.addEventListener("resize", this.onResize);
    this.resize();
    this.show(false);
    // compile the shader while the browser is idle, so the first transition
    // doesn't stall on its first frame
    this.cancelWarm = whenIdle(() => {
      if (!this.disposed) this.renderer.compile(this.scene, this.camera);
    });

    if (typeof config.progress === "number") {
      this.usePoints();
      this.uniforms.uProgress.value = config.progress;
      this.show(true);
      this.render();
    }
  }

  // a stand-in noise until (or if never) the texture loads
  fallbackNoise() {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const v = Math.floor(Math.random() * 256);
      data.set([v, v, v, 255], i * 4);
    }
    const texture = new THREE.DataTexture(data, size, size);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  resize() {
    this.resizeFrame = 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.uniforms.uAspect.value = w / h;
    this.applyPoints();
    // a running tween renders on its own next frame
    if (this.visible && !this.tween) this.render();
  }

  // a fresh set of blob origins per phase (repeatable when seeded)
  usePoints() {
    const { pointCount, seed } = this.config;
    const count = Math.max(1, Math.min(MAX_POINTS, pointCount));
    const s = seed == null ? Math.floor(Math.random() * 2 ** 31) : seed + this.seedCounter++;
    this.points = makePoints(count, s, this.uniforms.uAspect.value);
    this.uniforms.uCount.value = count;
    this.applyPoints();
  }

  // x goes to the uniforms already scaled by the aspect ratio, so the shader
  // doesn't redo that multiply for every blob, pixel and frame
  applyPoints() {
    const aspect = this.uniforms.uAspect.value;
    this.points.forEach((pt, i) => {
      this.uniforms.uPoints.value[i].set(pt.x * aspect, pt.y, pt.delay, pt.size);
    });
  }

  show(visible) {
    this.visible = visible;
    this.canvas.style.display = visible ? "block" : "none";
  }

  // while covering the page blocks clicks; during a reveal it lets them
  // through, so a new navigation can start straight away
  setBlocking(blocking) {
    this.canvas.style.pointerEvents = blocking ? "auto" : "none";
  }

  render() {
    this.uniforms.uTime.value = performance.now() / 1000;
    this.renderer.render(this.scene, this.camera);
  }

  // tweens uProgress, rendering each frame; resolves when done or interrupted
  animate(to, duration, ease) {
    this.interrupt();
    return new Promise((resolve) => {
      this.resolveTween = resolve;
      const finish = () => {
        this.tween = null;
        this.resolveTween = null;
        resolve();
      };
      this.tween = gsap.to(this.uniforms.uProgress, {
        value: to,
        duration,
        ease,
        onUpdate: () => this.render(),
        onComplete: finish,
      });
    });
  }

  interrupt() {
    if (!this.tween) return;
    this.tween.kill();
    this.tween = null;
    const resolve = this.resolveTween;
    this.resolveTween = null;
    resolve?.();
  }

  get revealing() {
    return this.visible && this.uniforms.uInvert.value === 1;
  }

  get covered() {
    const u = this.uniforms;
    return this.visible && u.uInvert.value === 0 && u.uProgress.value >= 1;
  }

  async cover() {
    const u = this.uniforms;
    const { coverDuration, coverEase } = this.config;
    this.show(true);
    this.setBlocking(true);
    if (this.covered) return;
    if (u.uInvert.value === 1 && u.uProgress.value > 0) {
      // mid-reveal: close the holes back up
      const left = u.uProgress.value;
      await this.animate(0, coverDuration * left, "power2.inOut");
      if (u.uProgress.value > 0) return; // interrupted
      u.uInvert.value = 0;
      u.uProgress.value = 1;
      this.render();
      return;
    }
    if (u.uInvert.value === 1 || u.uProgress.value === 0) {
      u.uInvert.value = 0;
      u.uProgress.value = 0;
      this.usePoints();
    }
    await this.animate(1, coverDuration * (1 - u.uProgress.value), coverEase);
  }

  setCovered() {
    this.interrupt();
    const u = this.uniforms;
    if (!u.uCount.value) this.usePoints();
    u.uInvert.value = 0;
    u.uProgress.value = 1;
    this.show(true);
    this.setBlocking(true);
    this.render();
  }

  async reveal() {
    const u = this.uniforms;
    const { revealDuration, revealEase } = this.config;
    this.setBlocking(false);
    u.uInvert.value = 1;
    u.uProgress.value = 0;
    this.usePoints();
    await this.animate(1, revealDuration, revealEase);
    if (u.uInvert.value === 1 && u.uProgress.value >= 1) {
      this.show(false);
      u.uInvert.value = 0;
      u.uProgress.value = 0;
    }
  }

  dispose() {
    this.disposed = true;
    this.interrupt();
    this.cancelWarm();
    cancelAnimationFrame(this.resizeFrame);
    window.removeEventListener("resize", this.onResize);
    this.uniforms.uNoise.value.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
