// Some onboarding card illustrations were committed straight to
// public/avatares/cards/ at full Midjourney/AI-gen size (1024x1024,
// ~0.9-1.6MB), unlike the rest of the folder which goes through
// make_onboarding_cards.py (360px, palette-quantized PNG, 40-70KB).
// These don't have a separate source copy to re-derive from, so this
// resizes them in place and re-encodes as JPEG (quality 85 tests visually
// clean and lands in the same 30-40KB band as the quantized PNGs — much
// better than PNG here since these are photographic/gradient illustrations,
// not flat icons). Run once per new raw card added; re-running is a no-op
// for files already under the threshold.
import { Jimp, ResizeStrategy } from "jimp";
import { readdir, stat, rm } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve("public/avatares/cards");
const WIDTH = 360;
const QUALITY = 85;
const RAW_THRESHOLD_BYTES = 150 * 1024; // already-optimized files sit well under this

// Recursive: raw batches have slipped in at the top level twice already
// (13 onboarding cards, then 12 more) and a third time inside cards/familia/
// (16 files, 22MB) — scanning subfolders too means the next one gets caught
// by just re-running this script instead of needing a manual audit.
async function collectPngs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectPngs(full)));
    else if (entry.name.endsWith(".png")) files.push(full);
  }
  return files;
}

async function main() {
  const files = await collectPngs(DIR);
  for (const full of files) {
    const before = (await stat(full)).size;
    if (before <= RAW_THRESHOLD_BYTES) continue;

    const img = await Jimp.read(full);
    if (img.width > WIDTH) {
      const ratio = WIDTH / img.width;
      img.resize({ w: WIDTH, h: Math.round(img.height * ratio), mode: ResizeStrategy.BICUBIC });
    }
    const dst = full.replace(/\.png$/, ".jpg");
    await img.write(dst, { quality: QUALITY });
    await rm(full);
    const after = (await stat(dst)).size;
    console.log(`${path.relative(DIR, full)} -> ${path.basename(dst)}  ${before >> 10}KB -> ${after >> 10}KB`);
  }
}

main();
