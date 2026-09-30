/**
 * La Mini App de Telegram (ver api/_bot/miniapp.js): semana y compra.
 *
 *   POST { initData }                              → { semana, compra }
 *   POST { initData, marcar: { id, comprado } }    → { ok }
 *
 * Sin sesión de Supabase: la llave es `initData`, firmado por Telegram con el
 * token del bot, y la casa es la del chat privado de ese usuario con el bot.
 */

import { rateLimit } from "../_guard.js";
import { validarInitData, casaDeUsuario, semanaYCompra, marcarPorId } from "../_bot/miniapp.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { ok } = await rateLimit(req, { bucket: "bot-miniapp", limit: 120, windowSec: 600 });
  if (!ok) return res.status(429).json({ error: "Demasiadas peticiones. Espera un momento." });

  const usuario = validarInitData(req.body?.initData, process.env.TELEGRAM_BOT_TOKEN);
  if (!usuario) return res.status(401).json({ error: "Ábrelo desde el chat con Lola." });

  try {
    const householdId = await casaDeUsuario(usuario.id);
    if (!householdId) return res.status(404).json({ error: "Primero escríbele a Lola en el chat para conectar tu casa." });

    const marcar = req.body?.marcar;
    if (marcar?.id) {
      const hecho = await marcarPorId(householdId, String(marcar.id), !!marcar.comprado);
      return res.status(hecho ? 200 : 409).json({ ok: hecho });
    }
    return res.status(200).json(await semanaYCompra(householdId));
  } catch (err) {
    console.error("[bot/miniapp]", err?.message);
    return res.status(500).json({ error: "No se ha podido cargar. Prueba otra vez en un momento." });
  }
}
