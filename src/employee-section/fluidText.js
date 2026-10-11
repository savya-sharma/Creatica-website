// HTML text distorted by the About background's fluid (backgroundFluid.js).
//
// The element's own text is rasterized into a canvas - same computed font,
// size, letter-spacing and case, every word placed at its exact on-page
// position (DOM ranges), so wrapping matches the layout - and drawn by the
// background renderer as a quad over the element. The shader reads the shared
// screen-space velocity field at each pixel: glyphs are displaced along the
// flow, the colour channels split where it moves fast, and RGB grain appears
// in the moving area. With the fluid at rest it is the plain text again.
//
// The real HTML text stays in the page (transparent), so it remains
// selectable and readable by assistive tech and search engines.

import { CanvasTexture, Color, LinearFilter, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Vector2, Vector4 } from "three";
import { capLengthChunk, grainChunk } from "./shaders.js";

const UNIT = 100; // CSS px per field unit (matches backgroundFluid.js)

const vertexShader = /* glsl */ `
  uniform vec4 uRect;       // padded element rect in CSS px: x, y (top-left), w, h
  uniform vec2 uViewport;   // CSS px
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec2 px = uRect.xy + vec2(uv.x, 1.0 - uv.y) * uRect.zw;
    gl_Position = vec4(px.x / uViewport.x * 2.0 - 1.0, 1.0 - px.y / uViewport.y * 2.0, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uText;      // white text, coverage in alpha
  uniform sampler2D uVelocity;  // shared field, units/s, y up
  uniform vec4 uRect;
  uniform vec2 uViewport;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uDistortion;    // s: flow -> displacement
  uniform float uMaxOffset;     // CSS px
  uniform float uChroma;        // s: flow -> RGB split
  uniform float uChromaThreshold;
  uniform float uTime;
  ${grainChunk}
  ${capLengthChunk}
  varying vec2 vUv;

  float coverage(vec2 uv) {
    return texture2D(uText, clamp(uv, 0.0, 1.0)).a;
  }

  void main() {
    // this pixel in the field (field = viewport, y up)
    vec2 px = uRect.xy + vec2(vUv.x, 1.0 - vUv.y) * uRect.zw;
    vec2 fieldUv = vec2(px.x / uViewport.x, 1.0 - px.y / uViewport.y);
    vec2 flow = texture2D(uVelocity, fieldUv).xy;
    float speed = length(flow);

    // displacement in CSS px, then in this quad's UV (both y up)
    vec2 offset = capLength(flow * uDistortion * ${UNIT.toFixed(1)}, uMaxOffset);
    vec2 uv = vUv - offset / uRect.zw;
    float splitOn = smoothstep(uChromaThreshold, uChromaThreshold * 3.0, speed);
    vec2 split = capLength(flow * uChroma * ${UNIT.toFixed(1)}, uMaxOffset * 0.5) / uRect.zw * splitOn;

    vec3 rgb = vec3(coverage(uv + split), coverage(uv), coverage(uv - split));
    float a = max(rgb.r, max(rgb.g, rgb.b));
    vec3 color = uColor * rgb;

    // RGB grain where the liquid moves
    color += rgbGrain() * uGrain * smoothstep(0.1, uGrainFlow, speed) * a;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0) * uOpacity, a * uOpacity); // premultiplied
  }
`;

const TEXT_BLOCKS = "h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, dt, dd";
const NOT_TEXT = ".people-carousel, .people-section__live, [aria-hidden='true'], canvas, script, style";

/**
 * Every visible text block inside `root` (headings, paragraphs, list items,
 * ...), outermost only so nothing is drawn twice. Skips the carousel stage
 * (its captions live in WebGL), screen-reader-only text and hidden content.
 */
export function collectFluidTexts(root) {
  const blocks = [...root.querySelectorAll(TEXT_BLOCKS)].filter(
    (el) => !el.closest(NOT_TEXT) && el.textContent.trim() && el.getClientRects().length
  );
  return blocks.filter((el) => !blocks.some((other) => other !== el && other.contains(el)));
}

