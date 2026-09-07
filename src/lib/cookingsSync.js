import { supabase } from "./supabase.js";
import { ROW_TTL_MS } from "./cookings.js";

/**
 * Capa de datos de las cocinadas (ver 0050_cookings.sql).
 *
 * Mismo contrato que el resto de módulos de sync: sin Supabase o sin sesión no
 * revienta, devuelve vacío. Gente no funciona sin red —no hay copia local de
 * lo que publican otros— así que aquí el vacío es un estado normal, no un
 * fallo.
 *
 * La visibilidad la aplica la BASE, no este fichero: 'public' lo ve cualquiera,
 * 'followers' quien te sigue, 'private' solo tú.
 */

const ok = () => Boolean(supabase);

function warn(where, error) {
  if (error) console.warn(`[cookings] ${where}`, error.message ?? error);
  return error;
}

const BUCKET = "cooking-photos";

const isDataUrl = (v) => typeof v === "string" && v.startsWith("data:");

/**
 * `data:image/jpeg;base64,...` → Blob, a mano y no con fetch(): un data URL de
 * 2 MB pasado por fetch cuesta una copia extra en memoria, y esto corre en
 * móviles. Mismo criterio que lib/recipePhotos.js.
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
 * Sube la foto y devuelve su URL pública. La ruta es `<userId>/<cookingId>.<ext>`
 * porque la política de Storage compara la PRIMERA carpeta con auth.uid(): así
 * nadie puede escribir en la carpeta de otro.
 *
 * Si algo falla se devuelve null y la cocinada se publica sin foto: perder la
 * publicación entera por una subida fallida sería mucho peor que perder la
 * foto — el resto (el plato, el sello, quién comió) sigue contando lo de hoy.
 */
async function uploadPhoto(userId, cookingId, photo) {
  if (!ok() || !userId || !isDataUrl(photo)) return null;
  const blob = dataUrlToBlob(photo);
  if (!blob) return null;

  const path = `${userId}/${cookingId}.${EXT[blob.type] ?? "jpg"}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: true });
  if (warn("uploadPhoto", error)) return null;

  return supabase.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl ?? null;
}

/** La forma que espera la UI. La base habla snake_case y la pantalla camelCase. */
function fromRow(r) {
  return {
    id: r.id,
    ownerId: r.owner_id,
    createdAt: r.created_at,
    photo: r.photo_url ?? null,
    recipeId: r.recipe_id,
    recipeName: r.recipe_name,
    draft: r.is_draft,
    seal: r.sticker ?? null,
    eaters: Array.isArray(r.eaters) ? r.eaters : [],
    guests: Array.isArray(r.guests) ? r.guests : [],
  };
}

/**
 * Publicar. El id se genera ANTES de subir la foto porque el nombre del fichero
 * lo lleva dentro; si la subida falla, la fila entra igual sin `photo_url`.
 */
export async function publishCooking({
  ownerId,
  recipeId,
  recipeName,
  draft = false,
  photo = null,
  seal = null,
  eaters = [],
  guests = [],
  visibility = "followers",
}) {
  if (!ok() || !ownerId) return null;
  if (!recipeId || !recipeName) throw new Error("Una cocinada necesita una receta debajo");

  const id = crypto.randomUUID();
  const photoUrl = await uploadPhoto(ownerId, id, photo);

  const { data, error } = await supabase
    .from("cookings")
    .insert({
      id,
      owner_id: ownerId,
      recipe_id: recipeId,
      recipe_name: recipeName,
      is_draft: draft,
      photo_url: photoUrl,
      sticker: seal,
      eaters,
      guests,
      visibility,
    })
    .select()
    .single();
  if (warn("publishCooking", error)) return null;
  return data ? fromRow(data) : null;
}

/**
 * Las cocinadas VIVAS de la fila: las tuyas y las de quien sigues, dentro de la
 * ventana de 48 h. Se filtra por fecha en la CONSULTA y no en el cliente para
 * no traerse el histórico entero: la fila enseña hoy, y la historia de una
 * receta se pide aparte cuando hace falta.
 */
export async function loadRowCookings({ viewerId = null, followingIds = [] } = {}) {
  if (!ok()) return [];
  const owners = [...new Set([...(followingIds ?? []), viewerId].filter(Boolean))];
  if (owners.length === 0) return [];

  const since = new Date(Date.now() - ROW_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("cookings")
    .select("*")
    .in("owner_id", owners)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (warn("loadRowCookings", error)) return [];
  return (data ?? []).map(fromRow);
}

/**
 * La historia de una receta: todas las veces que se ha cocinado, de quien tú
 * puedas ver. Es lo que ninguna app de fotos puede hacer — allí dos fotos de
 * lentejas no saben que son la misma cosa.
 */
export async function loadRecipeCookings(recipeId, { limit = 30 } = {}) {
  if (!ok() || !recipeId) return [];
  const { data, error } = await supabase
    .from("cookings")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (warn("loadRecipeCookings", error)) return [];
  return (data ?? []).map(fromRow);
}

/**
 * Todo lo que ha cocinado alguien, para su perfil. Aquí NO se corta a 48 h:
 * esa ventana es de la fila de Gente, y el sentido del perfil es justo el
 * contrario — es el archivo donde lo que caduca deja de perderse. Sin este
 * sitio, caducar dolería.
 *
 * La visibilidad la sigue aplicando la base: de un privado que no te acepta
 * vuelve vacío, y la pantalla lo explica en vez de enseñar una lista en blanco.
 */
export async function loadOwnerCookings(ownerId, { limit = 60 } = {}) {
  if (!ok() || !ownerId) return [];
  const { data, error } = await supabase
    .from("cookings")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (warn("loadOwnerCookings", error)) return [];
  return (data ?? []).map(fromRow);
}

/** Cuántas ha publicado alguien. `head: true` no trae filas, solo el total. */
export async function countOwnerCookings(ownerId) {
  if (!ok() || !ownerId) return 0;
  const { count, error } = await supabase
    .from("cookings")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (warn("countOwnerCookings", error)) return 0;
  return count ?? 0;
}

/** Borrar la tuya. La foto se va con ella: dejarla huérfana llena el cubo. */
export async function deleteCooking(userId, cooking) {
  if (!ok() || !userId || !cooking?.id) return false;
  const { error } = await supabase.from("cookings").delete().eq("id", cooking.id);
  if (warn("deleteCooking", error)) return false;

  if (cooking.photo?.includes(`/${BUCKET}/`)) {
    const path = cooking.photo.split(`/${BUCKET}/`)[1]?.split("?")[0];
    if (path) await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
  }
  return true;
}
