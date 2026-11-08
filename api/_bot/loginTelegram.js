/**
 * La firma de un botón de login de Telegram (login_url, ver botonTelegram en
 * telegram.js). Al pulsarlo, Telegram abre la URL con los datos de quien lo
 * pulsó (id, first_name, username, photo_url, auth_date…) y un `hash`.
 *
 * Cómo se comprueba (https://core.telegram.org/widgets/login#checking-authorization):
 * con todos los campos menos `hash`, ordenados y en líneas `clave=valor`, el
 * HMAC-SHA256 con clave SHA256(token del bot) tiene que dar ese `hash`. Solo
 * Telegram tiene el token, así que nadie puede fabricar la firma de otro.
 */

import crypto from "node:crypto";

// Lo que dura una firma: la URL firmada queda en el historial del navegador,
// y pasado este rato ya no abre sesión. Cada toque al botón firma de nuevo.
export const VIGENCIA_S = 60 * 60;

/** Los campos que firma Telegram (los demás de la URL, como `ir`, no entran). */
export const CAMPOS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"];

/**
 * @param {Record<string, string>} datos  los campos que llegaron (strings)
 * @param {string} token  el del bot
 * @param {number} [ahora]  segundos (para los tests)
 * @returns {{ ok: true, telegramId: string } | { ok: false, motivo: "incompleta" | "firma" | "caducada" }}
 */
export function verificarLogin(datos, token, ahora = Math.floor(Date.now() / 1000)) {
  const { hash, ...resto } = datos ?? {};
  if (!hash || !resto.id || !resto.auth_date || !token) return { ok: false, motivo: "incompleta" };
  const linea = Object.keys(resto)
    .filter((k) => CAMPOS.includes(k) && resto[k] != null)
    .sort()
    .map((k) => `${k}=${resto[k]}`)
    .join("\n");
  const clave = crypto.createHash("sha256").update(token).digest();
  const esperado = crypto.createHmac("sha256", clave).update(linea).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(String(hash));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, motivo: "firma" };
  const edad = ahora - Number(resto.auth_date);
  if (!(edad >= -300 && edad <= VIGENCIA_S)) return { ok: false, motivo: "caducada" };
  return { ok: true, telegramId: String(resto.id) };
}
