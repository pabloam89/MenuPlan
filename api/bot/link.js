/**
 * «Conectar Telegram» desde la app.
 *
 * La app llama aquí con la sesión del usuario; devolvemos dos enlaces t.me con
 * un código de un solo uso (15 minutos): uno para hablar con el bot en privado
 * y otro para meterlo en un grupo. Al pulsarlo, Telegram le manda al bot
 * `/start <código>` y el webhook (api/bot/telegram.js) enlaza ese chat con la
 * casa.
 *
 * Solo el dueño de la casa puede conectarla: el bot va a escribir en ella, y
 * hoy el invitado de un hogar es de solo lectura (HOUSEHOLDS.md).
 */

import crypto from "node:crypto";
import { select, insert, usuarioDeToken, eq } from "../_bot/db.js";
import { nombreDelBot } from "../_bot/telegram.js";

const VALIDEZ_MS = 15 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const accessToken = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return res.status(401).json({ error: "Falta la sesión." });

  try {
    const user = await usuarioDeToken(accessToken);
    if (!user) return res.status(401).json({ error: "Sesión inválida." });

    const [perfil] = await select("user_profiles", `user_id=${eq(user.id)}`, "active_household_id");
    const householdId = perfil?.active_household_id;
    if (!householdId) return res.status(409).json({ error: "No tienes una casa activa." });

    const [hogar] = await select("households", `id=${eq(householdId)}`, "id,name,owner_user_id");
    if (!hogar || hogar.owner_user_id !== user.id) {
      return res.status(403).json({ error: "Solo quien gestiona la casa puede conectarla." });
    }

    // 16 bytes en base64url: cabe en el límite de 64 caracteres de /start.
    const token = crypto.randomBytes(16).toString("base64url");
    await insert("bot_link_tokens", [{
      token,
      user_id: user.id,
      household_id: householdId,
      expires_at: new Date(Date.now() + VALIDEZ_MS).toISOString(),
    }]);

    const bot = await nombreDelBot();
    return res.status(200).json({
      privado: `https://t.me/${bot}?start=${token}`,
      grupo: `https://t.me/${bot}?startgroup=${token}`,
      caduca: VALIDEZ_MS / 60000,
    });
  } catch (err) {
    console.error("[bot/link]", err?.message);
    return res.status(500).json({ error: "No se pudo crear el enlace." });
  }
}
