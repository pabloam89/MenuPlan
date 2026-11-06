/**
 * La app y Comprar en Mercadona, por api/mercadona.js (las tablas son solo del servidor, 0131). Nunca lanza por la red
 * ni por la sesión: `{ ok: false }` y quien llama lo dice.
 */
import { apiUrl } from "./apiUrl.js";
import { tokenDeSesion } from "./familiaCasa.js";

async function pedir({ casa, cuerpo, token, fetcher }) {
  try {
    const t = await token();
    if (!t) return { ok: false };
    const base = apiUrl("/api/mercadona");
    const res = await fetcher(cuerpo ? base : `${base}?casa=${encodeURIComponent(casa)}`, {
      method: cuerpo ? "POST" : "GET",
      headers: { authorization: `Bearer ${t}`, ...(cuerpo && { "content-type": "application/json" }) },
      body: cuerpo ? JSON.stringify({ casa, ...cuerpo }) : undefined,
    });
    if (!res.ok) {
      console.error("[mercadona] sin respuesta", res.status);
      return { ok: false };
    }
    return { ok: true, ...(await res.json()) };
  } catch (e) {
    console.error("[mercadona] sin respuesta:", String(e?.message ?? e));
    return { ok: false };
  }
}

const opciones = ({ token = tokenDeSesion, fetcher = fetch } = {}) => ({ token, fetcher });

/** `{ ok, disponible, cuenta, encargo, clave_publica }`. */
export const leerEstado = (casa, o) => pedir({ casa, ...opciones(o) });
export const guardarSesion = (casa, sesion_cifrada, o) => pedir({ casa, cuerpo: { conectar: { sesion_cifrada } }, ...opciones(o) });
