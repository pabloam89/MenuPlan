/**
 * voz.mjs — el medidor de la voz con Pablo (#453, skill `estilo-de-respuesta`).
 *
 * Por qué: la forma de hablarle a Pablo (idea raíz en negrita, cuatro ideas, tres
 * opciones, sin jerga) vivía solo como texto; los tests miraban los ejemplos, no las
 * respuestas reales. Pablo pidió que fuera «HARD, no soft coding» (10 oct 2026). Esta
 * es la fuente única de la medida: la usan el hook `.claude/hooks/voz.mjs` (al terminar
 * cada respuesta), `npm run voz` (el resumen) y `.claude/voz.test.js` (los ejemplos).
 *
 * FASE 1: solo MIDE. No frena ni deniega nada. Primero la cifra de partida; el freno,
 * si Pablo lo decide, en otro issue.
 *
 * Reglas de lo que NO se mira: lo que va en bloques de código y en citas (`>`) no cuenta
 * para ninguna regla de prosa (un mensaje puede citar lo que NO hay que hacer).
 * Nunca se guarda el texto del mensaje: solo la línea contable (`lineaDe`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Las faltas posibles (vocabulario cerrado): una por regla medible de la skill. */
export const FALTAS = Object.freeze([
  "raiz_en_negrita", "ideas_de_mas", "frase_larga", "parrafo_largo", "preambulo", "recapitulacion_final",
  "emoji", "jerga", "decision_sin_tres_opciones", "numero_sin_nombre", "ruta_o_comando_en_prosa",
]);

/** Por qué no se pudo medir (vocabulario cerrado de `voz: error=…`). */
export const ERRORES = Object.freeze(["entrada", "transcript", "escritura", "tiempo", "otro"]);

export const MAX_PALABRAS_FRASE = 25;
export const MAX_FRASES_PARRAFO = 5;
export const MAX_IDEAS = 4;

/** Palabras de uso corriente en castellano que también están en el glosario: contarlas daría falsos positivos. */
export const TERMINOS_COMUNES = Object.freeze(["caso", "guardia", "producción", "agente"]);

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA_GLOSARIO = join(AQUI, "..", "..", ".claude", "skills", "estilo-de-respuesta", "plantillas", "plantillas.md");

/** Los términos del glosario de la skill (la tabla de «## Glosario»): una sola fuente. */
export function terminosDeJerga(ruta = RUTA_GLOSARIO) {
  let texto = "";
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    // a propósito: sin el glosario no se mide la jerga (el resto de reglas siguen); lo vigila el test
    return [];
  }
  const ini = texto.indexOf("## Glosario");
  if (ini < 0) return [];
  const fin = texto.indexOf("\n## ", ini + 3);
  const seccion = texto.slice(ini, fin < 0 ? undefined : fin);
  return [...seccion.matchAll(/^\|\s*([^|]+?)\s*\|[^|]+\|\s*$/gm)]
    .map((m) => m[1])
    .filter((t) => t !== "Término" && !/^-+$/.test(t));
}

