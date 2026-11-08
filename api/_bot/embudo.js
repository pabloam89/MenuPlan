/**
 * El embudo del bot, con los MISMOS nombres que la app (src/lib/embudo.js):
 * `user_events` con screen "funnel" y metadata.canal = "telegram". Así la
 * pregunta «¿convierte mejor el chat que la app?» se contesta con una consulta.
 *
 * Nunca rompe nada: medir es secundario a contestar, así que cualquier fallo
 * se registra en el log y se sigue.
 */

import { seguirCon } from "./avisar.js";
import { EMBUDO, PANTALLA_EMBUDO } from "../../src/lib/embudo.js";
import { PANTALLA_RASTRO } from "../../src/lib/rastro.js";
import { select, insert, eq } from "./db.js";

export { EMBUDO };

/**
 * @param {string} event  uno de EMBUDO
 * @param {{ userId?: string|null, telegramId?: string|number|null, unaVez?: boolean, extra?: object }} o
 *   `unaVez`: no se repite para ese usuario (o, sin usuario, para ese Telegram).
 */
export async function registrar(event, { userId = null, telegramId = null, unaVez = false, extra = {} } = {}) {
  try {
    if (unaVez) {
      const filtro = userId
        ? `user_id=${eq(userId)}`
        : telegramId != null ? `metadata->>telegram_id=${eq(String(telegramId))}` : null;
      if (filtro) {
        const ya = await select("user_events", `event=${eq(event)}&${filtro}&limit=1`, "id");
        if (ya.length) return;
      }
    }
    await insert("user_events", [{
      user_id: userId,
      event,
      screen: PANTALLA_EMBUDO,
      metadata: { canal: "telegram", ...(telegramId != null ? { telegram_id: String(telegramId) } : {}), ...extra },
    }]);
  } catch (err) {
    console.error("[bot/embudo]", event, err?.message);
  }
}

/**
 * El rastro de lo que se hace desde el chat (src/lib/rastro.js): mismos
 * nombres y forma que la app, con la casa en metadata para el analista. Nunca
 * rompe nada: si falla, se apunta en el log y sigue.
 */
export async function rastro(householdId, event, datos = {}) {
  try {
    const userId = householdId ? await duenoDe(householdId) : null;
    await insert("user_events", [{
      user_id: userId,
      event,
      screen: PANTALLA_RASTRO,
      metadata: { canal: "telegram", ...(householdId ? { household_id: householdId } : {}), ...datos },
    }]);
  } catch (err) {
    console.error("[bot/rastro]", event, err?.message);
  }
}

/**
 * El dueño de una casa. Si la base falla, lanza el error: quien comprueba un
 * bloqueo (compartir.js, #208) tiene que saber que no pudo, no recibir null.
 */
export async function duenoDeEstricto(householdId) {
  const [h] = await select("households", `id=${eq(householdId)}`, "owner_user_id");
  return h?.owner_user_id ?? null;
}

/** El dueño de una casa: los eventos van a su nombre, como en la app. */
export async function duenoDe(householdId) {
  // a propósito: el evento vale más sin dueño que perdido
  return duenoDeEstricto(householdId).catch(seguirCon("embudo_dueno", null));
}

/**
 * Cimientos, con el criterio de la app (que los da por hechos al cerrar el paso
 * de alergias del alta): hay quien come en casa y las alergias están revisadas.
 * Las comidas ya vienen por defecto (comida y cena).
 */
export const cimientosCompletos = (data) =>
  (data?.members?.length ?? 0) > 0 && data?.allergiesReviewed === true;