export class FluidText {
  /**
   * @param {HTMLElement} element
   * @param {object} c BACKGROUND_FLUID_CONFIG
   */
  constructor(element, c) {
    this.el = element;
    this.c = c;
    this.canvas = document.createElement("canvas");
    this.texture = this.makeTexture();

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uText: { value: this.texture },
        uVelocity: { value: null },
        uRect: { value: new Vector4() },
        uViewport: { value: new Vector2(1, 1) },
        uColor: { value: new Color() },
        uOpacity: { value: 1 },
        uDistortion: { value: c.textDistortion },
        uMaxOffset: { value: c.textMaxOffset },
        uChroma: { value: c.textChroma },
        uChromaThreshold: { value: c.textChromaThreshold },
        uGrain: { value: c.textGrain },
        uGrainSize: { value: c.textGrainSize },
        uGrainFlow: { value: 1.5 },
        uGrainFps: { value: 24 },
        uTime: { value: 0 },
      },
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1; // after the smoke
    this.size = { width: 0, height: 0 };

    // read the real colour/opacity before the HTML text is made transparent
    const cs = getComputedStyle(element);
    this.color = cs.color;
    this.opacity = parseFloat(cs.opacity) || 1;
    // (activate() hides the HTML text once the WebGL copy is on screen)
  }

  makeTexture() {
    const texture = new CanvasTexture(this.canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }

  /** Draw the element's text into the canvas at device resolution. */
  rasterize(pixelRatio) {
    const el = this.el;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const pad = this.c.textPadding;
    const w = rect.width + pad * 2;
    const h = rect.height + pad * 2;
    this.size = { width: rect.width, height: rect.height };
    const pixelWidth = Math.max(1, Math.round(w * pixelRatio));
    const pixelHeight = Math.max(1, Math.round(h * pixelRatio));
    if (pixelWidth !== this.canvas.width || pixelHeight !== this.canvas.height) {
      // GPU texture storage is fixed at first upload: a new size needs a new texture
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.texture.dispose();
      this.texture = this.makeTexture();
      this.material.uniforms.uText.value = this.texture;
    }

    const ctx = this.canvas.getContext("2d");
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "alphabetic";

    // one fillText per word, at the word's own on-page box
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent;
      // each text node is drawn with its own computed style
      const ns = getComputedStyle(node.parentElement);
      ctx.font = `${ns.fontStyle} ${ns.fontWeight} ${ns.fontSize} ${ns.fontFamily}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = ns.letterSpacing === "normal" ? "0px" : ns.letterSpacing;
      const upper = ns.textTransform === "uppercase";
      for (const match of text.matchAll(/\S+/g)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const box = range.getBoundingClientRect();
        if (!box.width) continue;
        const word = upper ? match[0].toUpperCase() : match[0];
        const metrics = ctx.measureText(word);
        const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(ns.fontSize) * 0.8;
        ctx.fillText(word, box.left - rect.left + pad, box.top - rect.top + pad + ascent);
      }
    }
    range.detach?.();

    // the canvas expects sRGB and this shader writes colours as-is, so keep
    // the CSS colour in sRGB (three converts CSS colours to linear by default)
    this.material.uniforms.uColor.value.set(this.color).convertLinearToSRGB();
    this.material.uniforms.uOpacity.value = this.opacity;
    this.texture.needsUpdate = true;
  }

  /** The HTML text stays for selection/a11y but is drawn by WebGL instead. */
  activate() {
    this.el.classList.add("fluid-text-source");
  }

  /** Position for this frame; hides the quad when off screen. */
  update(viewportWidth, viewportHeight, velocity, time) {
    const rect = this.el.getBoundingClientRect();
    const pad = this.c.textPadding;
    const u = this.material.uniforms;
    u.uRect.value.set(rect.left - pad, rect.top - pad, rect.width + pad * 2, rect.height + pad * 2);
    u.uViewport.value.set(viewportWidth, viewportHeight);
    u.uVelocity.value = velocity;
    u.uTime.value = time;
    this.mesh.visible =
      !!velocity && rect.bottom + pad > 0 && rect.top - pad < viewportHeight && rect.width > 0;
    return Math.round(rect.width) !== Math.round(this.size.width) || Math.round(rect.height) !== Math.round(this.size.height);
  }

  dispose() {
    this.el.classList.remove("fluid-text-source");
    this.texture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
