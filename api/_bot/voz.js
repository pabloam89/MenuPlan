/**
 * Notas de voz: Telegram → Whisper (Groq) → texto, y a partir de ahí el mismo
 * camino que un mensaje escrito.
 *
 * Proveedor elegido el 30 sep 2026: Whisper en Groq, rápido y muy barato. El
 * 1 oct 2026, tras quejas de los testers («es malísimo»):
 *   · large-v3 y no large-v3-turbo: la turbo es la recortada para ir rápido,
 *     y lo que pierde es justo fuera del inglés;
 *   · el idioma se fija en español. Adivinándolo, una nota corta salía en
 *     otro idioma o inventada; y el idioma del móvil no sirve (en España
 *     mucha gente lo tiene en catalán, gallego, euskera o inglés y habla en
 *     español: Whisper transcribiría en ese idioma o traduciría);
 *   · la pista de vocabulario lleva los nombres de la casa y palabras de
 *     cocina, que es lo que más importa entender bien y más destrozaba;
 *   · lo que Whisper se inventa con un audio sin voz («Subtítulos realizados
 *     por…», «Gracias por ver el vídeo», o la propia pista de vuelta) se
 *     descarta como vacío, en vez de llegarle a Lola como si lo hubieran dicho;
 *   · las llamadas tienen tiempo máximo: colgadas, la función moría sin
 *     contestar nada.
 */

import { llamar } from "./telegram.js";
import { select, eq } from "./db.js";

const MODELO = "whisper-large-v3";
const IDIOMA = "es";
// Una nota de voz de más de dos minutos no es una orden, es un podcast; y
// Groq cobra por segundo. Se corta antes de descargar nada.
const MAX_SEGUNDOS = 120;
const TIEMPO_DESCARGA_MS = 10_000;
const TIEMPO_GROQ_MS = 20_000;

// Lo que se dice en esta casa y Whisper no conoce. Whisper solo mira los
// últimos ~224 tokens de la pista: corta y de palabras, no de frases.
const VOCABULARIO = [
  "HoMenu", "Lola", "menú", "cena", "comida", "tupper", "airfryer", "Thermomix",
  "olla rápida", "celíaco", "sin gluten", "sin lactosa", "intolerancia", "alergia",
  "batch cooking", "lentejas", "garbanzos", "merluza", "salmón", "tortilla",
  "puré", "crema de calabacín", "macarrones", "albóndigas", "Mercadona",
];

// Frases que Whisper suelta ante silencio o ruido (aprendidas de subtítulos
// de vídeos): nadie se las dice a Lola.
const ALUCINACIONES = [
  /subt[ií]tulos (realizados|hechos|creados) por/i,
  /amara\.org/i,
  /gracias por (ver|vernos|su atenci[oó]n)/i,
  /suscr[ií]bete/i,
  /^\W*(gracias|m[uú]sica|aplausos)\W*$/i,
];
// Un segmento sin voz, según Whisper (los umbrales de su propio transcribe.py).
const SIN_VOZ = (s) => s.no_speech_prob > 0.6 && s.avg_logprob < -1;

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

const palabras = (s) => String(s).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").split(/[^a-z0-9ñ]+/).filter(Boolean);

/**
 * Lo que Whisper devuelve, limpio: sin los segmentos sin voz ni las frases
 * inventadas. Vacío si no queda nada, o si lo que queda es la pista misma
 * (con silencio, Whisper a veces la repite tal cual).
 */
export function limpiarTranscripcion(json, pista = "") {
  const segmentos = Array.isArray(json?.segments) ? json.segments : null;
  const texto = segmentos
    ? segmentos.filter((s) => !SIN_VOZ(s)).map((s) => String(s.text ?? "").trim()).join(" ")
    : String(json?.text ?? "");
  const frases = texto.split(/(?<=[.!?¡¿])\s+/).filter((f) => !ALUCINACIONES.some((re) => re.test(f)));
  const limpio = frases.join(" ").replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  // Solo si es largo: «Macarrones» contestando a una pregunta también está
  // entero en la pista, y es una respuesta de verdad.
  const dePista = new Set(palabras(pista));
  const suyas = palabras(limpio);
  if (suyas.length >= 6 && suyas.filter((w) => dePista.has(w)).length / suyas.length > 0.8) return "";
  return limpio;
}

/**
 * @param {{ file_id: string, duration?: number, mime_type?: string }} audio  msg.voice o msg.audio
 * @param {{ householdId?: string }} [contexto]
 * @returns {Promise<{ texto: string } | { error: string }>}
 *   `error`: «vacío» si no se oyó nada que decir; el resto son fallos técnicos.
 */
export async function transcribir(audio, { householdId } = {}) {
  const clave = process.env.GROQ_API_KEY;
  if (!clave) return { error: "sin clave" };
  if ((audio.duration ?? 0) > MAX_SEGUNDOS) return { error: "largo" };

  const [fichero, nombres] = await Promise.all([
    llamar("getFile", { file_id: audio.file_id }),
    nombresDeLaCasa(householdId),
  ]);
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fichero.file_path}`;
  const descarga = await fetch(url, { signal: AbortSignal.timeout(TIEMPO_DESCARGA_MS) });
  if (!descarga.ok) return { error: `descarga ${descarga.status}` };
  const bytes = await descarga.arrayBuffer();

  const pista = pistaDe(nombres);
  const form = new FormData();
  const nombre = fichero.file_path.split("/").pop() || "nota.ogg";
  form.append("file", new Blob([bytes], { type: audio.mime_type || "audio/ogg" }), nombre);
  form.append("model", MODELO);
  form.append("language", IDIOMA);
  form.append("temperature", "0");
  // verbose_json: trae, por segmento, cuánto cree Whisper que no hay voz.
  form.append("response_format", "verbose_json");
  form.append("prompt", pista);

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}` },
    body: form,
    signal: AbortSignal.timeout(TIEMPO_GROQ_MS),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json?.error?.message ?? `HTTP ${res.status}` };
  const texto = limpiarTranscripcion(json, pista);
  return texto ? { texto } : { error: "vacío" };
}
