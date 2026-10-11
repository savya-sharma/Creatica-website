// Role captions under each plane, without troika-three-text.
//
// Each employee's role is drawn once into a canvas (site font, spaced caps)
// and shared by every plane showing that person. The text wraps within its
// own plane's width, so a caption never reaches its neighbours' captions.
// A caption is a strip of the ribbon below its plane's bottom-left corner: its
// vertices use the same curve bending as the images (captionVertexShader) and
// its mesh copies the plane's current (damped) transform, so it curves with
// the ribbon and travels/settles/wraps exactly with the image. The shared
// fluid field distorts it with an RGB split and grain (captionFragmentShader).

import {
  CanvasTexture,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Vector4,
} from "three";
import { captionFragmentShader, captionVertexShader } from "./shaders.js";

const PX_PER_UNIT = 640; // canvas resolution: pixels per world unit (a plane is 1 wide)
const PAD = 0.05; // world units of empty margin the distortion can spill into
const TRACKING = 0.08; // letter-spacing, in em
const LINE_HEIGHT = 1.3; // in em
const MIN_SCALE = 0.7; // a single over-long word may shrink the text this far

// The plane's own uniforms the caption needs to bend exactly like it (shared
// objects: whatever the carousel sets on the plane each frame applies here).
const SHARED_FROM_PLANE = [
  "uCurveBend",
  "uCurveType",
  "uCurveDepth",
  "uCurveWidth",
  "uCurveRadius",
  "uCenterX",
  "uCenterPoint",
  "uArcCenter",
  "uFrameAngle",
  "uPlaneSize",
  "uLift",
  "uLiftDepth",
  "uPlaneY",
  "uTime",
];

export class PlaneCaptions {
  /**
   * @param {import("three").Scene} scene
   * @param {{ fontFamily: string, color: string, fluidUniforms: object, renderer: import("three").WebGLRenderer }} options
   */
  constructor(scene, { fontFamily, color, fluidUniforms, renderer }) {
    this.scene = scene;
    this.fontFamily = fontFamily;
    // the shader writes colours as-is to an sRGB canvas: keep this one sRGB
    this.color = new Color(color).convertLinearToSRGB();
    this.fluidUniforms = fluidUniforms;
    this.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    this.geometry = new PlaneGeometry(1, 1, 24, 1);
    this.cache = new Map(); // employee -> { canvas, texture, width, height }
    this.labelSize = 0;
    this.maxWidth = 1; // world units a caption may span (its plane's width)
    this.disposed = false;

    // Draw once the web font is ready (drawing earlier would only be redone).
    this.fontReady = !document.fonts;
    const ready = () => {
      if (this.disposed || this.fontReady) return;
      this.fontReady = true;
      for (const [employee, entry] of this.cache) this.draw(employee, entry);
    };
    document.fonts?.load(`500 40px ${fontFamily}`).then(ready, ready);
  }

  /** Canvas text for one employee, drawn at the current label size. */
  captionFor(employee) {
    let entry = this.cache.get(employee);
    if (!entry) {
      const canvas = document.createElement("canvas");
      entry = { canvas, texture: null, width: 0, height: 0 };
      this.cache.set(employee, entry);
      if (this.fontReady) this.draw(employee, entry);
    }
    return entry;
  }

