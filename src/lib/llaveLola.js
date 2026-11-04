/**
 * La llave con la que se llega desde Lola: un código de un solo uso
 * (`?entrar=`) o la firma de un login de Telegram. La firma llega de dos
 * sitios con los mismos campos: el botón de login de Lola (`?id=…&auth_date=…
 * &hash=…`, api/_bot/loginTelegram.js) y «Entrar con Telegram» de la pantalla
 * de entrada, que vuelve del login oficial con `#tgAuthResult=<base64 de un
 * JSON>` (specs/auth.md §7). La lee BotEnlace.jsx; useAuth y App solo
 * necesitan saber si la hay, para no estorbar mientras se abre la sesión.
 */

// Los campos que firma Telegram en un botón de login (y que hay que quitar de
// la dirección después de leerlos).
export const CAMPOS_TELEGRAM = ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"];

const conFirma = (p) => p.has("hash") && p.has("id") && p.has("auth_date");

// Lo mismo que busca el widget de Telegram (telegram-widget.js, haveTgAuthResult).
const RE_VUELTA = /[#?&]tgAuthResult=([A-Za-z0-9\-_=]*)$/;

/**
 * Los campos firmados de la vuelta del login oficial, como strings (los mismos
 * que trae el botón de Lola). Si la vuelta no se puede leer, un objeto vacío:
 * el servidor lo rechaza («incompleta») y la app lo dice, en vez de callarlo.
 */
function camposDeLaVuelta(codigo) {
  try {
    const b64 = codigo.replace(/-/g, "+").replace(/_/g, "/");
    const datos = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=")));
    if (!datos || typeof datos !== "object") return {};
    return Object.fromEntries(CAMPOS_TELEGRAM.filter((k) => datos[k] != null).map((k) => [k, String(datos[k])]));
  } catch (e) {
    console.warn("[llave] vuelta de Telegram ilegible:", e?.message);
    return {};
  }
}

/** ¿Trae la dirección una llave de Lola? */
export function traeLlaveDeLola(
  search = typeof window !== "undefined" ? window.location.search : "",
  hash = typeof window !== "undefined" ? window.location.hash : "",
) {
  const p = new URLSearchParams(search);
  return p.has("entrar") || conFirma(p) || RE_VUELTA.test(hash);
}

/**
 * Saca la llave de la dirección (y la quita, para que no se quede en el
 * historial ni se reutilice al recargar).
 * @returns {{ codigo: string } | { telegram: Record<string, string> } | null}
 */
export function sacarLlaveDeLola() {
  const url = new URL(window.location.href);
  const p = url.searchParams;
  const vuelta = url.hash.match(RE_VUELTA);
  let llave = null;
  if (p.has("entrar")) llave = { codigo: p.get("entrar") };
  else if (conFirma(p)) llave = { telegram: Object.fromEntries(CAMPOS_TELEGRAM.filter((k) => p.has(k)).map((k) => [k, p.get(k)])) };
  else if (vuelta) llave = { telegram: camposDeLaVuelta(vuelta[1]) };
  if (!llave) return null;
  for (const k of ["entrar", ...CAMPOS_TELEGRAM]) p.delete(k);
  if (vuelta) url.hash = url.hash.replace(RE_VUELTA, "");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  return llave;
}
