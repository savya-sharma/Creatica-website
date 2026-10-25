import * as THREE from "three";
import gsap from "gsap";
import { vertexShader, fragmentShader } from "./shader";
import { whenIdle } from "@/lib/whenIdle";
import { renderPixelRatio, FrameWatch } from "@/lib/renderQuality";

// Draws the organic blob transition: one fixed full-screen canvas, hidden
// (and not rendering) while idle.
//
//   cover()      organic blobs grow from set points until the screen is covered
//   reveal()     it opens from the centre back out past the borders
//   setCovered() jump straight to full cover (browser back/forward)
//   interrupt()  stop the running phase where it is (its promise resolves)
//
// cover() called mid-reveal closes the opening back up from where it is
// instead of jumping, so rapid navigation never flickers.
//
// One layer from cover to reveal: the shader clock only runs while frames
// are drawn, so the reveal starts from exactly the mask the cover ended on
// (the wait for the new page doesn't reshape it). Resolution is adaptive
// (lib/renderQuality.js) and only ever changes between transitions. A lost
// WebGL context (iOS memory pressure) degrades to plain navigation: every
// phase completes at once, with nothing drawn, until the context returns.
export class BlobTransition {
  constructor(config) {
    this.config = config;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "page-transition";
    this.canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, premultipliedAlpha: true, antialias: false });
    // soft organic shapes need no high-DPI detail (renderQuality caps it)
    this.ratio = renderPixelRatio();
    this.renderer.setPixelRatio(this.ratio);
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();

    const color = (hex) => new THREE.Color(hex).convertLinearToSRGB();
    this.uniforms = {
      uProgress: { value: 0 },
      uInvert: { value: 0 },
      uNoise: { value: this.fallbackNoise() },
      uNoiseIntensity: { value: config.noiseIntensity },
      uNoiseScale: { value: config.noiseScale },
      uEdgeSoftness: { value: config.edgeSoftness },
      uMoveSpeed: { value: config.moveSpeed },
      uNoiseSmoothing: { value: config.noiseSmoothing },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uColor: { value: color(config.color) },
      uColor2: { value: color(config.color2) },
      uTwoTone: { value: config.twoTone },
      uRimColor: { value: color(config.rimColor) },
      uGrain: { value: config.grain },
      uGrainScale: { value: config.grainScale },
      uGrainSpeed: { value: config.grainSpeed },
      uGrainWidth: { value: config.grainWidth },
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uPoints: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uPointCount: { value: Math.min(8, config.coverPoints.length) },
      uCoverReach: { value: config.coverReach },
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

    this.tween = null;
    this.resolveTween = null;
    this.clock = 0;
    this.lastFrame = 0;
    this.watch = new FrameWatch();
    this.lost = false;
    this.onLost = (event) => {
      event.preventDefault(); // allows the browser to restore it
      this.lost = true;
      this.interrupt();
      this.show(false);
    };
    this.onRestored = () => {
      this.lost = false;
      this.uniforms.uNoise.value.needsUpdate = true; // re-upload
    };
    this.canvas.addEventListener("webglcontextlost", this.onLost);
    this.canvas.addEventListener("webglcontextrestored", this.onRestored);
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
    // a new resolution only between transitions, never mid-way
    if (!this.visible) this.ratio = renderPixelRatio();
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(w, h, false);
    this.uniforms.uAspect.value = w / h;
    this.applyPoints(w / h);
    this.uniforms.uPixelRatio.value = this.ratio;
    // a running tween renders on its own next frame
    if (this.visible && !this.tween) this.render();
  }

  // the cover's blob points, from screen fractions (0..1 from the top-left)
  // to the shader's centred, screen-height units
  applyPoints(aspect) {
    this.config.coverPoints.slice(0, 8).forEach((pt, i) => {
      this.uniforms.uPoints.value[i].set((pt.x - 0.5) * aspect, 0.5 - pt.y, pt.delay ?? 0, pt.size ?? 1);
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
    if (this.lost) return;
    const now = performance.now();
    if (this.lastFrame) {
      const dt = now - this.lastFrame;
      this.clock += Math.min(dt, 100);
      // a device that can't keep up renders lower from the next transition
      if (this.watch.sample(now)) this.needsRatio = true;
    }
    this.lastFrame = now;
    this.uniforms.uTime.value = this.clock / 1000;
    this.renderer.render(this.scene, this.camera);
  }

  // tweens uProgress, rendering each frame; resolves when done or interrupted
  animate(to, duration, ease) {
    this.interrupt();
    // the clock resumes from here, not from the end of the last phase
    this.lastFrame = 0;
    this.watch.reset();
    if (this.lost) {
      this.uniforms.uProgress.value = to;
      return Promise.resolve();
    }
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
    return (this.visible || this.lost) && u.uInvert.value === 0 && u.uProgress.value >= 1;
  }

  async cover() {
    const u = this.uniforms;
    const { coverDuration, coverEase } = this.config;
    if (!this.visible && this.needsRatio) {
      this.needsRatio = false;
      this.resize(); // picks up the lower resolution while nothing is shown
    }
    this.show(!this.lost);
    this.setBlocking(true);
    if (this.covered) return;
    if (u.uInvert.value === 1 && u.uProgress.value > 0) {
      // mid-reveal: close the opening back up from where it is
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
    }
    await this.animate(1, coverDuration * (1 - u.uProgress.value), coverEase);
  }

  setCovered() {
    this.interrupt();
    const u = this.uniforms;
    u.uInvert.value = 0;
    u.uProgress.value = 1;
    this.show(!this.lost);
    this.setBlocking(true);
    this.render();
  }

  async reveal() {
    const u = this.uniforms;
    const { revealDuration, revealEase } = this.config;
    this.setBlocking(false);
    u.uInvert.value = 1;
    u.uProgress.value = 0;
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
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.uniforms.uNoise.value.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
