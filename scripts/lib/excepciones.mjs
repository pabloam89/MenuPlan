/**
 * La excepción a una norma, con UNA forma (#621, fondo #618). En el cuerpo del PR, una línea por excepción:
 *
 *     Excepción: <id de norma> — <motivo> — hasta AAAA-MM-DD
 *
 * Cuenta si la norma existe en ops/normas.json, el motivo es de verdad (MIN_MOTIVO) y la caducidad es una
 * fecha que no ha pasado ni cae más allá de MAX_DIAS. Si no, NO CUENTA y se dice por qué (`invalidas`).
 * Una excepción que no caduca es una norma que ya no existe, así que caducar es obligatorio.
 *
 * Las formas de antes de #621 (las de scripts/lib/avisosPr.mjs: «Tests relajados: sí — <motivo>»,
 * «Tamaño: grande — <motivo>» y «Aprendizaje: <dónde>») se aceptan durante una transición, hasta
 * RETIRADA_FORMAS_ANTIGUAS: cuentan como una excepción sin caducidad y avisan de que cambien. Pasada esa
 * fecha dejan de contar. Están registradas como retiradas en ops/vocabularios-vida.json (vocabulario
 * `pr.excepcion_forma`: se retiran, no se borran) y ops/precedencia.test.js cruza las dos listas.
 *
 * Puro: el cuerpo, la lista de normas y `hoy` entran por argumento. El cuerpo se lee con limpiarCuerpo
 * (sin comentarios ni bloques de código: la plantilla explica la forma en un comentario y no cuenta).
 */
import { limpiarCuerpo } from "../../.claude/hooks/casos.mjs";

/**
 * Las formas de excepción VIVAS (vocabulario `pr.excepcion_forma` de ops/vocabularios-vida.json): solo una.
 * Las de antes están retiradas allí (no se borran) y aquí, en FORMAS_ANTIGUAS, con su fecha de fin.
 */
export const FORMAS = { unica: "Excepción: <id de norma> — <motivo> — hasta AAAA-MM-DD, una línea por excepción, con caducidad" };

/** La forma única, tal como se escribe. */
export const FORMA = "Excepción: <id de norma> — <motivo> — hasta AAAA-MM-DD";
/** Largo mínimo del motivo (como el del «Casos: ninguno»: una palabra suelta no vale). */
export const MIN_MOTIVO = 10;
/** Lo más lejos que puede caer la caducidad: una excepción larga es una norma que hay que cambiar. */
export const MAX_DIAS = 90;
/** El día (incluido) hasta el que se aceptan las formas de antes; después no cuentan. */
export const RETIRADA_FORMAS_ANTIGUAS = "2026-11-15";

/**
 * Las formas antiguas: etiqueta de la línea, cómo se lee el valor y la norma a la que equivalen.
 * `id` es el valor retirado de `pr.excepcion_forma` en ops/vocabularios-vida.json.
 */
export const FORMAS_ANTIGUAS = [
  { id: "tests_relajados", etiqueta: "Tests relajados", valor: "s[ií][ \\t]*[—–-][ \\t]*(.{" + MIN_MOTIVO + ",})", norma: "tests-no-se-relajan" },
  { id: "tamano_grande", etiqueta: "Tama[ñn]o", valor: "grande[ \\t]*[—–-][ \\t]*(.{" + MIN_MOTIVO + ",})", norma: "pr-acotado" },
  { id: "aprendizaje", etiqueta: "Aprendizaje", valor: "(.{" + MIN_MOTIVO + ",})", norma: "lecciones-a-un-test" },
];

const motivoLimpio = (m) => String(m).trim().replace(/\s+/g, " ").slice(0, 120);
const lineasDe = (cuerpo, etiqueta, valor) => [...limpiarCuerpo(cuerpo).matchAll(new RegExp(`^[ \\t>*-]*(?:\\*\\*)?${etiqueta}(?:\\*\\*)?[ \\t]*:(?:\\*\\*)?[ \\t]*${valor}[ \\t]*$`, "gim"))];

