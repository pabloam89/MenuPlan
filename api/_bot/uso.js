/**
 * Límite gratis y coste real del bot (specs/plan-bot-mensajeria.md: «gratis
 * con límite»).
 *
 * Cuenta por casa y mes (hora de España) en `bot_usage`: mensajes y tokens de
 * TODAS las llamadas al modelo de cada mensaje. Al pasar del límite el bot
 * contesta sin llamar al modelo, así que pasarse no cuesta nada.
 *
 * BOT_LIMITE_MENSUAL (por defecto 100) y BOT_SIN_LIMITE (ids de casa separados
 * por comas: el piloto con los socios) se cambian en Vercel sin tocar código.
 */

import { select, rpc, eq } from "./db.js";
import { isoDeCasa } from "../../src/lib/dias.js";

export const limiteMensual = () => Number(process.env.BOT_LIMITE_MENSUAL) || 100;
const sinLimite = (householdId) => (process.env.BOT_SIN_LIMITE ?? "").split(",").map((s) => s.trim()).includes(householdId);

export const mesActual = () =>
  isoDeCasa().slice(0, 7) + "-01";

/** null si puede seguir; si no, el texto con el que se contesta. */
export async function fueraDeLimite(householdId) {
  if (sinLimite(householdId)) return null;
  const [fila] = await select("bot_usage", `household_id=${eq(householdId)}&month=eq.${mesActual()}`, "messages").catch(() => []);
  if ((fila?.messages ?? 0) < limiteMensual()) return null;
  return `Este mes ya hemos hablado ${limiteMensual()} veces, que es el límite de la versión gratis 🙈. `
    + "El día 1 se reinicia. Mientras, el menú, la compra y las recetas siguen en la app (/app).";
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

/** Aviso una sola vez, al acercarse: no es un muro por sorpresa. */
export function avisoDeLimite(householdId, llevados) {
  if (sinLimite(householdId)) return "";
  const limite = limiteMensual();
  const aviso = Math.floor(limite * 0.9);
  return llevados === aviso ? `\n\n<i>Aviso: llevamos ${llevados} de ${limite} mensajes gratis este mes.</i>` : "";
}
