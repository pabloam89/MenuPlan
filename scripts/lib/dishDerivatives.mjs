// Shared by upload-to-blob.mjs (new dishes) and backfill-dish-derivatives.mjs
// (existing dishes): generates the small set of pre-sized WebP derivatives we
// serve instead of proxying every request through wsrv.nl at request time.
import sharp from "sharp";

// Covers the app's actual display sizes: icons/thumbnails (~100-200px),
// catalog/list cards (~300-650px), deck tiles + DishDetail hero (~700-1080px).
// deckImg() in src/lib/dishPhotoOptimize.js picks the smallest bucket >= the
// requested width, so this only needs to bracket real usage, not match it
// exactly.
export const DERIVATIVE_BUCKETS = [200, 500, 900];
export const DERIVATIVE_QUALITY = 80;

/**
 * @param {Buffer} sourceBuffer original JPEG
 * @returns {Promise<Record<number, Buffer>>} bucket width -> WebP buffer
 */
export async function generateDerivatives(sourceBuffer) {
  const out = {};
  for (const width of DERIVATIVE_BUCKETS) {
    out[width] = await sharp(sourceBuffer)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: DERIVATIVE_QUALITY })
      .toBuffer();
  }
  return out;
}