  /** Wrap words into lines no wider than maxPx at the current ctx font. */
  wrap(ctx, words, maxPx) {
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxPx) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
    return lines;
  }

  draw(employee, entry) {
    const ctx = entry.canvas.getContext("2d");
    const words = employee.role.toUpperCase().split(/\s+/).filter(Boolean);
    const maxPx = this.maxWidth * PX_PER_UNIT;
    const setFont = (size) => {
      ctx.font = `500 ${size * PX_PER_UNIT}px ${this.fontFamily}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = `${TRACKING * size * PX_PER_UNIT}px`;
    };

    // full size, wrapped to the plane width; shrink only if one word can't fit
    let size = this.labelSize;
    setFont(size);
    let lines = this.wrap(ctx, words, maxPx);
    let widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    while (widest > maxPx && size > this.labelSize * MIN_SCALE) {
      size *= 0.94;
      setFont(size);
      lines = this.wrap(ctx, words, maxPx);
      widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    }

    const lineHeight = size * LINE_HEIGHT;
    entry.width = Math.min(widest / PX_PER_UNIT, this.maxWidth) + PAD * 2;
    entry.height = lineHeight * lines.length + PAD * 2;
    const pixelWidth = Math.min(4096, Math.ceil(entry.width * PX_PER_UNIT));
    const pixelHeight = Math.min(4096, Math.ceil(entry.height * PX_PER_UNIT));
    // GPU texture storage is fixed at first upload, so a caption that changes
    // size (e.g. redrawn once the web font arrives) needs a fresh texture
    if (!entry.texture || entry.canvas.width !== pixelWidth || entry.canvas.height !== pixelHeight) {
      entry.texture?.dispose();
      entry.canvas.width = pixelWidth;
      entry.canvas.height = pixelHeight;
      const texture = new CanvasTexture(entry.canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.magFilter = LinearFilter;
      texture.anisotropy = this.anisotropy;
      entry.texture = texture;
    }

    // (resizing the canvas reset the context state)
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
    setFont(size);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    const pad = PAD * PX_PER_UNIT;
    lines.forEach((line, i) => ctx.fillText(line, pad, pad + i * lineHeight * PX_PER_UNIT));
    entry.texture.needsUpdate = true;
  }

  attach(slot, layout) {
    if (layout) this.setSize(layout);
    const shared = {};
    for (const key of SHARED_FROM_PLANE) shared[key] = slot.material.uniforms[key];
    const material = new ShaderMaterial({
      vertexShader: captionVertexShader,
      fragmentShader: captionFragmentShader,
      uniforms: {
        ...shared,
        ...this.fluidUniforms,
        uText: { value: null },
        uTextColor: { value: this.color },
        uOpacity: { value: 0 },
        uCapRect: { value: new Vector4(0, 0, 1, 1) },
      },
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
    });
    const mesh = new Mesh(this.geometry, material);
    mesh.frustumCulled = false; // vertices are placed by the shader
    mesh.visible = false;
    this.scene.add(mesh);
    slot.label = { mesh, material, employee: null };
  }

  detach(slot) {
    const l = slot.label;
    if (!l) return;
    this.scene.remove(l.mesh);
    l.material.dispose();
    slot.label = null;
  }

  setEmployee(slot, employee) {
    const l = slot.label;
    if (!l || l.employee === employee) return;
    l.employee = employee;
    this.captionFor(employee);
  }

  /** Label size can differ per breakpoint: redraw everything if it changed. */
  setSize(layout) {
    const maxWidth = layout.planeWidth * 0.96;
    if (layout.labelSize === this.labelSize && maxWidth === this.maxWidth) return;
    this.labelSize = layout.labelSize;
    this.maxWidth = maxWidth;
    if (this.fontReady) for (const [employee, entry] of this.cache) this.draw(employee, entry);
  }

  resize(slot, layout) {
    this.setSize(layout);
  }

  update(slot, layout, opacity) {
    const l = slot.label;
    const { mesh } = slot;
    const entry = l.employee && this.cache.get(l.employee);
    l.mesh.visible = mesh.visible && layout.labels && !!entry?.texture;
    if (!l.mesh.visible) return;

    // ride on the plane's current transform (not its non-uniform scale)
    l.mesh.position.copy(mesh.position);
    l.mesh.rotation.y = mesh.rotation.y;

    l.material.uniforms.uText.value = entry.texture; // may have been replaced by a redraw
    const s = slot.currentScale;
    const halfW = (layout.planeWidth * s) / 2;
    const bottom = (-layout.planeHeight * s) / 2 - layout.labelGap * s; // caption's top edge
    const w = entry.width * s;
    const h = entry.height * s;
    // canvas has PAD on every side; its text block starts at the plane's left edge
    l.material.uniforms.uCapRect.value.set(-halfW - PAD * s, bottom + PAD * s - h, w, h);
    l.material.uniforms.uOpacity.value = opacity;
  }

  dispose() {
    this.disposed = true;
    for (const entry of this.cache.values()) entry.texture?.dispose();
    this.cache.clear();
    this.geometry.dispose();
  }
}
