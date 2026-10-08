/**
 * Abrir la app ya dentro, desde un enlace del bot (`/?entrar=<código>`).
 *
 * Para quien empezó en Telegram sin cuenta (o pidió `/app`): el bot le manda un
 * código de un solo uso y 30 minutos; la app lo cambia aquí por un `token_hash`
 * de enlace mágico y abre sesión con `supabase.auth.verifyOtp`. Ningún correo
 * sale: el enlace mágico se genera en el servidor y se usa en el acto.
 *
 * Con un código `alta` (el saludo de Lola), la cuenta aún no existe y se crea
 * aquí mismo, atada al Telegram que lo pidió.
 *
 * Con `telegram` (los datos firmados de un botón de login, loginTelegram.js),
 * no hay código: entra quien pulsó, si su cuenta nació en ese Telegram.
 *
 * Sin sesión a propósito (es justo lo que viene a conseguir): lo que protege es
 * el código, 128 bits, de un solo uso y caducidad corta, más el límite de ritmo.
 */

import { seguirCon } from "../_bot/avisar.js";
import { rateLimit } from "../_guard.js";
import { config, select, eq } from "../_bot/db.js";
import { gastarCodigo } from "../_bot/enlace.js";
import { tokenHashDe, emailSintetico, cuentaNacidaAqui } from "../_bot/cuentas.js";
import { cuentaYChat, esDeOtraCuenta } from "../_bot/altaTelegram.js";
import { verificarLogin } from "../_bot/loginTelegram.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { ok } = await rateLimit(req, { bucket: "bot-entrar", limit: 20, windowSec: 600 });
  if (!ok) return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos." });

  try {
    // Botón de login de Telegram (login_url): no hay código, hay la firma de
    // quien lo pulsó. Vale siempre que la firma sea buena y reciente.
    if (req.body?.telegram) {
      const v = verificarLogin(req.body.telegram, process.env.TELEGRAM_BOT_TOKEN);
      if (!v.ok) {
        return res.status(v.motivo === "caducada" ? 410 : 403).json({
          error: v.motivo === "caducada" ? "Este enlace ha caducado. Vuelve a pulsarlo en Telegram." : "No he podido comprobar que eres tú.",
        });
      }
      const nacida = await cuentaNacidaAqui(v.telegramId);
      if (!nacida) {
        return (await esDeOtraCuenta(v.telegramId))
          ? res.status(403).json({ error: "Tu cuenta se abre con Google o con tu email." })
          : res.status(404).json({ error: "Aún no tienes cuenta: escríbele a Lola en Telegram y empezamos." });
      }
      return res.status(200).json({ token_hash: await tokenHashDe(nacida.email), user_id: nacida.id });
    }

    let fila = await gastarCodigo(req.body?.codigo, "entrar");
    // `alta` (0084): el botón «Prefiero rellenarlo en la app» del saludo. Aún
    // no hay cuenta: se crea aquí, la del Telegram que lo pidió, con su chat.
    if (!fila) {
      const alta = await gastarCodigo(req.body?.codigo, "alta");
      if (alta?.external_id) {
        // Su Telegram ya es una cuenta de la app (Google, email): no se le crea
        // otra, que pisaría su identidad.
        if (await esDeOtraCuenta(alta.external_id)) {
          return res.status(403).json({ error: "Tu Telegram ya está conectado a tu cuenta de HoMenu: entra con Google o con tu email." });
        }
        const cuenta = await cuentaYChat({ telegramId: alta.external_id, chatId: alta.chat_id, nombre: alta.nombre });
        fila = { ...alta, user_id: cuenta.userId };
      }
    }
    if (!fila) {
      // Gastado o caducado (un botón de un mensaje viejo). Se dice de quién era:
      // si este navegador ya está dentro con esa cuenta, la app sigue sin
      // avisar de nada. Quien tiene el código ya sabía a quién abría.
      // a propósito: sin la fila vieja, el 410 sale sin user_id
      const [vieja] = await select("bot_codigos", `codigo=${eq(String(req.body?.codigo ?? ""))}&tipo=eq.entrar`, "user_id").catch(seguirCon("bot/entrar", []));
      return res.status(410).json({ error: "Este enlace ya se usó. Vuelve a Telegram y pídele otro a Lola.", user_id: vieja?.user_id ?? null });
    }

    const { url, headers } = config();
    const u = await fetch(`${url}/auth/v1/admin/users/${fila.user_id}`, { headers }).then((r) => r.json());
    // Segunda llave, por si el código se creara por otro camino: solo se abre
    // sesión en cuentas NACIDAS en ese Telegram (email sintético de ese id).
    if (!u?.email || !fila.external_id || u.email !== emailSintetico(fila.external_id)) {
      return res.status(403).json({ error: "Esta cuenta se abre con Google o con tu email." });
    }

    // `user_id` va para que la app sepa si está cambiando de cuenta (y limpie
    // la copia local de la anterior antes de entrar).
    return res.status(200).json({ token_hash: await tokenHashDe(u.email), user_id: fila.user_id });
  } catch (err) {
    console.error("[bot/entrar]", err?.message);
    return res.status(500).json({ error: "No se pudo abrir la sesión." });
  }
}