const ID_NORMA = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SEP = "[ \\t]*[—–][ \\t]*";
// Cualquier línea que intente la forma nueva (para decir qué falla) y la forma completa.
const INTENTO = /^[ \t>*-]*(?:\*\*)?Excepci[oó]n(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*(.*)$/gim;
const COMPLETA = new RegExp(`^(${ID_NORMA})${SEP}(.+?)${SEP}hasta[ \\t]+(\\d{4}-\\d{2}-\\d{2})$`, "i");

const dias = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const fechaReal = (iso) => Number.isFinite(dias(iso)) && new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso);

/**
 * Lee las excepciones de un cuerpo. `normas`: ids de ops/normas.json (o la lista de normas); `hoy`: AAAA-MM-DD.
 * → { validas: [{ norma, motivo, hasta, forma }], invalidas: [{ norma, motivo, razon, linea }], antiguas: [{ norma, motivo, id }], antiguasVencidas: [{ norma, id }] }
 * `razon` ∈ RAZONES. Una antigua aceptada va en `validas` con forma «antigua» y `hasta: null`.
 */
export function leerExcepciones(cuerpo, { normas = [], hoy }) {
  if (!fechaReal(hoy ?? "")) throw new Error("excepciones: «hoy» es AAAA-MM-DD");
  const ids = new Set(normas.map((n) => (typeof n === "string" ? n : n.id)));
  const fuera = { validas: [], invalidas: [], antiguas: [], antiguasVencidas: [] };
  for (const m of limpiarCuerpo(cuerpo).matchAll(INTENTO)) {
    const resto = m[1].trim();
    const c = COMPLETA.exec(resto);
    if (!c) { fuera.invalidas.push({ norma: null, motivo: null, razon: "forma", linea: resto.slice(0, 80) }); continue; }
    const [, norma, motivoCrudo, hasta] = c;
    const motivo = motivoLimpio(motivoCrudo);
    const mala = (razon) => fuera.invalidas.push({ norma, motivo, hasta, razon });
    if (!ids.has(norma)) mala("norma_inexistente");
    else if (motivo.length < MIN_MOTIVO) mala("motivo_corto");
    else if (!fechaReal(hasta)) mala("fecha");
    else if (dias(hasta) < dias(hoy)) mala("vencida");
    else if (dias(hasta) - dias(hoy) > MAX_DIAS) mala("demasiado_lejos");
    else fuera.validas.push({ norma, motivo, hasta, forma: "unica" });
  }
  const vigentes = dias(hoy) <= dias(RETIRADA_FORMAS_ANTIGUAS);
  for (const f of FORMAS_ANTIGUAS) {
    for (const m of lineasDe(cuerpo, f.etiqueta, f.valor)) {
      const a = { norma: f.norma, motivo: motivoLimpio(m[1]), id: f.id };
      if (vigentes && ids.has(f.norma)) { fuera.antiguas.push(a); fuera.validas.push({ ...a, hasta: null, forma: "antigua" }); } else fuera.antiguasVencidas.push({ norma: f.norma, id: f.id });
    }
  }
  return fuera;
}

/** Por qué una excepción no cuenta (vocabulario cerrado, con su frase). */
export const RAZONES = {
  forma: "no sigue la forma «" + FORMA + "»",
  norma_inexistente: "la norma no existe en ops/normas.json",
  motivo_corto: `el motivo tiene menos de ${MIN_MOTIVO} caracteres`,
  fecha: "la fecha no es un día real AAAA-MM-DD",
  vencida: "la caducidad ya ha pasado",
  demasiado_lejos: `la caducidad pasa de ${MAX_DIAS} días`,
};

/** ¿Tiene el PR una excepción válida para esa norma? → la excepción o null. */
export const excepcionDe = (lectura, norma) => lectura.validas.find((e) => e.norma === norma) ?? null;
