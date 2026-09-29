/**
 * Abrir la app ya dentro, desde un enlace del bot (`/?entrar=<código>`).
 *
 * Para quien empezó en Telegram sin cuenta (o pidió `/app`): el bot le manda un
 * código de un solo uso y 30 minutos; la app lo cambia aquí por un `token_hash`
 * de enlace mágico y abre sesión con `supabase.auth.verifyOtp`. Ningún correo
 * sale: el enlace mágico se genera en el servidor y se usa en el acto.
 *
 * Sin sesión a propósito (es justo lo que viene a conseguir): lo que protege es
 * el código, 128 bits, de un solo uso y caducidad corta, más el límite de ritmo.
 */

import { rateLimit } from "../_guard.js";
import { config } from "../_bot/db.js";
import { gastarCodigo } from "../_bot/enlace.js";
import { tokenHashDe, emailSintetico } from "../_bot/cuentas.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { ok } = await rateLimit(req, { bucket: "bot-entrar", limit: 20, windowSec: 600 });
  if (!ok) return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos." });

  try {
    const fila = await gastarCodigo(req.body?.codigo, "entrar");
    if (!fila) return res.status(410).json({ error: "Este enlace ya no vale. Pídele otro al bot con /app." });

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
