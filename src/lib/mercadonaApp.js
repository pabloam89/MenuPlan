/**
 * La app y Comprar en Mercadona, por api/mercadona.js (las tablas son solo del servidor, 0131). Nunca lanza por la red
 * ni por la sesión: `{ ok: false }` y quien llama lo dice.
 */
import { apiUrl } from "./apiUrl.js";
import { tokenDeSesion } from "./familiaCasa.js";
import { ESTADO_ENCARGO_MERCADONA, FALLO_ENCARGO_MERCADONA } from "./vocabularios.js";

/** Cada cuánto mira la app cómo va un encargo, y cuánto espera antes de dejar de mirar. */
export const CADA_MS = 4000;
export const ESPERA_MAX_MS = 5 * 60 * 1000;

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
/** `{ ok, encargo }` o `{ ok, fallo }`. */
export const pedirLista = (casa, lista, o) => pedir({ casa, cuerpo: { encargar: { lista } }, ...opciones(o) });
export const guardarSesion = (casa, sesion_cifrada, o) => pedir({ casa, cuerpo: { conectar: { sesion_cifrada } }, ...opciones(o) });
export const quitarCuenta = (casa, o) => pedir({ casa, cuerpo: { desconectar: true }, ...opciones(o) });

const enMarcha = (e) => e?.status === ESTADO_ENCARGO_MERCADONA.PENDIENTE || e?.status === ESTADO_ENCARGO_MERCADONA.RELLENANDO;
export { enMarcha as encargoEnMarcha };

/** Lo que se le dice a la familia de un encargo acabado. */
export function textoDeEncargo(e) {
  if (e.status === ESTADO_ENCARGO_MERCADONA.HECHO) {
    if (e.entraron === null) return "Lista creada. No he podido comprobar que estén todos los productos.";
    const faltan = e.faltan?.length ?? 0;
    return `Lista creada con ${e.entraron} productos.${faltan ? ` ${faltan} no ${faltan === 1 ? "ha entrado" : "han entrado"}.` : ""}`;
  }
  if (e.fallo === FALLO_ENCARGO_MERCADONA.BLOQUEADO) return "Mercadona no nos ha dejado rellenarla ahora. Inténtalo más tarde.";
  if (e.fallo === FALLO_ENCARGO_MERCADONA.CADUCADO) return "Se ha tardado demasiado. Inténtalo otra vez.";
  return "No se ha podido rellenar la lista. Inténtalo otra vez.";
}

/** Lo que se le dice cuando ni se ha encolado (NO_ENCARGADO, api/_bot/mercadonaEncargos.js). */
export const TEXTO_NO_ENCARGADO = Object.freeze({
  sin_servicio: "Esto aún no está en marcha.",
  en_marcha: "Ya estoy rellenando una lista.",
  tope: "Has pedido muchas listas hoy. Prueba mañana.",
});
