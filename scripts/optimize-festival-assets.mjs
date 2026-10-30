import sharp from "sharp";
import { mkdir, readdir, stat, writeFile } from "fs/promises";
import path from "path";
import { DIWALI_ASSETS } from "../src/festivals/diwali/manifest.js";

// Diwali artwork: checks the illustrator's master PNGs and writes the web
// versions the festival components load.
//
//   masters  assets-src/festivals/diwali/<master>.png   (lossless, not served)
//   output   public/festivals/diwali/<id>-<width>.webp (one per manifest width)
//   record   src/festivals/diwali/available.json        (what was produced)
//
// Each master must be a PNG with an alpha channel, at least the manifest's
// minimum size, within 2% of its aspect ratio, and (for floating stickers)
// fully transparent in its corners - a sticker with a painted background or
// a halo would show as a box over the site. The toran must also tile: its
// left and right edges have to match. Anything that fails is skipped and
// reported, never written.
//
// Run: node scripts/optimize-festival-assets.mjs   (from the project root)

const SRC = path.resolve("assets-src/festivals/diwali");
const OUT = path.resolve("public/festivals/diwali");
const RECORD = path.resolve("src/festivals/diwali/available.json");
const QUALITY = 88; // colour detail of gold and fine linework survives at this
const ALPHA_QUALITY = 100; // keep edges crisp - no fringes over the page

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

// alpha of the four corner pixels (0 = transparent)
async function cornerAlpha(file, width, height) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => data[(y * info.width + x) * info.channels + 3];
  return Math.max(at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1));
}

// mean difference between the first and last pixel columns (0..255)
async function seamDifference(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let y = 0; y < info.height; y++) {
    for (let c = 0; c < 4; c++) {
      const left = data[(y * info.width) * 4 + c];
      const right = data[(y * info.width + info.width - 1) * 4 + c];
      sum += Math.abs(left - right);
    }
  }
  return sum / (info.height * 4);
}

// where a sticker's art is: its alpha on a coarse grid (MASK_COLS across),
// one string per row, "1" where any pixel of the cell is visibly opaque - so
// the site can keep the art itself (not its box) clear of the content
const MASK_COLS = 20;
async function coverage(file, width, height) {
  const rows = Math.max(1, Math.round((MASK_COLS * height) / width));
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < MASK_COLS; c++) {
      const x0 = Math.floor((c * info.width) / MASK_COLS);
      const x1 = Math.floor(((c + 1) * info.width) / MASK_COLS);
      const y0 = Math.floor((r * info.height) / rows);
      const y1 = Math.floor(((r + 1) * info.height) / rows);
      let on = false;
      for (let y = y0; y < y1 && !on; y++) for (let x = x0; x < x1; x++) if (data[(y * info.width + x) * info.channels + 3] > 32) { on = true; break; }
      line += on ? "1" : "0";
    }
    out.push(line);
  }
  return { cols: MASK_COLS, rows: out };
}

async function check(asset, file) {
  const problems = [];
  const meta = await sharp(file).metadata();
  if (meta.format !== "png") problems.push(`is ${meta.format}, not PNG`);
  if (!meta.hasAlpha) problems.push("has no transparency (alpha channel)");
  const [minW, minH] = asset.minMaster;
  if (meta.width < minW || meta.height < minH) problems.push(`is ${meta.width}x${meta.height}, needs at least ${minW}x${minH}`);
  const aspect = meta.width / meta.height;
  if (Math.abs(aspect / asset.aspect - 1) > 0.02) problems.push(`aspect ${aspect.toFixed(3)} differs from ${asset.aspect.toFixed(3)}`);
  if (meta.hasAlpha && !asset.seamless && (await cornerAlpha(file, meta.width, meta.height)) > 8) {
    problems.push("corners are not transparent (background or halo left in)");
  }
  if (asset.seamless === "x" && (await seamDifference(file)) > 6) problems.push("left and right edges do not tile seamlessly");
  return { problems, meta };
}

await mkdir(OUT, { recursive: true });
const masters = (await exists(SRC)) ? await readdir(SRC) : [];
const record = {};
const missing = [];
const rejected = [];
let totalBytes = 0;

for (const asset of DIWALI_ASSETS) {
  const file = path.join(SRC, asset.master);
  if (!masters.includes(asset.master)) {
    missing.push(asset);
    continue;
  }
  const { problems, meta } = await check(asset, file);
  if (problems.length) {
    rejected.push({ asset, problems });
    continue;
  }
  const sizes = [];
  for (const width of asset.widths) {
    const outFile = path.join(OUT, `${asset.id}-${width}.webp`);
    const info = await sharp(file)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: QUALITY, alphaQuality: ALPHA_QUALITY, effort: 6, smartSubsample: true })
      .toFile(outFile);
    totalBytes += info.size;
    sizes.push(info.width);
  }
  record[asset.id] = { width: meta.width, height: meta.height, sizes: [...new Set(sizes)] };
  if (asset.mask) record[asset.id].mask = await coverage(file, meta.width, meta.height);
  console.log(`ok       ${asset.id}  ->  ${sizes.map((w) => `${w}w`).join(", ")}`);
}

await writeFile(RECORD, `${JSON.stringify(record, null, 2)}\n`);

for (const { asset, problems } of rejected) console.log(`REJECTED ${asset.master}: ${problems.join("; ")}`);
for (const asset of missing) console.log(`missing  ${asset.master}${asset.required ? "  (required)" : "  (optional)"}`);
console.log(
  `\n${Object.keys(record).length} of ${DIWALI_ASSETS.length} assets ready (${(totalBytes / 1024).toFixed(0)} KB of web images); ` +
    `${missing.filter((a) => a.required).length} required still missing, ${rejected.length} rejected.`,
);
