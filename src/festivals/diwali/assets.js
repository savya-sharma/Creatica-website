// The Diwali artwork, as a manifest: every illustrated sticker the festival
// experience uses, where it goes, and the sizes it is served at. Only the
// objects themselves are artwork - light, glow, flame flicker, particles and
// motion are drawn in code and must never be painted into these images.
//
// Masters (lossless transparent PNGs from the illustrator) go in
// assets-src/festivals/diwali/ - not served. `node scripts/optimize-festival-
// assets.mjs` checks them and writes the web versions (WebP with alpha, one
// per entry in `widths`) to public/festivals/diwali/, then records what it
// produced in ./available.json. Components render an asset only when it is
// listed there: a missing asset is simply absent - never replaced by a
// stand-in.

import available from "./available.json";
import { DIWALI_ASSETS } from "./manifest";

export { DIWALI_ASSETS };

// public URL of an asset's web version at a given width
const url = (id, width) => `/festivals/diwali/${id}-${width}.webp`;

/**
 * An asset that has actually been produced, with its sizes - or null. The
 * festival components use only this, so nothing is drawn for a missing file.
 */
export function diwaliAsset(id) {
  const entry = DIWALI_ASSETS.find((a) => a.id === id);
  const produced = available[id];
  if (!entry || !produced) return null;
  return {
    id,
    width: produced.width,
    height: produced.height,
    src: url(id, produced.sizes[produced.sizes.length - 1]),
    srcSet: produced.sizes.map((w) => `${url(id, w)} ${w}w`).join(", "),
    // where the art is, on a coarse grid (assets with `mask` in the manifest)
    mask: produced.mask ?? null,
  };
}
