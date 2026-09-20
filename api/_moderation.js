import crypto from "node:crypto";

// Piezas compartidas por el aviso de un reporte y por la retirada del
// contenido. Viven aparte porque el enlace que se manda por correo lo FIRMA
// report-alert.js y lo VERIFICA moderate-takedown.js: si cada uno tuviera su
// copia del cálculo, el día que uno cambiara los enlaces dejarían de valer sin
// que nada lo avisara.

export const BASE_URL = (process.env.PUBLIC_BASE_URL || "https://homenu.vercel.app").replace(/\/$/, "");

export function supabaseConfig() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

/**
 * Firma del enlace de retirada.
 *
 * El enlace llega a un correo y se abre desde el móvil sin sesión ninguna, así
 * que lo único que lo protege es esta firma: sin ella, cualquiera que probara
 * ids de reporte podría borrar contenido ajeno. `MODERATION_SECRET` vive solo
 * en el servidor — nunca en el repo ni en la base, que es el motivo de que el
 * disparador de Postgres mande solo el id y no un token.
 */
export function signReport(reportId) {
  const secret = process.env.MODERATION_SECRET;
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(String(reportId)).digest("base64url");
}

/** Comparación en tiempo constante: un `===` filtra el token byte a byte. */
export function verifyReportToken(reportId, token) {
  const expected = signReport(reportId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Dónde vive cada cosa reportable y qué significa retirarla.
//
// Un comentario se borra: no hay versión suya que valga la pena conservar. Una
// receta, un menú o un perfil se pasan a privado en vez de destruirse — quien
// modera retira el contenido de la vista pública, no castiga a su autor
// borrándole el trabajo, y una retirada por error se deshace.
export const TARGETS = {
  comment: { table: "social_comments", column: "id", action: "delete" },
  recipe: { table: "user_recipes", column: "id", action: "hide" },
  menu: { table: "shared_menus", column: "id", action: "hide" },
  profile: { table: "social_profiles", column: "user_id", action: "hide" },
};
