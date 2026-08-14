// The dashboard's rotating hero/quick-action photos (menu-card-N.png,
// pantry-card-N.png, recipes-card-N.png) get added as raw AI-gen originals
// (~1-1.4MB), unlike the base menu-card.png/pantry-card.png/recipes-card.png
// siblings, which are already sized down. They're rendered with
// objectFit:cover (see RotatingPhoto in Dashboard.jsx), so the browser crops
// to fit regardless of source aspect ratio — no need to match the sibling's
// exact dimensions (its aspect ratio doesn't even match the raw variants';
// forcing a resize to it would stretch the photo). Just resize by width,
// preserving the raw's own aspect ratio, and re-encode as JPEG (same
// reasoning as optimize-onboarding-cards.mjs: photographic/gradient art
// compresses far better as JPEG than palette PNG).
//
// Run: node scripts/optimize-dashboard-cards.mjs
import { Jimp, ResizeStrategy } from "jimp";
import { readdir, stat, rm } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve("src/assets/dashboard");
const QUALITY = 85;
const RAW_THRESHOLD_BYTES = 150 * 1024;

// Rendered box widths (CSS px, on the 420px-max mobile shell) x2 for retina,
// rounded up with headroom: menu-card is the full-width 16:7 hero; pantry-
// card/recipes-card are half-width 4:5 tiles, but their raw source is square
// (1:1) so the height is the binding dimension under objectFit:cover — sizing
// by width with some margin covers both axes.
const WIDTH_BY_PREFIX = [
  [/^menu-card-\d+\.png$/, 900],
  [/^pantry-card-\d+\.png$/, 600],
  [/^recipes-card-\d+\.png$/, 600],
];

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".png"));
  for (const file of files) {
    const full = path.join(DIR, file);
    const before = (await stat(full)).size;
    if (before <= RAW_THRESHOLD_BYTES) continue;

    const match = WIDTH_BY_PREFIX.find(([re]) => re.test(file));
    if (!match) {
      console.log(`SKIP ${file}: no known width target for this name`);
      continue;
    }
    const [, width] = match;

    const img = await Jimp.read(full);
    if (img.width > width) {
      const ratio = width / img.width;
      img.resize({ w: width, h: Math.round(img.height * ratio), mode: ResizeStrategy.BICUBIC });
    }

    const dst = path.join(DIR, file.replace(/\.png$/, ".jpg"));
    await img.write(dst, { quality: QUALITY });
    await rm(full);
    const after = (await stat(dst)).size;
    console.log(`${file} -> ${path.basename(dst)}  ${before >> 10}KB -> ${after >> 10}KB`);
  }
}

main();
