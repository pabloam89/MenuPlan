/**
 * La señal de la casa por Realtime (trozo 20 de #1037).
 *
 * Cada vez que sube la versión de la casa (`household_state.bot_rev`), la base manda un mensaje de Broadcast al tema
 * privado `casa:<id>` con la versión nueva (migración 0121, `_avisar_rev_de_casa`). La app lo escucha y recarga al
 * momento, en vez de enterarse en el siguiente sondeo de 20 s. Mientras el canal no está suscrito (sin la 0121, sin
 * red o con Realtime caído) el sondeo sigue: `escucharCasa` dice en cada momento si se puede prescindir de él.
 */

import { supabase } from "./supabase.js";

/** El tema de la casa: el mismo texto que monta la 0121 ('casa:' || household_id). */
export const temaDeCasa = (householdId) => `casa:${householdId}`;

/** El evento que manda la 0121 (realtime.send(..., 'rev', ...)). */
export const EVENTO_REV = "rev";

/**
 * Los estados del canal que nombra este fichero, con el texto de supabase-js (`subscribe` da además TIMED_OUT). Van
 * tal cual a `user_events`: cuántas sesiones tienen la señal y cuántas siguen con el sondeo.
 */
export const ESTADO_SENAL = Object.freeze({
  SUSCRITA: "SUBSCRIBED",
  ERROR: "CHANNEL_ERROR",
  CERRADA: "CLOSED",
});

/** Con la señal, se mira igual cada 2 min, por si un aviso no llegó. */
export const SONDEO_CON_SENAL_MS = 120_000;

/** El evento de `user_events` con cada cambio de estado del canal (metadata: estado, motivo). */
export const EVENTO_SENAL = "casa_senal";

/**
 * Escucha la señal de una casa.
 * @param {any} cliente  el cliente de supabase-js
 * @param {string} householdId
 * @param {{ alCambiar: (rev: number) => void, alEstado: (suscrita: boolean, estado: string, motivo?: string) => void }} avisos
 *   `alCambiar` con cada versión nueva; `alEstado` con cada cambio del canal (suscrita = se puede apagar el sondeo).
 * @returns {() => void} quita la escucha
 */
export function escucharCasa(cliente, householdId, { alCambiar, alEstado }) {
  if (!cliente?.channel || !householdId) {
    alEstado(false, ESTADO_SENAL.CERRADA, "sin cliente o sin casa");
    return () => {};
  }
  let vivo = true;
  const canal = cliente
    .channel(temaDeCasa(householdId), { config: { private: true } })
    .on("broadcast", { event: EVENTO_REV }, ({ payload }) => {
      const rev = Number(payload?.rev);
      if (vivo && Number.isFinite(rev)) alCambiar(rev);
    });
  // Un canal privado necesita el token de la sesión antes de suscribirse; si no se puede poner, no hay señal y lo dice.
  Promise.resolve(cliente.realtime?.setAuth?.())
    .then(() => {
      if (!vivo) return;
      canal.subscribe((estado, error) => {
        if (vivo) alEstado(estado === ESTADO_SENAL.SUSCRITA, estado, error?.message);
      });
    })
    .catch((error) => {
      if (vivo) alEstado(false, ESTADO_SENAL.ERROR, error?.message ?? String(error));
    });
  return () => {
    vivo = false;
    cliente.removeChannel?.(canal);
  };
}

/**
 * Vigila una casa: `mirar` (leer la versión y recargar si es nueva) con cada señal, al suscribirse (lo que pasó
 * mientras se conectaba), cada `cadaMs` mientras no hay señal y cada `cadaMsConSenal` mientras la hay (un aviso que
 * la base no pudo mandar solo deja un warning en su log: sin este respaldo lento, la app no se enteraría hasta volver a
 * la pestaña). Cada cambio de estado del canal va a `anotar`.
 * @param {string} householdId
 * @param {{ mirar: () => void, cadaMs: number, cadaMsConSenal?: number, anotar: (estado: string, motivo?: string) => void }} opciones
 * @param {any} [cliente]
 * @returns {() => void} deja de vigilar
 */
export function vigilarCasa(householdId, { mirar, cadaMs, cadaMsConSenal = SONDEO_CON_SENAL_MS, anotar }, cliente = supabase) {
  let sondeo = null;
  const sondear = (ms) => {
    if (sondeo != null) clearInterval(sondeo);
    sondeo = ms == null ? null : setInterval(mirar, ms);
  };
  sondear(cadaMs);
  const dejar = escucharCasa(cliente, householdId, {
    alCambiar: () => mirar(),
    alEstado: (suscrita, estado, motivo) => {
      sondear(suscrita ? cadaMsConSenal : cadaMs);
      anotar(estado, motivo);
      if (suscrita) mirar();
    },
  });
  return () => {
    dejar();
    sondear(null);
  };
}
