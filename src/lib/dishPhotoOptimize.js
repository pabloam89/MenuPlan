// On-the-fly image optimization for dish photos: the origin blobs are
// ~1.5-1.8 MB / ~1024px, far too heavy for thumbnails and cards. wsrv.nl
// resizes + converts to WebP at the edge (origin stays cached separately).
// Temporary until we ship pre-generated derivatives with sharp.
// WebP only: wsrv.nl's free endpoint returns HTTP 400 for `output=avif`, and a
// failed <source> in a <picture> does NOT fall back to <img src> — it just
// shows nothing. So we stick to WebP, which every target browser supports.
// Some callers pass a locally-picked photo (data: URI from the device photo
// picker) rather than a Blob origin URL — wsrv.nl can't fetch those, so we
// pass them through untouched instead of proxying.
function isRemoteUrl(url) {
  return typeof url === "string" && /^https?:\/\//.test(url);
}

export function deckImg(url, w = 720) {
  if (!url) return null;
  if (!isRemoteUrl(url)) return url;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&output=webp&q=72`;
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
