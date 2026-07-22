/**
 * Client-side image prep for Claude vision via /api/generate.
 *
 * Phone camera shots are often 3–12 MB; base64 inside a JSON body blows past
 * Vercel's ~4.5 MB serverless payload limit and the request fails before the
 * model ever sees the image ("No se pudo leer la foto"). We downscale + JPEG
 * compress here so pantry/ticket vision stays under the wire.
 */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.72;
/** ~1.8 MB binary ≈ 2.4 MB base64 — leaves headroom under the 4.5 MB body cap. */
const MAX_BASE64_CHARS = 2_400_000;

function isProbablyHeic(file) {
  const type = String(file?.type ?? "").toLowerCase();
  const name = String(file?.name ?? "").toLowerCase();
  return type.includes("heic") || type.includes("heif") || /\.heic$|\.heif$/.test(name);
}

function canvasToJpegBase64(canvas, quality) {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return base64;
}

/**
 * @param {Blob|File} file
 * @returns {Promise<{ base64: string, mediaType: 'image/jpeg' }>}
 */
export async function imageFileToVisionPayload(file) {
  if (!file) throw new Error("No hay imagen");

  const type = String(file.type ?? "");
  if (type && !type.startsWith("image/") && !isProbablyHeic(file)) {
    throw new Error("El archivo no es una imagen");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (isProbablyHeic(file)) {
      throw new Error("Este formato (HEIC) no es compatible. Guarda la foto como JPG e inténtalo de nuevo.");
    }
    throw new Error("No se pudo abrir la imagen. Prueba con JPG o PNG.");
  }

  try {
    let quality = JPEG_QUALITY;
    let maxEdge = MAX_EDGE;
    let base64 = "";

    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo procesar la imagen");
      ctx.drawImage(bitmap, 0, 0, w, h);
      base64 = canvasToJpegBase64(canvas, quality);
      if (base64.length <= MAX_BASE64_CHARS) break;
      quality = Math.max(0.45, quality - 0.12);
      maxEdge = Math.max(900, Math.round(maxEdge * 0.75));
    }

    if (!base64 || base64.length > MAX_BASE64_CHARS) {
      throw new Error("La foto sigue siendo demasiado grande. Prueba con otra más cercana o recortada.");
    }

    return { base64, mediaType: "image/jpeg" };
  } finally {
    bitmap.close?.();
  }
}
