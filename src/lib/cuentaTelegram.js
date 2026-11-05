/**
 * Las cuentas que nacen en Telegram (#1238): Lola las crea con un email sintético que nunca recibe correo
 * (`tg<id>@usuarios.menuplanai.com`, api/_bot/cuentas.js), y solo se entra en ellas desde el botón de Lola. Para abrir
 * HoMenu desde cualquier sitio, se les añade Google (linkIdentity de Supabase, con «manual linking» activado): la misma
 * cuenta, con otra forma de entrar. Puro: sin red.
 */

/**
 * El dominio que el bot tiene en @BotFather (/setdomain, 7 oct 2026). El login de Telegram (el botón de Lola y
 * «Entrar con Telegram») solo funciona en él: en otro, Telegram contesta «Bot domain invalid». Lo leen la app y el
 * servidor (api/bot/telegram.js). Un bot tiene uno solo: al pasar a producción, cambia aquí y en @BotFather a la vez.
 */
export const DOMINIO_LOGIN_TELEGRAM = "homenu-staging.vercel.app";

/** El id del bot de Lola (@homenuers_bot). Es público: el número de su usuario, que enseña el propio widget de Telegram. */
export const BOT_ID = 8808620013;

/**
 * Adónde lleva «Entrar con Telegram» (specs/auth.md §7): al login oficial de Telegram, en la misma pestaña. Telegram
 * vuelve a `return_to` con `#tgAuthResult=` y los campos firmados (los lee src/lib/llaveLola.js). `request_access`
 * deja a Lola escribirle. Fuera del dominio del bot, null: allí Telegram lo rechaza y el botón no sale.
 * @param {{ host: string, origin: string, pathname: string, search: string }} loc  window.location
 */
export function urlEntrarConTelegram(loc) {
  if (loc?.host !== DOMINIO_LOGIN_TELEGRAM) return null;
  const p = new URLSearchParams({
    bot_id: String(BOT_ID),
    origin: loc.origin,
    request_access: "write",
    lang: "es",
    return_to: `${loc.origin}${loc.pathname}${loc.search}`,
  });
  return `https://oauth.telegram.org/auth?${p}`;
}

/** El dominio de los emails sintéticos de las cuentas nacidas en Telegram. */
export const DOMINIO_SINTETICO = "usuarios.menuplanai.com";

/** El email sintético de la cuenta nacida en ese Telegram. */
export const emailSintetico = (telegramId) => `tg${telegramId}@${DOMINIO_SINTETICO}`;

/** ¿La cuenta nació en Telegram? (por su email sintético) */
export const esCuentaDeTelegram = (user) => typeof user?.email === "string" && user.email.endsWith(`@${DOMINIO_SINTETICO}`);

/** ¿La cuenta ya entra con ese proveedor (google, apple…)? */
export const tieneProveedor = (user, proveedor) => (user?.identities ?? []).some((i) => i.provider === proveedor);

/** Las formas de entrar, en el orden en que se enseñan (Telegram primero). Google y Apple son proveedores de Supabase. */
export const FORMA_DE_ENTRAR = Object.freeze({ TELEGRAM: "telegram", GOOGLE: "google", APPLE: "apple" });

/**
 * «Formas de entrar» de Mi perfil (specs/auth.md §7, trozo 2): con qué entra la cuenta (`tiene`) y qué se le puede
 * añadir. Telegram sale solo en las cuentas nacidas en Telegram, que son las que abre (trozo 3 para las demás), y
 * ni se añade ni se quita desde aquí. Apple, donde se ofrece (`conApple`) o si la cuenta ya entra con él.
 * `apagable`: se puede quitar, porque le queda otra forma de entrar. La última nunca, o la cuenta se quedaría sin llave.
 * @returns {{ forma: string, tiene: boolean, apagable: boolean }[]}
 */
export function formasDeEntrar(user, { conApple }) {
  const conTelegram = esCuentaDeTelegram(user);
  const google = tieneProveedor(user, FORMA_DE_ENTRAR.GOOGLE);
  const apple = tieneProveedor(user, FORMA_DE_ENTRAR.APPLE);
  const otra = (propia) => [conTelegram, google, apple].filter(Boolean).length > (propia ? 1 : 0);
  const formas = [];
  if (conTelegram) formas.push({ forma: FORMA_DE_ENTRAR.TELEGRAM, tiene: true, apagable: false });
  formas.push({ forma: FORMA_DE_ENTRAR.GOOGLE, tiene: google, apagable: google && otra(true) });
  if (conApple || apple) formas.push({ forma: FORMA_DE_ENTRAR.APPLE, tiene: apple, apagable: apple && otra(true) });
  return formas;
}

/** El nombre de cada forma de entrar, para la pantalla. */
export const NOMBRE_FORMA = Object.freeze({ telegram: "Telegram", google: "Google", apple: "Apple" });

/** La línea de la fila de Mi perfil: con qué entra hoy la cuenta. */
export function resumenDeFormas(formas) {
  const nombres = formas.filter((f) => f.tiene).map((f) => NOMBRE_FORMA[f.forma]);
  return `Entras con ${nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}` : nombres[0] ?? "tu cuenta"}`;
}

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

/** Lo mismo al añadir una forma de entrar desde Mi perfil, por proveedor. */
export const NO_SE_PUDO_ANADIR = Object.freeze({
  [FORMA_DE_ENTRAR.GOOGLE]: NO_SE_PUDO_GOOGLE,
  [FORMA_DE_ENTRAR.APPLE]: "No se pudo abrir Apple. Inténtalo de nuevo.",
});

/** Cuando no se ha podido quitar una forma de entrar. */
export const NO_SE_PUDO_QUITAR = "No se ha podido quitar. Inténtalo de nuevo.";

/** El aviso de una URL de vuelta con error (en la query o en el hash), o null si no trae error. */
export function avisoAlVolver(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const params = [u.searchParams, new URLSearchParams(u.hash.replace(/^#/, ""))];
  if (!params.some((p) => p.has("error") || p.has("error_code"))) return null;
  const codigo = params.map((p) => p.get("error_code")).find(Boolean);
  return AVISOS_AL_VOLVER[codigo] ?? NO_SE_PUDO_GOOGLE;
}
