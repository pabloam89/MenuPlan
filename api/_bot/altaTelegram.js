/**
 * La cuenta de quien empieza en Telegram: la de su primer mensaje a Lola
 * (api/bot/telegram.js) y la del botón «Prefiero rellenarlo en la app» del
 * saludo, que se crea al abrir la app (api/bot/entrar.js, código `alta`).
 */

import { select, eq } from "./db.js";
import { crearCuentaTelegram, cuentaNacidaAqui, cuentaNacidaDe } from "./cuentas.js";
import { enlazarChat, casaPropia } from "./enlace.js";
import { CAMINO_ENLACE, PRUEBA_IDENTIDAD } from "../../src/lib/vocabularios.js";
import { sembrarCasa } from "./ajustes.js";

/**
 * La cuenta nacida en este Telegram (la crea si no la hay), con su casa
 * sembrada y su chat privado enlazado. Si este Telegram ya creó su cuenta, no
 * se crea otra; y siempre su casa PROPIA, nunca la activa (podría ser una
 * ajena en la que es invitado).
 * @param {{ telegramId: string|number, chatId: string|number, nombre?: string|null, lang?: string|null }} args
 * @returns {Promise<{ userId: string, householdId: string }>}
 */
export async function cuentaYChat({ telegramId, chatId, nombre = null, lang = null }) {
  const nacida = await cuentaNacidaAqui(telegramId);
  const cuenta = nacida
    ? { userId: nacida.id, householdId: (await casaPropia(nacida.id))?.id }
    : await crearCuentaTelegram({ telegramId, nombre });
  if (!cuenta.householdId) throw new Error("cuenta sin casa");

  await enlazarChat({
    camino: CAMINO_ENLACE.ALTA_TELEGRAM,
    chatId,
    kind: "private",
    householdId: cuenta.householdId,
    userId: cuenta.userId,
    externalId: String(telegramId),
    nombre,
    lang,
    identidad: PRUEBA_IDENTIDAD.NACIDA,
  });
  await sembrarCasa(cuenta.householdId);
  return cuenta;
}

/**
 * ¿Este Telegram está atado a una cuenta de la app (Google, email), no nacida
 * en él? Entonces no se le crea otra: la nacida pisaría su identidad.
 */
export async function esDeOtraCuenta(telegramId) {
  const [ident] = await select("bot_identities", `channel=eq.telegram&external_id=${eq(String(telegramId))}`, "user_id");
  if (!ident?.user_id) return false;
  return !(await cuentaNacidaAqui(telegramId));
}

/**
 * /cuentadeantes (#1238): este Telegram vuelve a la cuenta que nació en él, después de que un enlace de la app lo
 * pasara a otra. Es lo que hace que pasarlo sin preguntar no deje nunca una casa sin entrada. Solo en el privado de
 * esa persona (enlazarChat lo vuelve a mirar). Un fallo de la base o de Auth, lanza.
 * @returns {Promise<{ householdId: string } | { sin: true } | { ya: true } | { ocupado: true }>}
 *   `sin`: este Telegram no tiene cuenta propia; `ya`: ya está en ella.
 */
export async function volverACuentaNacida({ telegramId, chatId, nombre = null }) {
  const nacida = await cuentaNacidaDe(telegramId);
  if (!nacida) return { sin: true };
  const [ident] = await select("bot_identities", `channel=eq.telegram&external_id=${eq(String(telegramId))}`, "user_id");
  if (ident?.user_id === nacida.id) return { ya: true };
  // La activa si es suya; si no (se unió a otra), la más antigua que es suya.
  const hogar = (await casaPropia(nacida.id))
    ?? (await select("households", `owner_user_id=${eq(nacida.id)}&order=created_at.asc&limit=1`, "id"))[0];
  if (!hogar) throw new Error("cuenta nacida sin casa propia");
  const r = await enlazarChat({
    camino: CAMINO_ENLACE.REENGANCHE,
    chatId,
    kind: "private",
    householdId: hogar.id,
    userId: nacida.id,
    externalId: String(telegramId),
    nombre,
    identidad: PRUEBA_IDENTIDAD.NACIDA,
  });
  return r.ok ? { householdId: hogar.id } : { ocupado: true };
}
