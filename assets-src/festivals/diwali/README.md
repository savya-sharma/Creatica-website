# Diwali artwork — masters

The Diwali illustrations for Creatica Crown, as transparent PNG masters. This
folder is **not** served by the site.

Two kinds of master live here:

- **Supplied illustrations.** `mandala.png` and the eave
  (`600d70b1-15ba-435a-8eef-cf6f92f2fe90.png`) are the originals as supplied,
  kept untouched. Their masters were prepared from them with sharp, without
  repainting:
  - `diwali-mandala.png` — the mandala on a square transparent canvas
    (1344×1344) with its circle centred (the original is 1270×1239 with the
    circle off-centre), so it turns and places true.
  - `diwali-eave.png` — the eave trimmed to its artwork (1675×866).
- **Drawn as code.** `scripts/festival-art/diwali-art.mjs` builds the diya,
  the lantern and the two marigold clusters as SVG (kept here next to each PNG, as
  the editable source) and renders them with sharp:

```
node scripts/festival-art/diwali-art.mjs
node scripts/optimize-festival-assets.mjs
```

The second command checks every master and writes the web versions (WebP with
transparency, at 1x and 2x of their display size) to `public/festivals/diwali/`;
the site only shows assets that pass. The list, sizes and placement live in
`src/festivals/diwali/manifest.js`.

## Every file

- PNG-32, sRGB, **transparent background**, clean edges, corners fully
  transparent.
- No text, logos, watermarks or UI. No baked glow beyond a flame's own soft
  halo; flicker, embers and motion are code.

## The set

| File | Size | Used for |
|---|---|---|
| `diwali-mandala.png` | 1344×1344 | The hero's mandala at the right edge (supplied art). |
| `diwali-eave.png` | 1675×866 | A tiled eave with a lattice panel entering from the upper-left; the lanterns hang from it (supplied art). |
| `diwali-lantern.png` | 900×2250 | Pagoda-roofed lantern on a rod with a long tassel — two under the eave, one in the footer. |
| `diwali-diya.png` | 1200×900 | The two diyas after the headline: an ornate clay lamp with its flame (flame centre at 950,236 — the code glow sits there). |
| `diwali-marigold-trail.png` | 600×1200 | A tall trail of overlapping marigolds with leaves — beside the lead word "where" (left edge), and mirrored under the menu button (right edge). |
| `diwali-marigold-corner.png` | 900×1100 | Marigolds in a row under the eave, turning down the left edge. |

Not made as an image: gold particles — the rising embers are drawn in code
(`src/festivals/diwali/motion.js`), so they can move and react to the pointer.
