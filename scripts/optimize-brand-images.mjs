import sharp from "sharp";
import { readdir } from "fs/promises";
import path from "path";

// The Manifesto monitor (ManifestoMonitor.jsx) uploads these as WebGL
// textures. The originals are 3353x3763 - 48 MB each once decoded, ~1 GB for
// the full set, which is more than iOS WebKit allows a tab and gets the page
// killed and reloaded. On screen the monitor's display is at most ~1500
// device px wide (a 1440px-tall viewport at the renderer's 2x pixel-ratio
// cap), so a 1600px longer edge loses nothing visible.
const DIR = path.resolve("public/BrandsImg");
const MAX_DIMENSION = 1600;
const QUALITY = 85;

const files = (await readdir(DIR)).filter((f) => /^IMG\d+\.webp$/.test(f));

for (const file of files) {
  const outPath = path.join(DIR, file.replace(/\.webp$/, `-${MAX_DIMENSION}.webp`));
  const info = await sharp(path.join(DIR, file))
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY })
    .toFile(outPath);
  console.log(`${file} -> ${path.basename(outPath)} (${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)}KB)`);
}
