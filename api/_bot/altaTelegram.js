/**
 * La cuenta de quien empieza en Telegram: la de su primer mensaje a Lola
 * (api/bot/telegram.js) y la del botón «Prefiero rellenarlo en la app» del
 * saludo, que se crea al abrir la app (api/bot/entrar.js, código `alta`).
 */

import { select, eq } from "./db.js";
import { crearCuentaTelegram, cuentaNacidaAqui } from "./cuentas.js";
import { enlazarChat, casaPropia } from "./enlace.js";
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
    chatId,
    kind: "private",
    householdId: cuenta.householdId,
    userId: cuenta.userId,
    externalId: String(telegramId),
    nombre,
    lang,
    identidad: "nacida",
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
