import { supabase } from "./supabase.js";

/**
 * Fotos de receta como FICHEROS, no como texto dentro de la fila.
 *
 * El generador de fotos (/api/generate-dish-photo) devuelve un `data:` URL, y
 * durante mucho tiempo eso se guardaba tal cual en `user_recipes.photo`. Medido
 * en producción: 2,2 MB por receta, y de esos 2,2 MB era la imagen. Pedir
 * cincuenta recetas eran 11,5 MB en una sola petición — 6 GB de salida en tres
 * semanas con tres usuarios, y la cuota del plan gratuito reventada.
 *
 * Aquí la foto se sube al bucket `recipe-photos` (ver 0039) y en la fila queda
 * su URL. Diferencia real: la sirve la CDN, se descarga UNA vez y se reutiliza,
 * y una consulta de recetas vuelve a pesar kilobytes.
 *
 * Todo degrada con elegancia: sin Supabase, sin sesión o si la subida falla, se
 * devuelve la foto tal como venía. Perder la foto sería mucho peor que seguir
 * guardándola de la forma cara, así que ante la duda no se toca.
 */

const BUCKET = "recipe-photos";

/** Una foto ya migrada es una URL; una sin migrar empieza por `data:`. */
export function isDataUrl(photo) {
  return typeof photo === "string" && photo.startsWith("data:");
}

/**
 * `data:image/png;base64,...` → Blob. Se hace a mano y no con fetch() porque
 * un data URL de 2 MB pasado por fetch cuesta una copia extra en memoria, y
 * esto corre en móviles.
 */
function dataUrlToBlob(dataUrl) {
  const [head, body] = String(dataUrl).split(",");
  if (!body) return null;
  const mime = head.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const EXT = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Sube la foto y devuelve su URL pública. Si `photo` ya es una URL, no hace
 * nada: esta función se llama en cada guardado y no puede volver a subir lo
 * que ya está subido.
 *
 * La ruta es `<userId>/<recipeId>.<ext>`, que es lo que hace que la política
 * de Storage funcione: la primera carpeta del nombre es el dueño. Y al ir por
 * id de receta, regenerar la foto sobreescribe la anterior en vez de dejar
 * ficheros huérfanos acumulándose.
 */
export async function uploadRecipePhoto(userId, recipeId, photo) {
  if (!supabase || !userId || !recipeId || !isDataUrl(photo)) return photo ?? null;

  const blob = dataUrlToBlob(photo);
  if (!blob) return photo;

  const path = `${userId}/${recipeId}.${EXT[blob.type] ?? "jpg"}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    // cacheControl en segundos (un año). Storage sirve ademas un ETag, asi
    // que aunque la cabecera acabe siendo no-cache, la segunda visita se
    // resuelve con un 304 de unos cientos de bytes en vez de reenviar la
    // imagen entera. Comprobado en produccion.
    .upload(path, blob, { contentType: blob.type, upsert: true, cacheControl: "31536000" });

  if (error) {
    // Que falle la subida no puede costar la foto: se devuelve como estaba y
    // se reintentará en el siguiente guardado.
    console.warn("[photos] subida fallida", error.message ?? error);
    return photo;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? photo;
}

/**
 * Borra la foto de una receta que se elimina. Sin esto, el cubo se llenaría de
 * imágenes de recetas que ya no existen, y nadie las volvería a mirar.
 */
export async function deleteRecipePhoto(userId, recipeId) {
  if (!supabase || !userId || !recipeId) return;
  const paths = ["jpg", "png", "webp"].map((e) => `${userId}/${recipeId}.${e}`);
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.warn("[photos] borrado fallido", error.message ?? error);
}

/**
 * Migra las fotos que quedaron incrustadas de antes.
 *
 * Se hace de una en una y no en paralelo a propósito: cada foto son un par de
 * megas, y disparar diez subidas a la vez desde un móvil es la mejor forma de
 * que fallen todas. Además el orden importa poco — esto corre en segundo
 * plano mientras la app ya funciona.
 *
 * Devuelve cuántas migró, para poder decirlo en consola y saber que terminó.
 */
export async function migrateEmbeddedPhotos(userId, { limit = 20 } = {}) {
  if (!supabase || !userId) return 0;

  const { data, error } = await supabase
    .from("user_recipes")
    .select("id, photo")
    .eq("owner_id", userId)
    .like("photo", "data:%")
    .limit(limit);

  if (error || !data?.length) return 0;

  let done = 0;
  for (const row of data) {
    const url = await uploadRecipePhoto(userId, row.id, row.photo);
    if (url === row.photo) continue; // no se pudo subir: se reintenta otro día
    const { error: upErr } = await supabase
      .from("user_recipes")
      .update({ photo: url })
      .eq("id", row.id)
      .eq("owner_id", userId);
    if (!upErr) done += 1;
  }

  if (done > 0) console.info(`[photos] ${done} foto(s) movidas a Storage`);
  return done;
}
