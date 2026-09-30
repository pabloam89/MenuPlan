/**
 * Notas de voz: Telegram → Whisper (Groq) → texto, y a partir de ahí el mismo
 * camino que un mensaje escrito.
 *
 * Proveedor elegido el 30 sep 2026: Whisper large v3 turbo en Groq, rápido y
 * muy barato, suficiente para frases de cocina. El idioma no se fija: la
 * gente escribe en el suyo y el agente contesta en el mismo.
 */

import { llamar } from "./telegram.js";

const MODELO = "whisper-large-v3-turbo";
// Una nota de voz de más de dos minutos no es una orden, es un podcast; y
// Groq cobra por segundo. Se corta antes de descargar nada.
const MAX_SEGUNDOS = 120;

/**
 * @param {{ file_id: string, duration?: number, mime_type?: string }} audio  msg.voice o msg.audio
 * @returns {Promise<{ texto: string } | { error: string }>}
 */
export async function transcribir(audio) {
  const clave = process.env.GROQ_API_KEY;
  if (!clave) return { error: "sin clave" };
  if ((audio.duration ?? 0) > MAX_SEGUNDOS) return { error: "largo" };

  const fichero = await llamar("getFile", { file_id: audio.file_id });
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fichero.file_path}`;
  const bytes = await (await fetch(url)).arrayBuffer();

  const form = new FormData();
  const nombre = fichero.file_path.split("/").pop() || "nota.ogg";
  form.append("file", new Blob([bytes], { type: audio.mime_type || "audio/ogg" }), nombre);
  form.append("model", MODELO);
  form.append("response_format", "json");
  // Pista de vocabulario: nombres de platos y de la app se escriben bien.
  form.append("prompt", "Conversación sobre el menú de casa, recetas y la lista de la compra con HoMenu.");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json?.error?.message ?? `HTTP ${res.status}` };
  const texto = String(json.text ?? "").trim();
  return texto ? { texto } : { error: "vacío" };
}
