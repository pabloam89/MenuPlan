/**
 * Las cuentas que nacen en Telegram (#1238): Lola las crea con un email sintético que nunca recibe correo
 * (`tg<id>@usuarios.menuplanai.com`, api/_bot/cuentas.js), y solo se entra en ellas desde el botón de Lola. Para abrir
 * HoMenu desde cualquier sitio, se les añade Google (linkIdentity de Supabase, con «manual linking» activado): la misma
 * cuenta, con otra forma de entrar. Puro: sin red.
 */

/** El dominio de los emails sintéticos de las cuentas nacidas en Telegram. */
export const DOMINIO_SINTETICO = "usuarios.menuplanai.com";

/** El email sintético de la cuenta nacida en ese Telegram. */
export const emailSintetico = (telegramId) => `tg${telegramId}@${DOMINIO_SINTETICO}`;

/** ¿La cuenta nació en Telegram? (por su email sintético) */
export const esCuentaDeTelegram = (user) => typeof user?.email === "string" && user.email.endsWith(`@${DOMINIO_SINTETICO}`);

/** ¿La cuenta ya entra con ese proveedor (google, apple…)? */
export const tieneProveedor = (user, proveedor) => (user?.identities ?? []).some((i) => i.provider === proveedor);

/** ¿Se le ofrece «Entrar también con Google»? Solo a una cuenta nacida en Telegram que aún no lo tiene. */
export const ofrecerGoogle = (user) => esCuentaDeTelegram(user) && !tieneProveedor(user, "google");

/**
 * Lo que vuelve de Supabase cuando añadir Google sale mal, con lo que la persona tiene que hacer. Un error que no
 * está aquí (cancelar en Google, un fallo del servidor) se dice igual, con NO_SE_PUDO_GOOGLE: nunca se calla.
 */
export const AVISOS_AL_VOLVER = Object.freeze({
  identity_already_exists: "Ese Google ya es otra cuenta de HoMenu. Entra con él y, en Ajustes, conecta Telegram: Lola te preguntará si lo pasas a esa cuenta.",
  manual_linking_disabled: "Ahora mismo no se puede añadir Google a la cuenta. Prueba más tarde.",
});

/** Cuando Google no se abre o vuelve con un error sin aviso propio. Un solo sitio: lo usan la app y el móvil. */
export const NO_SE_PUDO_GOOGLE = "No se pudo abrir Google. Inténtalo de nuevo.";

/** El aviso de una URL de vuelta con error (en la query o en el hash), o null si no trae error. */
export function avisoAlVolver(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const params = [u.searchParams, new URLSearchParams(u.hash.replace(/^#/, ""))];
  if (!params.some((p) => p.has("error") || p.has("error_code"))) return null;
  const codigo = params.map((p) => p.get("error_code")).find(Boolean);
  return AVISOS_AL_VOLVER[codigo] ?? NO_SE_PUDO_GOOGLE;
}
