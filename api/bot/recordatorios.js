/**
 * Manda los recordatorios vencidos (api/_bot/recordatorios.js).
 *
 * Lo llama un planificador cada pocos minutos con `Authorization: Bearer
 * <BOT_CRON_SECRET>`: vale el formato de los cron de Vercel (que mandan
 * CRON_SECRET así) y cualquier otro. Sin el secreto no hace nada.
 */

import crypto from "node:crypto";
import { enviarPendientes } from "../_bot/recordatorios.js";
import { enviar, escaparHtml } from "../_bot/telegram.js";
import { VISPERA, avisoDeVisperaDe } from "../_bot/vispera.js";

function autorizado(cabecera) {
  const secreto = process.env.BOT_CRON_SECRET || process.env.CRON_SECRET;
  if (!secreto) return false;
  const a = Buffer.from(String(cabecera ?? ""));
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();
  if (!autorizado(req.headers.authorization)) return res.status(401).end();
  const enviados = await enviarPendientes(async (r) => {
    if (r.channel !== "telegram") return;
    // El aviso de la víspera (api/_bot/vispera.js): se monta ahora, con el menú
    // de mañana, y si no hay nada que preparar no se manda nada.
    if (r.text === VISPERA) {
      const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
      const aviso = r.household_id ? await avisoDeVisperaDe(r.household_id, hoy) : null;
      if (aviso) await enviar(r.chat_id, aviso);
      return;
    }
    // Con un botón que se lo pide a Lola tal cual: «Preparar el menú de la
    // semana que viene» se convierte en prepararlo, sin tener que escribir.
    const cabe = Buffer.byteLength(`t:${r.text}`) <= 64;
    await enviar(r.chat_id, `⏰ <b>Recordatorio</b>: ${escaparHtml(r.text)}`, cabe
      ? { botones: [[{ texto: "👉 Vamos", dato: `t:${r.text}` }]] }
      : {});
  });
  return res.status(200).json({ ok: true, enviados });
}
