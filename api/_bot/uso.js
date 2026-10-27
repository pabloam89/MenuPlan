/**
 * Límite gratis y coste real del bot (specs/plan-bot-mensajeria.md: «gratis
 * con límite»).
 *
 * Cuenta por casa y mes (hora de España) en `bot_usage`: mensajes y tokens de
 * TODAS las llamadas al modelo de cada mensaje. Al pasar del límite el bot
 * contesta sin llamar al modelo, así que pasarse no cuesta nada.
 *
 * BOT_LIMITE_MENSUAL (por defecto 50) y BOT_SIN_LIMITE (ids de casa separados
 * por comas: el piloto con los socios) se cambian en Vercel sin tocar código.
 * 50 sale del presupuesto de lanzamiento (~0,054 $ por mensaje medido en oct
 * 2026: como mucho ~2,7 $ por casa y mes). Si cambia, cambia también la cifra
 * de api/_bot/conocimiento.md (preguntas frecuentes).
 */

import { seguirCon } from "./avisar.js";
import { select, rpc, eq } from "./db.js";
import { isoDeCasa } from "../../src/lib/dias.js";

export const LIMITE_POR_DEFECTO = 50;
export const limiteMensual = () => Number(process.env.BOT_LIMITE_MENSUAL) || LIMITE_POR_DEFECTO;
const sinLimite = (householdId) => (process.env.BOT_SIN_LIMITE ?? "").split(",").map((s) => s.trim()).includes(householdId);

export const mesActual = () =>
  isoDeCasa().slice(0, 7) + "-01";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «1 de diciembre»: el día que se reinicia el contador (hora de España). */
export function diaDeReinicio(iso = isoDeCasa()) {
  const mes = Number(iso.slice(5, 7)); // 1-12: el siguiente, en base 0
  return `1 de ${MESES[mes % 12]}`;
}

/** El texto con el que se contesta, sin llamar al modelo, con el tope agotado. */
export const textoDeTope = (limite = limiteMensual(), iso = isoDeCasa()) =>
  `Este mes ya hemos hablado ${limite} veces, que es lo máximo por ahora 🙈. `
  + `El <b>${diaDeReinicio(iso)}</b> vuelvo a estar aquí. `
  + "Mientras, tu menú, la lista de la compra y las recetas siguen en la app: /app";

/** null si puede seguir; si no, el texto con el que se contesta. */
export async function fueraDeLimite(householdId) {
  if (sinLimite(householdId)) return null;
  // a propósito: sin poder leer el uso, mejor contestar que bloquear
  const [fila] = await select("bot_usage", `household_id=${eq(householdId)}&month=eq.${mesActual()}`, "messages").catch(seguirCon("uso_limite", []));
  if ((fila?.messages ?? 0) < limiteMensual()) return null;
  return textoDeTope();
}

/** Suma el uso de un mensaje. Devuelve cuántos lleva la casa este mes. */
export async function contarUso(householdId, uso) {
  return rpc("bot_contar_uso", {
    p_household: householdId,
    p_mes: mesActual(),
    p_input: uso.input_tokens ?? 0,
    p_output: uso.output_tokens ?? 0,
    p_cache_read: uso.cache_read_input_tokens ?? 0,
    p_cache_write: uso.cache_creation_input_tokens ?? 0,
  });
}

/**
 * Aviso una sola vez, al llegar al 80 %: no es un muro por sorpresa. Con 50,
 * sale en el mensaje 40 y quedan 10. `llevados` es lo que devuelve contarUso
 * (ya sumado este mensaje), así que la cuenta sube de uno en uno.
 */
export function avisoDeLimite(householdId, llevados, iso = isoDeCasa()) {
  if (sinLimite(householdId)) return "";
  const limite = limiteMensual();
  const aviso = Math.floor(limite * 0.8);
  if (llevados !== aviso) return "";
  const quedan = limite - llevados;
  return `\n\n<i>Te ${quedan === 1 ? "queda 1 mensaje" : `quedan ${quedan} mensajes`} conmigo este mes. El ${diaDeReinicio(iso)} se reinicia.</i>`;
}
