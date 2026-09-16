import sharp from "sharp";
import { readdir, stat } from "fs/promises";
import path from "path";

// The About page arc gallery (Profilegaller.jsx) displays these at a max of
// SLIDE_WIDTH=200 x SLIDE_HEIGHT=275 CSS px (object-fit:cover). Resizing so
// the longer edge tops out around 900px comfortably covers that box even at
// 3x device pixel ratio, without keeping full 3000-5700px camera originals
// around for a thumbnail.
const DIR = path.resolve("public/GalleryImg");
const MAX_DIMENSION = 900;
const QUALITY = 82;

const files = (await readdir(DIR)).filter((f) => f.endsWith(".webp"));

let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
  const filePath = path.join(DIR, file);
  const before = (await stat(filePath)).size;

  const buffer = await sharp(filePath)
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY })
    .toBuffer();

  // the original files are locked (dev server watcher / OneDrive sync),
  // so write optimized versions under a new name instead of overwriting
  const outPath = filePath.replace(/\.webp$/, "-opt.webp");
  await sharp(buffer).toFile(outPath);

  const after = buffer.length;
  totalBefore += before;
  totalAfter += after;
  console.log(
    `${file}: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB (${Math.round((1 - after / before) * 100)}% smaller)`
  );
}

console.log(
  `\nTotal: ${(totalBefore / 1024 / 1024).toFixed(2)}MB -> ${(totalAfter / 1024 / 1024).toFixed(2)}MB`
);