/** El texto sin bloques de código ni citas: lo que cuenta para las reglas de prosa. */
export function textoDeProsa(texto) {
  const salida = [];
  let dentro = false;
  for (const crudo of String(texto ?? "").split(/\r?\n/)) {
    const l = crudo.trim();
    if (/^(?:```|~~~)/.test(l)) { dentro = !dentro; continue; }
    if (dentro || l.startsWith(">") || !l) continue;
    salida.push(l);
  }
  return salida.join("\n");
}

const sinMarcas = (s) => String(s).replace(/\*/g, "");
const sinUrls = (s) => String(s).replace(/https?:\/\/\S+/g, "");
const frasesDe = (linea) => sinMarcas(linea).replace(/^[-•]\s+/, "").split(/(?<=[.!?])\s+/).filter(Boolean);
const palabrasDe = (s) => sinMarcas(s).split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p));

const PREAMBULO = /^\s*(claro|por supuesto|vale|perfecto|genial|desde luego|déjame|voy a)[,.!\s]/i;
const RECAPITULACION = /^\s*(?:en resumen|resumiendo|en conclusión|para resumir|en definitiva|como resumen|recapitulando|en síntesis)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const PIDE_DECIDIR = /necesito que decidas|te toca decidir|falta que decidas|qué prefieres|cuál prefieres|¿prefieres|respóndeme con la letra/i;
const RUTA = /(?:^|[\s(`"'«])(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]*[\w-]\.\w{1,5}\b/;
const FICHERO = /\b[\w-]+\.(?:mjs|cjs|js|jsx|ts|tsx|json|jsonl|md|ya?ml|sql|sh|css|html|log)\b/;
const COMANDO = /\b(?:npm (?:run|test|ci|install)|npx|git (?:push|pull|merge|commit|checkout|rebase|status|fetch|worktree|branch|add|stash|log|diff)|gh (?:pr|issue|api|run|workflow|secret)|node (?:scripts|\.claude)\/)/;
const RAMA = /\b(?:ops|bot|datos|ux|fix|feat|motor|rescate)\/[\w.-]+/;

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Términos de jerga que aparecen sin explicar la primera vez que salen. */
function jergaSinExplicar(prosa, terminos) {
  const texto = sinMarcas(sinUrls(prosa));
  const sueltos = [];
  for (const t of terminos) {
    if (TERMINOS_COMUNES.includes(t)) continue;
    const flags = t === t.toUpperCase() ? "u" : "iu"; // PR y CI: en mayúsculas; las demás, sin distinguir
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapar(t)}(?:e?s)?(?![\\p{L}\\p{N}])`, flags);
    const m = re.exec(texto);
    if (!m) continue;
    const despues = texto.slice(m.index + m[0].length, m.index + m[0].length + 12);
    const explicado = /^\s*(?:\(|:|=|—|–|-\s|(?:,\s*)?(?:es|son|significa)\b)/.test(despues);
    if (!explicado) sueltos.push(t);
  }
  return sueltos;
}

/** ¿Un `#n` fuera de paréntesis? (el número va solo entre paréntesis, detrás del nombre) */
function numeroSuelto(linea) {
  for (const m of linea.matchAll(/#\d+/g)) {
    const antes = linea.slice(0, m.index);
    const abiertos = (antes.match(/\(/g) ?? []).length - (antes.match(/\)/g) ?? []).length;
    if (abiertos <= 0) return true;
  }
  return false;
}

/**
 * Mide un mensaje. → { palabras, ideas, faltas: [códigos de FALTAS], cumple, detalle }
 * `detalle` lleva frases largas con su recuento (solo para el medidor de los ejemplos; no se guarda).
 */
export function medir(texto, { terminos = terminosDeJerga() } = {}) {
  const prosa = textoDeProsa(texto);
  const lineas = prosa ? prosa.split("\n") : [];
  const faltas = new Set();
  const detalle = { frasesLargas: [] };
  if (!lineas.length) return { palabras: 0, ideas: 0, faltas: [], cumple: true, detalle };

  const primera = lineas[0];
  if (!/^\*\*[^*]+\*\*/.test(primera)) faltas.add("raiz_en_negrita");
  if (PREAMBULO.test(sinMarcas(primera))) faltas.add("preambulo");
  const ideas = lineas.length - 1;
  if (ideas > MAX_IDEAS) faltas.add("ideas_de_mas");
  if (EMOJI.test(prosa)) faltas.add("emoji");
  if (RECAPITULACION.test(sinMarcas(lineas[lineas.length - 1])) && lineas.length > 1) faltas.add("recapitulacion_final");

  for (const l of lineas) {
    const frases = frasesDe(sinUrls(l));
    for (const f of frases) {
      const n = palabrasDe(f).length;
      if (n >= MAX_PALABRAS_FRASE) { faltas.add("frase_larga"); detalle.frasesLargas.push({ n, inicio: f.slice(0, 40) }); }
    }
    if (frases.length > MAX_FRASES_PARRAFO) faltas.add("parrafo_largo");
    if (numeroSuelto(l)) faltas.add("numero_sin_nombre");
    const plano = sinUrls(l);
    if (RUTA.test(plano) || FICHERO.test(plano) || COMANDO.test(plano) || RAMA.test(plano)) faltas.add("ruta_o_comando_en_prosa");
  }

  if (jergaSinExplicar(prosa, terminos).length) faltas.add("jerga");

  if (PIDE_DECIDIR.test(prosa)) {
    const opcion = (x) => new RegExp(`^[-•*\\s]*\\**${x}\\**(?:\\s*\\([^)]*\\))?\\s*[:.)]`, "m").test(prosa);
    const completa = opcion("A") && opcion("B") && opcion("C") && /recomendad/i.test(prosa) && /Respóndeme con la letra/.test(prosa);
    if (!completa) faltas.add("decision_sin_tres_opciones");
  }

  const lista = FALTAS.filter((f) => faltas.has(f));
  return { palabras: palabrasDe(prosa).length, ideas, faltas: lista, cumple: lista.length === 0, detalle };
}

/**
 * El medidor de los ejemplos de `.claude/voz.test.js`: las faltas de FORMA (sin jerga),
 * como frases legibles. Es el mismo medidor que el del hook, no otro.
 */
export function faltasDeMensaje(texto) {
  const prosa = textoDeProsa(texto);
  if (!prosa) return ["mensaje vacío"];
  const m = medir(texto, { terminos: [] });
  const f = [];
  if (m.faltas.includes("raiz_en_negrita")) f.push("la primera línea no es la idea raíz en negrita");
  if (m.faltas.includes("preambulo")) f.push("empieza con preámbulo");
  if (m.faltas.includes("emoji")) f.push("lleva emojis");
  if (m.faltas.includes("ideas_de_mas")) f.push("pasa de cuatro ideas");
  for (const { n, inicio } of m.detalle.frasesLargas) f.push(`frase de ${n} palabras: «${inicio}…»`);
  if (m.faltas.includes("parrafo_largo")) f.push("párrafo de más de cinco frases");
  return f;
}

// ── La línea contable ────────────────────────────────────────────────────────

/** `voz: dia=AAAA-MM-DD palabras=n ideas=n faltas=a,b|ninguna cumple=sí|no`; sin el texto del mensaje. */
export function lineaDe(m, dia) {
  return `voz: dia=${dia} palabras=${m.palabras} ideas=${m.ideas} faltas=${m.faltas.length ? m.faltas.join(",") : "ninguna"} cumple=${m.cumple ? "sí" : "no"}`;
}

/** `voz: error=<motivo cerrado>`: no se pudo medir. */
export function lineaDeError(motivo) {
  return `voz: error=${ERRORES.includes(motivo) ? motivo : "otro"}`;
}

/** Una línea del registro → { dia, palabras, ideas, faltas, cumple } o null si no es una línea de medida. */
export function leerLinea(linea) {
  const m = /^voz: dia=(\d{4}-\d\d-\d\d) palabras=(\d+) ideas=(\d+) faltas=(\S+) cumple=(sí|no)$/.exec(String(linea).trim());
  if (!m) return null;
  return { dia: m[1], palabras: +m[2], ideas: +m[3], faltas: m[4] === "ninguna" ? [] : m[4].split(","), cumple: m[5] === "sí" };
}

const sumarDias = (dia, n) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** El resumen de un registro: medidas, % que cumple, qué regla falla más y tendencia por día. */
export function resumir(lineas, { hoy, dias = 7 } = {}) {
  const desde = sumarDias(hoy, -(dias - 1));
  const medidas = [];
  let errores = 0;
  for (const l of lineas) {
    if (/^voz: error=/.test(String(l))) { errores++; continue; }
    const r = leerLinea(l);
    if (r && r.dia >= desde && r.dia <= hoy) medidas.push(r);
  }
  const cuenta = new Map();
  const dia = new Map();
  for (const r of medidas) {
    for (const f of r.faltas) cuenta.set(f, (cuenta.get(f) ?? 0) + 1);
    const d = dia.get(r.dia) ?? { dia: r.dia, medidas: 0, cumplen: 0 };
    d.medidas++;
    if (r.cumple) d.cumplen++;
    dia.set(r.dia, d);
  }
  const cumplen = medidas.filter((r) => r.cumple).length;
  return {
    desde, hasta: hoy, medidas: medidas.length, cumplen, errores,
    porcentaje: medidas.length ? Math.round((100 * cumplen) / medidas.length) : null,
    reglas: [...cuenta].map(([regla, veces]) => ({ regla, veces })).sort((a, b) => b.veces - a.veces || a.regla.localeCompare(b.regla)),
    porDia: [...dia.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
  };
}

// ── Leer el transcript local ─────────────────────────────────────────────────

const NO_ES_DE_PABLO = /^\s*<(?:task-notification|bash-|system-reminder|command-|local-command)/;

function filas(jsonl) {
  if (Array.isArray(jsonl)) return jsonl;
  return String(jsonl ?? "").split("\n").map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null; // a propósito: una línea cortada al escribir se salta
    }
  });
}

/** ¿Es este mensaje de usuario algo que escribió Pablo (no un resultado de herramienta ni ruido del sistema)? */
function esDePablo(e) {
  if (e.isMeta === true) return false;
  const c = e.message?.content;
  if (Array.isArray(c)) {
    if (c.length && c.every((p) => p?.type === "tool_result")) return false;
    return !NO_ES_DE_PABLO.test(c.filter((p) => p?.type === "text").map((p) => p.text).join("\n"));
  }
  return !NO_ES_DE_PABLO.test(String(c ?? ""));
}

/** Del transcript (JSONL): el último texto del asistente en cada turno de la sesión principal. */
export function respuestasFinales(jsonl) {
  const salida = [];
  let actual = "";
  for (const e of filas(jsonl)) {
    if (!e || e.isSidechain === true) continue;
    if (e.type === "user" && esDePablo(e)) {
      if (actual) salida.push(actual);
      actual = "";
    } else if (e.type === "assistant") {
      const partes = Array.isArray(e.message?.content) ? e.message.content : [];
      const t = partes.filter((p) => p.type === "text").map((p) => p.text).join("\n");
      if (t.trim()) actual = t;
    }
  }
  if (actual) salida.push(actual);
  return salida;
}
