// Dish photo optimization. Two tiers:
//  1. Pre-generated WebP derivatives (scripts/lib/dishDerivatives.mjs) — built
//     once at upload time (or via the one-off scripts/backfill-dish-derivatives.mjs
//     for dishes uploaded before this existed) and served directly, no
//     per-request work.
//  2. wsrv.nl fallback for any dish that doesn't have derivatives yet: resizes
//     + converts to WebP at the edge from the ~1.5-1.8MB/1024px origin blob.
//     WebP only — wsrv.nl's free endpoint returns HTTP 400 for `output=avif`,
//     and a failed <source> in a <picture> does NOT fall back to <img src>,
//     it just shows nothing.
// Some callers pass a locally-picked photo (data: URI from the device photo
// picker) rather than a Blob origin URL — neither tier can resize those, so
// they pass through untouched.
import derivativesManifest from "../assets/dishes/dishImageDerivatives.json";

function isRemoteUrl(url) {
  return typeof url === "string" && /^https?:\/\//.test(url);
}

const DERIVATIVE_BUCKETS = [200, 500, 900];
function pickBucket(w) {
  for (const b of DERIVATIVE_BUCKETS) if (w <= b) return b;
  return DERIVATIVE_BUCKETS[DERIVATIVE_BUCKETS.length - 1];
}

function derivativesFor(url) {
  return derivativesManifest[url.split("?")[0]] ?? null;
}

/** Keep derivative cache-bust in sync with dishImages.json ?v= on the origin URL. */
function withOriginVersion(derivativeUrl, originUrl) {
  if (!derivativeUrl || !originUrl) return derivativeUrl;
  const v = new URL(originUrl, "https://local").searchParams.get("v");
  if (!v) return derivativeUrl;
  const base = derivativeUrl.split("?")[0];
  return `${base}?v=${v}`;
}

function wsrvImg(url, w) {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&output=webp&q=72`;
}

export function deckImg(url, w = 720) {
  if (!url) return null;
  if (!isRemoteUrl(url)) return url;
  const derivatives = derivativesFor(url);
  if (derivatives) {
    const bucket = pickBucket(w);
    if (derivatives[bucket]) return withOriginVersion(derivatives[bucket], url);
  }
  return wsrvImg(url, w);
}

// Responsive srcset with width descriptors so the browser fetches the size
// that actually fits the tile x device pixel ratio (instead of a fixed width
// for a small thumbnail). Caps at 1080 — the origin blobs are ~1024px, so
// asking for more just upscales. Paired with a `sizes` hint of the tile's CSS
// width. Returns undefined for local/data URIs — there's no meaningful
// multi-width variant to offer.
export function deckSrcSet(url, w = 720) {
  if (!url || !isRemoteUrl(url)) return undefined;
  const hi = Math.min(Math.round(w * 2), 1080);
  const lo = Math.min(w, hi);
  const parts = [`${deckImg(url, lo)} ${lo}w`];
  if (hi > lo) parts.push(`${deckImg(url, hi)} ${hi}w`);
  return parts.join(", ");
}

// The deck tile a user taps is already loaded at a smaller width than the
// DishDetail hero (deckImg(url, 720)) — different width means a different
// wsrv.nl URL, so opening the sheet always triggers a fresh proxy resize
// (the slow part users notice). Firing this on pointerdown, before the tap
// even registers, gives that resize a head start that overlaps with the
// sheet's opening animation instead of starting cold when the sheet mounts.
const prefetchedHeroes = new Set();
export function prefetchDeckHero(url, w = 720) {
  if (!isRemoteUrl(url)) return;
  const key = `${url}|${w}`;
  if (prefetchedHeroes.has(key)) return;
  prefetchedHeroes.add(key);
  const img = new Image();
  img.src = deckImg(url, w);
}
