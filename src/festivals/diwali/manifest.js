// The Diwali artwork manifest: every illustrated sticker the festival uses,
// its role / placement, master size and the widths it is served at. Shared
// by the site (assets.js) and scripts/optimize-festival-assets.mjs - kept
// free of imports so plain Node can load it.
//
// The mandala and the eave are supplied illustrations (their originals sit
// in assets-src/festivals/diwali/, see its README); the rest are drawn in
// scripts/festival-art/diwali-art.mjs. Glow, flicker, embers and motion are
// code.

export const DIWALI_ASSETS = [
  {
    id: "diwali-mandala",
    role: "Hero centrepiece: an ornamental mandala - teal leaf lobes, rust band, orange heart - at the right edge",
    master: "diwali-mandala.png",
    aspect: 1, // width / height (the supplied art, centred on a square canvas)
    minMaster: [1344, 1344],
    widths: [700, 1344], // shown up to ~620 CSS px: 1x and 2x
    required: true,
  },
  {
    id: "diwali-diya",
    role: "The two small diyas beside the headline: an ornate clay lamp with its flame",
    master: "diwali-diya.png",
    aspect: 4 / 3,
    minMaster: [1200, 900],
    widths: [320, 640], // shown ~3rem tall
    required: true,
    // the flame's centre, as a share of the image (x from the left, y from the
    // top): where the code-drawn glow sits (diwali-art.mjs DIYA_FLAME)
    glow: [950 / 1200, 236 / 900],
  },
  {
    id: "diwali-lantern",
    role: "Hanging lantern - pagoda roofs, lit paper panels, long tassel, on a rod: under the hero's eave, and the footer",
    master: "diwali-lantern.png",
    aspect: 1 / 2.5,
    minMaster: [900, 2250],
    widths: [160, 320],
    required: true,
  },
  {
    id: "diwali-eave",
    role: "A tiled roof eave with a lattice panel, entering from the hero's upper-left edge (the lanterns hang from it)",
    master: "diwali-eave.png",
    aspect: 1675 / 866,
    minMaster: [1675, 866],
    widths: [400, 800], // shown up to ~20rem wide
    required: true,
    // where the lanterns hang from its underside, as shares of the image
    // (x from the left, y from the top) - measured from the art
    hooks: { large: [0.59, 0.74], small: [0.835, 0.642] },
  },
  {
    id: "diwali-marigold-trail",
    role: "A tall trail of overlapping marigolds with leaves: beside the headline's lead word (left edge), and mirrored under the menu button (right edge)",
    master: "diwali-marigold-trail.png",
    aspect: 1 / 2,
    minMaster: [600, 1200],
    widths: [160, 320], // shown up to ~7.5rem wide
    required: true,
    mask: true, // record where the art is, so it is kept clear of the content by its shape
  },
  {
    id: "diwali-marigold-corner",
    role: "Marigolds in a row under the eave, turning down the left edge",
    master: "diwali-marigold-corner.png",
    aspect: 900 / 1100,
    minMaster: [900, 1100],
    widths: [180, 360], // shown up to ~10rem wide
    required: true,
    mask: true,
  },
];
