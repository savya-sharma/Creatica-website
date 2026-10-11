// Two-level texture caching:
//
// 1. This module keeps *framed* portrait sources (a canvas already cropped to
//    the plane's aspect, see framePortrait) alive for the lifetime of the
//    page, so navigating About -> elsewhere -> About never refetches,
//    re-decodes or re-crops a portrait. Decoding, cropping and downscaling
//    the (often 12 MP) originals happens in createImageBitmap, off the main
//    thread; the originals are released as soon as the crop exists.
// 2. Each carousel instance turns those sources into its own GPU textures
//    (see TextureStore below) and disposes them with its renderer. A texture
//    object is therefore never shared across WebGL contexts, so a remount can
//    never pick up a disposed/stale texture.

import { LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, Texture } from "three";
import { clamp } from "./math.js";

// The framed crop is capped at framing.maxHeight pixels (what this screen can
// actually display - see EmployeeCarousel). Cropping happens on the original
// first, so zoomed-in faces from 4000px phone photos stay sharp.

const sources = new Map(); // framing key -> Promise<{ source, width, height, ok }>

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPng(url) {
  return /\.png(\?|#|$)/i.test(url);
}

/**
 * What the photo's top edge looks like: (near) white or transparent, i.e. a
 * studio portrait or a cut-out. Only those may get a white background and
 * headroom: on any other photo a white band reads as a shade over it.
 */
function topEdge(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 4;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // top 3% of the image, squeezed into a 64x4 sample
  ctx.drawImage(source, 0, 0, width, Math.max(1, height * 0.03), 0, 0, 64, 4);
  const { data } = ctx.getImageData(0, 0, 64, 4);
  let white = 0;
  let clear = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) clear++;
    else if (data[i] >= 235 && data[i + 1] >= 235 && data[i + 2] >= 235) white++;
  }
  const n = data.length / 4;
  return { white: (white + clear) / n >= 0.95, transparent: clear / n >= 0.5 };
}

/**
 * Decide which part of the image fills the plane, in image pixels. The rect
 * may extend above the image (only when `allowFill`, i.e. PNGs) - that part
 * is painted with the fill colour.
 *
 * With `focus` ({ top, chin, x } as fractions of the image) every portrait is
 * framed alike: head top on the line `headTop` (fraction of plane height from
 * the top), head about `headSize` of the plane tall, face centred. Limits, in
 * order of priority:
 *   - never zoom past `minCropPx` source pixels (no blurry faces)
 *   - never leave empty space at the sides or below the body
 *   - without fill, never leave empty space at all (pure cover); headroom is
 *     then whatever the photo allows
 * Without focus it is a plain centred cover crop.
 */
export function framePortrait(width, height, focus, framing, allowFill) {
  const aspect = framing.planeAspect;
  const maxH = Math.min(height, width / aspect); // largest crop that still covers

  if (!focus) {
    const cropH = maxH;
    const cropW = cropH * aspect;
    return { left: (width - cropW) / 2, top: (height - cropH) / 2, width: cropW, height: cropH };
  }

  const headTop = focus.top * height;
  const headHeight = (focus.chin - focus.top) * height;
  const faceX = focus.x * width;

  let cropH = headHeight / framing.headSize;
  cropH = Math.max(cropH, Math.min(framing.minCropPx, maxH)); // resolution floor
  cropH = Math.min(cropH, width / aspect); // no side bands
  cropH = Math.min(cropH, (height - headTop) / (1 - framing.headTop)); // no band below
  if (!allowFill) cropH = Math.min(cropH, height);

  let top = headTop - framing.headTop * cropH;
  top = allowFill ? Math.min(top, height - cropH) : clamp(top, 0, height - cropH);
  const cropW = cropH * aspect;
  const left = clamp(faceX - cropW / 2, 0, width - cropW);
  return { left, top, width: cropW, height: cropH };
}

