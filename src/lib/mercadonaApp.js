/**
 * La app y Comprar en Mercadona, por api/mercadona.js (las tablas son solo del servidor, 0131). Nunca lanza por la red
 * ni por la sesión: `{ ok: false }` y quien llama lo dice.
 */
import { apiUrl } from "./apiUrl.js";
import { FALTA_MERCADONA } from "./mercadonaLlegaHasta.js";
import { tokenDeSesion } from "./familiaCasa.js";
import { ESTADO_ENCARGO_MERCADONA, FALLO_ENCARGO_MERCADONA, NO_ENCARGADO, NO_ENTRADO_MERCADONA } from "./vocabularios.js";

/** Lo que dice el botón de comprar en cada paso. */
export const PASO_COMPRAR = Object.freeze({
  COMPRAR: "Comprar",
  RELLENANDO: "Rellenando…",
  ABRIR: "Abrir lista",
  MIRAR: "Mirar cómo va",
});

/** Los textos de Ajustes → Mercadona (trozo 9 de specs/plan-comprar-mercadona.md). */
export const AJUSTE_MERCADONA = Object.freeze({
  LISTA: "Rellenar la lista",
  RESERVAR: "Reservar la hora",
  PAGAR: "Pagar la compra",
  PRONTO: "Pronto",
});

/** Cada cuánto mira la app cómo va un encargo, y cuánto espera antes de dejar de mirar. */
export const CADA_MS = 4000;
export const ESPERA_MAX_MS = 5 * 60 * 1000;
/** Consultas seguidas sin respuesta antes de decir que no se sabe cómo va. */
export const FALLOS_MAX = 3;

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
/** `{ ok, llega_hasta }`, `{ ok, falta }` o `{ ok, fallo }`. */
export const cambiarHasta = (casa, llega_hasta, o) => pedir({ casa, cuerpo: { llega_hasta }, ...opciones(o) });
/** `{ ok, guardado }` o `{ ok, fallo }`. El teléfono llega ya sellado: el servidor nunca lo ve en claro. */
export const enviarTelefono = (casa, telefono_sellado, o) => pedir({ casa, cuerpo: { telefono: { telefono_sellado } }, ...opciones(o) });

/**
 * Lo que se dice cuando a la cuenta le falta algo para un paso (`faltaPara`). El teléfono no tiene texto: se pide en
 * una casilla. Sin mirar todavía, se dice que se mirará.
 */
export const TEXTO_FALTA = Object.freeze({
  [FALTA_MERCADONA.DIRECCION]: "Añade tu dirección en la app de Mercadona.",
  [FALTA_MERCADONA.PAGO]: "Añade una tarjeta en la app de Mercadona.",
});
export const SIN_MIRAR = "Miraré tu cuenta de Mercadona la próxima vez que rellene tu lista.";
export const TELEFONO = Object.freeze({ ETIQUETA: "Teléfono para el repartidor", GUARDAR: "Guardar", MAL: "Ese teléfono no parece bien." });

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

/** Lo que se le dice cuando ni se ha encolado. */
/** Qué se dice si entrar en Mercadona desde la app no acaba bien (`entrarEnMercadona`). Cerrar la ventana no es un fallo: no se dice nada. */
export const TEXTO_NO_ENTRADO = Object.freeze({
  [NO_ENTRADO_MERCADONA.CERRADA]: null,
  [NO_ENTRADO_MERCADONA.TIEMPO]: "Se ha acabado el tiempo. Vuelve a probar.",
  [NO_ENTRADO_MERCADONA.SIN_CLAVE]: "Esto aún no está en marcha.",
  [NO_ENTRADO_MERCADONA.NO_GUARDADA]: "No se ha podido guardar. Vuelve a probar.",
});

export const TEXTO_NO_ENCARGADO = Object.freeze({
  [NO_ENCARGADO.SIN_SERVICIO]: "Esto aún no está en marcha.",
  [NO_ENCARGADO.EN_MARCHA]: "Ya estoy rellenando una lista.",
  [NO_ENCARGADO.TOPE]: "Has pedido muchas listas hoy. Prueba mañana.",
});
