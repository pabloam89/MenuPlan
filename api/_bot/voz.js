/**
 * Notas de voz: Telegram → Whisper (Groq) → texto, y a partir de ahí el mismo
 * camino que un mensaje escrito.
 *
 * Proveedor elegido el 30 sep 2026: Whisper en Groq, rápido y muy barato. El
 * 1 oct 2026, tras quejas de los testers («es malísimo»), tres cambios:
 *   · large-v3 y no large-v3-turbo: la turbo es la recortada para ir rápido,
 *     y lo que pierde es justo fuera del inglés;
 *   · el idioma se fija (el de Telegram de quien habla, español si no hay):
 *     adivinándolo, una nota corta salía en portugués o se inventaba frases;
 *   · la pista de vocabulario lleva los nombres de la casa y palabras de
 *     cocina, que es lo que más importa entender bien y más destrozaba.
 */

import { llamar } from "./telegram.js";
import { select, eq } from "./db.js";

const MODELO = "whisper-large-v3";
// Una nota de voz de más de dos minutos no es una orden, es un podcast; y
// Groq cobra por segundo. Se corta antes de descargar nada.
const MAX_SEGUNDOS = 120;

// Lo que se dice en esta casa y Whisper no conoce. Whisper solo mira los
// últimos ~224 tokens de la pista: corta y de palabras, no de frases.
const VOCABULARIO = [
  "HoMenu", "Lola", "menú", "cena", "comida", "tupper", "airfryer", "Thermomix",
  "olla rápida", "celíaco", "sin gluten", "sin lactosa", "intolerancia", "alergia",
  "batch cooking", "lentejas", "garbanzos", "merluza", "salmón", "tortilla",
  "puré", "crema de calabacín", "macarrones", "albóndigas", "Mercadona",
];

/** El idioma para Whisper (ISO 639-1) a partir del de Telegram: «es-ES» → «es». */
export const idiomaDe = (codigoTelegram) => (/^[a-z]{2}/i.exec(codigoTelegram ?? "")?.[0] ?? "es").toLowerCase();

/** Los nombres de quien come en la casa, para la pista. Si falla, sin nombres. */
async function nombresDeLaCasa(householdId) {
  if (!householdId) return [];
  try {
    const [fila] = await select("household_state", `household_id=${eq(householdId)}`, "miembros:state->data->members");
    return (fila?.miembros ?? []).map((p) => p?.name).filter(Boolean).slice(0, 12);
  } catch {
    return [];
  }
}

/** La pista de vocabulario: nombres de la casa primero, luego cocina. */
export function pistaDe(nombres = []) {
  return [...nombres, ...VOCABULARIO].join(", ") + ".";
}

/**
 * @param {{ file_id: string, duration?: number, mime_type?: string }} audio  msg.voice o msg.audio
 * @param {{ idioma?: string, householdId?: string }} [contexto]
 *   `idioma`, el language_code de Telegram de quien habla.
 * @returns {Promise<{ texto: string } | { error: string }>}
 */
export async function transcribir(audio, { idioma, householdId } = {}) {
  const clave = process.env.GROQ_API_KEY;
  if (!clave) return { error: "sin clave" };
  if ((audio.duration ?? 0) > MAX_SEGUNDOS) return { error: "largo" };

  const [fichero, nombres] = await Promise.all([
    llamar("getFile", { file_id: audio.file_id }),
    nombresDeLaCasa(householdId),
  ]);
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fichero.file_path}`;
  const bytes = await (await fetch(url)).arrayBuffer();

  const form = new FormData();
  const nombre = fichero.file_path.split("/").pop() || "nota.ogg";
  form.append("file", new Blob([bytes], { type: audio.mime_type || "audio/ogg" }), nombre);
  form.append("model", MODELO);
  form.append("language", idiomaDe(idioma));
  form.append("temperature", "0");
  form.append("response_format", "json");
  form.append("prompt", pistaDe(nombres));

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
