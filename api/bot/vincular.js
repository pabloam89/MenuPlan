/**
 * «Ya tengo cuenta»: conectar el chat desde el que se pidió el email.
 *
 * El bot mandó un enlace de acceso de Supabase con `/?vincular=<código>`. Al
 * abrirlo, la app ya tiene sesión y pregunta ANTES de conectar: si alguien
 * escribiera tu email en su Telegram, el correo te llegaría a ti, y sin esta
 * pregunta un clic despistado le daría tu casa. Por eso hay dos pasos:
 *
 *   · `{ codigo, paso: "ver" }`       → de quién es el chat (sin gastar el código)
 *   · `{ codigo, paso: "confirmar" }` → gasta el código y enlaza
 *
 * Solo el dueño de la casa activa puede conectarla (como en api/bot/link.js).
 */

import { select, usuarioDeToken, eq } from "../_bot/db.js";
import { gastarCodigo, enlazarChat, casaPropia, confirmarEnlace } from "../_bot/enlace.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const accessToken = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return res.status(401).json({ error: "Falta la sesión." });

  try {
    const user = await usuarioDeToken(accessToken);
    if (!user) return res.status(401).json({ error: "Sesión inválida." });

    const { codigo, paso } = req.body ?? {};
    if (typeof codigo !== "string" || !/^[\w-]{16,64}$/.test(codigo)) {
      return res.status(400).json({ error: "Enlace no válido." });
    }

    const hogar = await casaPropia(user.id);
    if (!hogar) return res.status(403).json({ error: "Solo quien gestiona la casa puede conectarla." });

    if (paso === "ver") {
      const [fila] = await select(
        "bot_codigos",
        `codigo=${eq(codigo)}&tipo=eq.vincular&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
        "nombre",
      );
      if (!fila) return res.status(410).json({ error: "Este enlace ya no vale. Pídele otro al bot." });
      return res.status(200).json({ nombre: fila.nombre, casa: hogar.name });
    }

    const fila = await gastarCodigo(codigo, "vincular");
    if (!fila) return res.status(410).json({ error: "Este enlace ya no vale. Pídele otro al bot." });

    const r = await enlazarChat({
      channel: fila.channel,
      chatId: fila.chat_id,
      kind: "private",
      householdId: hogar.id,
      userId: user.id,
      externalId: fila.external_id,
      nombre: fila.nombre,
    });
    if (r.ocupado) return res.status(409).json({ error: "Ese chat ya está conectado a otra casa." });

    await confirmarEnlace(fila.chat_id, hogar.id).catch((e) => console.error("[bot/vincular] aviso", e?.message));
    return res.status(200).json({ ok: true, casa: hogar.name });
  } catch (err) {
    console.error("[bot/vincular]", err?.message);
    return res.status(500).json({ error: "No se pudo conectar el chat." });
  }
}
