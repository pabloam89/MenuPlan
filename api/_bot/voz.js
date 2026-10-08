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
import { cargarCasa } from "./casa.js";
import { propiasDe } from "./propias.js";
import { vetosDe } from "../../src/lib/vetos.js";

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

/**
 * Lo que se dice en ESTA casa: quién come y las palabras suyas que más salen y
 * Whisper no conoce (sus recetas, lo que no les gusta). De la casa en memoria
 * (casa.js): el turno la lee igual justo después. Si falla, sin nada.
 */
export async function palabrasDeLaCasa(householdId) {
  if (!householdId) return { nombres: [], propias: [] };
  try {
    const casa = await cargarCasa(householdId);
    return palabrasDe(casa?.state?.data ?? {}, propiasDe(casa));
  } catch {
    return { nombres: [], propias: [] };
  }
}

/** Pura, para el test. */
export function palabrasDe(data = {}, propias = data.userRecipes ?? []) {
  const miembros = data.members ?? [];
  const nombres = miembros.map((p) => p?.name).filter(Boolean).slice(0, 12);
  const recetas = propias.map((r) => r?.name).filter(Boolean).slice(-6);
  const noGusta = vetosDe(data).slice(0, 6);
  return { nombres, propias: [...new Set([...recetas, ...noGusta])] };
}

// La pista, como mucho esto: ~200 tokens en español.
const MAX_PISTA = 600;

/**
 * La pista de vocabulario. Whisper se queda con el FINAL si es larga, así que
 * va de lo general a lo de la casa: cocina, sus palabras y, al final, los
 * nombres. Si no cabe, se cae primero lo general.
 */
export function pistaDe(nombres = [], propias = []) {
  const todo = [...VOCABULARIO, ...propias, ...nombres];
  while (todo.length > nombres.length && todo.join(", ").length + 1 > MAX_PISTA) todo.shift();
  return todo.join(", ") + ".";
}

// Palabras que empiezan frase o van en mayúscula y se parecen a un nombre
// («Una» y Ana, «Los» y Lou): nunca se corrigen.
const COMUNES = new Set(`una uno unos unas los las les lo la le el ella ello ellos ellas yo ya tu tú su sus mi mis nos
  eso esa ese esto esta este estos estas hoy que qué con sin por para pero muy mas más dos tres cuatro seis siete ocho
  nueve diez hay haz pon pues bueno vale hola lola cena cenas comida comidas menu menú mama mamá papa papá abuela abuelo
  nada nadie todo toda todos todas otro otra como cómo cuando cuándo donde dónde quien quién lunes martes miercoles
  miércoles jueves viernes sabado sábado domingo mañana tarde noche`.split(/\s+/).filter(Boolean));

// Nombres corrientes: si Whisper ha oído uno de estos, es que lo han dicho
// (un invitado, un amigo), aunque se parezca a alguien de la casa: «Mario» no
// se cambia por «María». Aquí es donde una lista de nombres ayuda; en la pista
// no, que solo caben ~200 tokens y diluiría los de la casa.
const NOMBRES_CORRIENTES = new Set(`antonio jose manuel francisco david juan javier daniel carlos jesus alejandro miguel
  rafael pablo pedro angel sergio fernando jorge luis alberto alvaro adrian diego raul ivan ruben enrique oscar ramon
  andres vicente joaquin santiago victor eduardo roberto jaime mario marcos hugo martin lucas leo mateo nicolas samuel
  gonzalo marc alex izan bruno thiago gabriel julio julian emilio ignacio tomas felipe cesar guillermo hector ismael
  maria carmen ana isabel laura cristina marta lucia elena paula sara rosa pilar raquel beatriz patricia silvia julia
  irene alba andrea claudia noelia rocio monica eva sofia martina daniela valeria carla alicia lola nuria teresa
  ines olivia emma vega manuela luisa paola sonia veronica natalia adriana lorena alma chloe mia jimena celia diana
  marina victoria clara blanca esther miriam mercedes dolores josefa antonia concepcion ainhoa irati leire`.split(/\s+/).filter(Boolean));

// Cómo suena, no cómo se escribe: «Ximena» y «Jimena», «Iker» e «Iquer», «Lucía» y «Luzía».
function sonido(palabra) {
  return String(palabra).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/ch/g, "§").replace(/h/g, "").replace(/§/g, "ch")
    .replace(/qu([ei])/g, "k$1").replace(/c([ei])/g, "s$1").replace(/c/g, "k").replace(/z/g, "s")
    .replace(/gu([ei])/g, "g$1").replace(/g([ei])/g, "j$1").replace(/x/g, "j").replace(/v/g, "b")
    .replace(/ll/g, "y").replace(/(.)\1+/g, "$1");
}

function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/**
 * Los nombres de la casa mal oídos, corregidos: «Lío no quiere pescado» →
 * «Leo no quiere pescado». Solo palabras en mayúscula (Whisper las pone a los
 * nombres), que no sean palabras corrientes, que suenen casi igual que UN
 * nombre de la casa (con dos parecidos, no se toca) y empiecen por la misma letra.
 */
export function corregirNombres(texto, nombres = []) {
  const deLaCasa = [...new Set(nombres.flatMap((n) => String(n).split(/\s+/)).filter((n) => n.length >= 3))];
  if (!deLaCasa.length) return texto;
  const sinTilde = (s) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  // El de la casa, escrito como en la casa («Lucia» → «Lucía»).
  const exactos = new Map(deLaCasa.map((n) => [sinTilde(n), n]));
  return String(texto).replace(/\p{Lu}[\p{L}]{2,}/gu, (palabra) => {
    const plano = sinTilde(palabra);
    if (exactos.has(plano)) return exactos.get(plano);
    const s = sonido(palabra);
    // Suena exactamente igual que uno de la casa: es esa persona, mal escrita
    // («Jimena» y en casa hay una Ximena), aunque sea un nombre corriente.
    const iguales = deLaCasa.filter((n) => sonido(n) === s);
    if (iguales.length === 1 && !COMUNES.has(plano)) return iguales[0];
    if (COMUNES.has(plano) || NOMBRES_CORRIENTES.has(plano)) return palabra;
    const parecidos = deLaCasa.filter((n) => {
      const sn = sonido(n);
      if (sn[0] !== s[0]) return false;
      return sn === s || distancia(sn, s) <= (Math.min(sn.length, s.length) >= 6 ? 2 : 1);
    });
    return parecidos.length === 1 ? parecidos[0] : palabra;
  });
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

  const [fichero, { nombres, propias }] = await Promise.all([
    llamar("getFile", { file_id: audio.file_id }),
    palabrasDeLaCasa(householdId),
  ]);
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fichero.file_path}`;
  const descarga = await fetch(url, { signal: AbortSignal.timeout(TIEMPO_DESCARGA_MS) });
  if (!descarga.ok) return { error: `descarga ${descarga.status}` };
  const bytes = await descarga.arrayBuffer();

  const pista = pistaDe(nombres, propias);
  const form = new FormData();
  // Telegram guarda las notas de voz como «.oga», y Groq decide el formato
  // por la extensión y no la acepta (400, «file must be one of…»): es Ogg
  // Opus, así que se llama «.ogg». Por esto la voz no funcionó nunca hasta
  // el 1 oct 2026.
  const nombre = (fichero.file_path.split("/").pop() || "nota.ogg").replace(/\.oga$/i, ".ogg");
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
  const texto = corregirNombres(limpiarTranscripcion(json, pista), nombres);
  return texto ? { texto } : { error: "vacío" };
}