async function decodeFramed(employee, framing, delay) {
  if (delay) await wait(delay);

  const response = await fetch(employee.image);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const full = await createImageBitmap(blob); // decoded off the main thread
  const { width: w, height: h } = full;

  // White background + headroom only for cut-outs (transparent background,
  // any format) and PNG portraits shot on white; every other photo is a plain
  // cover crop (white over a real background reads as a shade).
  const edge = topEdge(full, w, h);
  const fill = edge.transparent || (isPng(employee.image) && edge.white) ? framing.pngBackground : null;
  const rect = framePortrait(w, h, employee.focus, framing, !!fill);

  const scale = Math.min(1, framing.maxHeight / rect.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  // Only the part of the rect that lies inside the image is drawn.
  const sy = Math.max(0, rect.top);
  const sh = Math.min(h, rect.top + rect.height) - sy;
  const dy = (sy - rect.top) * scale;
  const dh = Math.max(1, Math.round(sh * scale));

  // Crop + downscale off the main thread too. Browsers that ignore the
  // resize options return the plain crop, which drawImage then scales.
  full.close();
  const crop = await createImageBitmap(blob, Math.round(rect.left), Math.round(sy), Math.round(rect.width), Math.round(sh), {
    resizeWidth: canvas.width,
    resizeHeight: dh,
    resizeQuality: "high",
  });

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(crop, 0, dy, canvas.width, dh);
  crop.close();
  return { source: canvas, width: canvas.width, height: canvas.height, ok: true };
}

function framingKey(employee, framing) {
  const f = employee.focus;
  return [
    employee.image,
    f ? `${f.top},${f.chin},${f.x}` : "-",
    framing.planeAspect,
    framing.headTop,
    framing.headSize,
    framing.minCropPx,
    framing.pngBackground,
    framing.maxHeight,
  ].join("|");
}

/**
 * Resolves (never rejects) with the framed source for an employee. Failed
 * loads resolve with `ok: false` and are evicted so a later mount can retry.
 */
export function loadFramedSource(employee, framing, { delay = 0 } = {}) {
  const key = framingKey(employee, framing);
  let pending = sources.get(key);
  if (pending) return pending;

  pending = decodeFramed(employee, framing, delay).catch(() => {
    sources.delete(key);
    return { source: null, width: 0, height: 0, ok: false };
  });
  sources.set(key, pending);
  return pending;
}

/** Drop every cached source, e.g. when the section is removed for good. */
export function clearImageSourceCache() {
  sources.clear();
}

function initialsOf(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// Shown instead of a broken image: a quiet tile with the person's initials.
function createFallbackSource(employee, colors) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 700;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colors.placeholderTop);
  gradient.addColorStop(1, colors.placeholderBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colors.surface;
  ctx.globalAlpha = 0.55;
  ctx.font = '500 140px "AppleRegular", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initialsOf(employee.role) || "CC", canvas.width / 2, canvas.height / 2);
  return { source: canvas, width: canvas.width, height: canvas.height };
}

/**
 * Per-carousel GPU texture cache keyed by image URL. Every plane showing the
 * same person shares one Texture; textures are only disposed together with
 * the store, so a texture can never be freed while a plane still uses it.
 */
export class TextureStore {
  constructor({ renderer, colors, framing, loadDelay = 0, onReady }) {
    this.renderer = renderer;
    this.framing = framing;
    this.colors = colors;
    this.loadDelay = loadDelay;
    this.onReady = onReady;
    this.entries = new Map(); // url -> { texture, aspect, ready }
    this.disposed = false;
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  /** Returns the (possibly still loading) entry for an employee's image. */
  request(employee) {
    const url = employee.image;
    let entry = this.entries.get(url);
    if (entry) return entry;

    entry = { texture: null, aspect: 1, ready: false };
    this.entries.set(url, entry);

    loadFramedSource(employee, this.framing, { delay: this.loadDelay }).then((result) => {
      // The carousel may have been torn down while the image was in flight.
      if (this.disposed) return;
      const { source, width, height } = result.ok ? result : createFallbackSource(employee, this.colors);
      const texture = new Texture(source);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.magFilter = LinearFilter;
      texture.anisotropy = this.anisotropy;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      // Upload now rather than on the first frame the plane becomes visible,
      // so a large portrait doesn't cause a hitch mid-scroll.
      this.renderer.initTexture(texture);

      entry.texture = texture;
      entry.aspect = width / height;
      entry.ready = true;
      this.onReady?.(url, result.ok);
    });

    return entry;
  }

  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.texture?.dispose();
    this.entries.clear();
  }
}
