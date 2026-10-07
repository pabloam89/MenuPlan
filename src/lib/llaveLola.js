/**
 * La llave con la que se llega desde Lola: un código de un solo uso
 * (`?entrar=`) o la firma de un botón de login de Telegram (`?id=…&auth_date=…
 * &hash=…`, api/_bot/loginTelegram.js). La lee BotEnlace.jsx; useAuth y App
 * solo necesitan saber si la hay, para no estorbar mientras se abre la sesión.
 */

// Los campos que firma Telegram en un botón de login (y que hay que quitar de
// la dirección después de leerlos).
export const CAMPOS_TELEGRAM = ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"];

const conFirma = (p) => p.has("hash") && p.has("id") && p.has("auth_date");

/** ¿Trae la dirección una llave de Lola? */
export function traeLlaveDeLola(search = typeof window !== "undefined" ? window.location.search : "") {
  const p = new URLSearchParams(search);
  return p.has("entrar") || conFirma(p);
}

/**
 * Saca la llave de la dirección (y la quita, para que no se quede en el
 * historial ni se reutilice al recargar).
 * @returns {{ codigo: string } | { telegram: Record<string, string> } | null}
 */
export function sacarLlaveDeLola() {
  const url = new URL(window.location.href);
  const p = url.searchParams;
  let llave = null;
  if (p.has("entrar")) llave = { codigo: p.get("entrar") };
  else if (conFirma(p)) llave = { telegram: Object.fromEntries(CAMPOS_TELEGRAM.filter((k) => p.has(k)).map((k) => [k, p.get(k)])) };
  if (!llave) return null;
  for (const k of ["entrar", ...CAMPOS_TELEGRAM]) p.delete(k);
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  return llave;
}
