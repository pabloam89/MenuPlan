/**
 * La forma de una práctica y el rastro de las rondas de investigación (#458).
 *
 * Todo es DATO en `ops/forja.json` (`forma_practica`, `metodo_construccion`);
 * aquí solo se validan. Aplicarlo a los estándares reales es de #454. Cada comprobación dice a qué
 * criterio de la base pertenece, y por tanto en qué capa está:
 *   - formal: nº de bullets, estructura del bullet y fuente por bullet;
 *   - material (heurística; las rondas, con lista de excepciones que solo baja): voz, modo, tiempo y persona,
 *     y las rondas de investigación.
 * El glosario único (vocabulario-canonico) es del encargo #469, no de aquí.
 *
 * El repo es público (#300): dice QUÉ se pide, nunca cómo se salta un control.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FUENTE_F, FUENTE_I, esTexto } from "./forja.mjs";

export const RUTA_EXCEPCIONES = "ops/forja-excepciones.json";

/** Las partes de un bullet, en este orden. */
export const PARTES_BULLET = ["regla", "porque", "ejemplo_bueno", "ejemplo_malo"];
export const VOCES = ["activa"];
export const MODOS_TIEMPO = ["imperativo", "presente"];
export const PERSONAS = ["segunda", "tercera", "impersonal"];

const MIN_PARTE = 10;

export function leerExcepciones(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_EXCEPCIONES), "utf8"));
}

// ── La forma declarada ─────────────────────────────────────────────────────

/** Errores del bloque `forma_practica` y de `metodo_construccion` de la base. */
export function problemasDeFormaDeclarada(datos, artefactos) {
  const malos = [];
  const forma = datos?.forma_practica;
  if (!forma || typeof forma !== "object" || !Object.keys(forma).length) return ["falta forma_practica (un bloque por artefacto, empieza por estandar)"];
  for (const [a, f] of Object.entries(forma)) {
    const d = `forma_practica.${a}`;
    if (!artefactos.includes(a)) malos.push(`${d}: «${a}» no es un artefacto (${artefactos.join(", ")})`);
    const b = f?.bullets;
    if (!Number.isInteger(b?.min) || !Number.isInteger(b?.max) || b.min < 1 || b.max < b.min) malos.push(`${d}.bullets: min y max son enteros, 1 o más y max no menor que min`);
    if (JSON.stringify(f?.estructura) !== JSON.stringify(PARTES_BULLET)) malos.push(`${d}.estructura: es ${PARTES_BULLET.join(" · ")}, en ese orden`);
    if (f?.fuente_por_bullet !== true) malos.push(`${d}.fuente_por_bullet: es true (cada bullet lleva su fuente [F] o [I])`);
    if (!VOCES.includes(f?.voz)) malos.push(`${d}.voz: «${f?.voz}» no está en el vocabulario (${VOCES.join(", ")})`);
    if (!MODOS_TIEMPO.includes(f?.modo_tiempo)) malos.push(`${d}.modo_tiempo: uno solo, ${MODOS_TIEMPO.join(" o ")}, no «${f?.modo_tiempo}»`);
    if (!PERSONAS.includes(f?.persona)) malos.push(`${d}.persona: «${f?.persona}» no está en el vocabulario (${PERSONAS.join(", ")})`);
  }
  const m = datos?.metodo_construccion;
  if (!Number.isInteger(m?.rondas_minimas) || m.rondas_minimas < 1) malos.push("metodo_construccion.rondas_minimas es un entero de 1 o más");
  if (!Number.isInteger(m?.fuentes_minimas_por_ronda) || m.fuentes_minimas_por_ronda < 1) malos.push("metodo_construccion.fuentes_minimas_por_ronda es un entero de 1 o más");
  return malos;
}

// ── Una práctica contra su forma ───────────────────────────────────────────

/** Una expresión con \b que entiende las letras con tilde (el \b de JavaScript no). */
const FRONTERA = String.raw`(?:(?<![\p{L}])(?=[\p{L}])|(?<=[\p{L}])(?![\p{L}]))`;
const ub = (re) => new RegExp(re.source.replace(/\\b/g, () => FRONTERA), "iu");
const PASIVA_SER = ub(/\b(?:es|son|fue|fueron|será|serán|sea|sean|siendo|ha sido|han sido|había sido)\s+[a-záéíóúñ]+(?:ad|id)[oa]s?\b/);
/** Pasiva refleja: solo el verbo que abre la regla (las subordinadas no cuentan), salvo 'se' + {ha, han, pueda, puede, trata, te, me, acabe}. */
const PASIVA_REFLEJA = ub(/^\s*se\s+(?!(?:ha|han|pueda|puede|trata|te|me|acabe)\b)[a-záéíóúñ]+(?:a|an|e|en|ará|arán|erá|erán|irá|irán)\b/);
/** Futuro y pasado de verbo regular. Sin condicional (-ería, -aría, -iría: librería, tubería…) ni -ó suelto. */
const OTRO_TIEMPO = ub(/\b[a-záéíóúñ]+(?:ará|erá|irá|arán|erán|irán|aron|ieron|ió|yó|aba|aban)\b/);
const SUJETO_NOMINAL = ub(/^(?:el|la|los|las|un|una|unos|unas|todo|toda|todos|todas|cada)\b/);
const MODAL_DESCRIPTIVO = ub(/\b(?:debe|deben|debería|deberían|hay que|conviene|es necesario)\b/);
const PERSONA_MALA = {
  segunda: ub(/\b(?:usted(?:es)?|nosotros|nosotras|nuestr[oa]s?|hemos|tenemos|hacemos|debemos|podemos|yo|mi|mis)\b/),
  tercera: ub(/\b(?:tú|tu|tus|usted(?:es)?|nosotros|nosotras|nuestr[oa]s?|yo|mi|mis)\b/),
  impersonal: ub(/\b(?:tú|tu|tus|usted(?:es)?|nosotros|nosotras|nuestr[oa]s?|yo|mi|mis)\b/),
};


function bulletsDe(practica) {
  return Array.isArray(practica?.bullets) ? practica.bullets : null;
}

/**
 * Errores de una práctica contra la forma de su artefacto. Cada uno es `{ criterio, capa, mensaje }`;
 * la capa sale del criterio en la base: el número de bullets, la estructura y la fuente son formales;
 * la voz, el modo, el tiempo y la persona son materiales (heurística sobre el texto de la regla y su porqué).
 * `existe(ruta)` dice si una ruta del repo existe.
 */
export function problemasDePractica(practica, artefacto, datos, existe) {
  const f = datos?.forma_practica?.[artefacto];
  if (!f) return [{ criterio: "practica-numero-de-bullets", capa: capaDe(datos, "practica-numero-de-bullets"), mensaje: `${artefacto}: no tiene forma_practica` }];
  const malos = [];
  const anota = (criterio, mensaje) => malos.push({ criterio, capa: capaDe(datos, criterio), mensaje });
  const bullets = bulletsDe(practica);
  if (!bullets) { anota("practica-numero-de-bullets", "la práctica lleva una lista «bullets»"); return malos; }
  if (bullets.length < f.bullets.min || bullets.length > f.bullets.max) anota("practica-numero-de-bullets", `${bullets.length} bullets; la forma pide de ${f.bullets.min} a ${f.bullets.max}`);
  bullets.forEach((b, i) => {
    const d = `bullet ${i + 1}`;
    for (const k of Object.keys(b ?? {})) if (!f.estructura.includes(k) && k !== "fuente") anota("practica-estructura-del-bullet", `${d}: campo «${k}» no admitido`);
    for (const k of f.estructura) if (!esTexto(b?.[k], MIN_PARTE)) anota("practica-estructura-del-bullet", `${d}: falta «${k}» (${MIN_PARTE} caracteres o más)`);
    if (esTexto(b?.ejemplo_bueno, 1) && b.ejemplo_bueno.trim() === String(b?.ejemplo_malo ?? "").trim()) anota("practica-estructura-del-bullet", `${d}: el ejemplo bueno y el malo son el mismo`);
    const fu = b?.fuente;
    if (typeof fu === "string" && FUENTE_F.test(fu)) { /* externa con url */ } else if (typeof fu === "string" && FUENTE_I.test(fu)) {
      const ruta = fu.match(FUENTE_I)[1];
      if (!existe(ruta)) anota("practica-fuente-por-bullet", `${d}: la fuente de la casa apunta a ${ruta}, que no existe en el repo`);
    } else anota("practica-fuente-por-bullet", `${d}: «fuente» es «[F] https://…» o «[I] ruta/del/repo»`);
    const texto = `${b?.regla ?? ""} ${b?.porque ?? ""}`;
    const regla = String(b?.regla ?? "");
    const pasiva = texto.match(PASIVA_SER) ?? regla.match(PASIVA_REFLEJA);
    if (pasiva) anota("practica-voz-activa", `${d}: voz pasiva («${pasiva[0].trim()}»); la forma pide ${f.voz}`);
    const otro = regla.match(OTRO_TIEMPO);
    if (otro) anota("practica-modo-tiempo-persona", `${d}: «${otro[0]}» no es ${f.modo_tiempo}; un solo modo y tiempo`);
    if (f.modo_tiempo === "imperativo") {
      if (SUJETO_NOMINAL.test(regla.trim())) anota("practica-modo-tiempo-persona", `${d}: la regla empieza por un sujeto («${regla.trim().split(/\s+/)[0]}»), no por un verbo en imperativo`);
      if (MODAL_DESCRIPTIVO.test(regla)) anota("practica-modo-tiempo-persona", `${d}: «${regla.match(MODAL_DESCRIPTIVO)[0]}» describe en vez de mandar; la forma pide imperativo`);
    }
    const mala = texto.match(PERSONA_MALA[f.persona]);
    if (mala) anota("practica-modo-tiempo-persona", `${d}: «${mala[0]}» no es persona ${f.persona}`);
  });
  return malos;
}

function capaDe(datos, id) {
  return (datos?.criterios ?? []).find((c) => c.id === id)?.capa ?? "(criterio sin dar de alta)";
}

// ── El rastro de las rondas de investigación ───────────────────────────────

const RONDA = /^ronda: (\d+) fuentes: (\d+) cambios: (\S.*)$/;

/** Una línea `ronda: n fuentes: k cambios: …`; null si no tiene la forma. */
export function leerRonda(linea) {
  const m = String(linea).match(RONDA);
  return m ? { n: Number(m[1]), fuentes: Number(m[2]), cambios: m[3] } : null;
}
export const lineaDeRonda = ({ n, fuentes, cambios }) => `ronda: ${n} fuentes: ${fuentes} cambios: ${cambios}`;

/** Errores del registro de rondas de un estándar: 3 o más, numeradas 1, 2, 3…, con fuentes mayores que 0. */
export function problemasDeRondas(lineas, datos) {
  const { rondas_minimas: min, fuentes_minimas_por_ronda: fmin } = datos.metodo_construccion;
  if (!Array.isArray(lineas)) return [`sin registro de rondas: pide ${min} o más`];
  const malos = [];
  let buenas = 0;
  lineas.forEach((l, i) => {
    const r = leerRonda(l);
    if (!r) { malos.push(`ronda ${i + 1}: «${l}» no tiene la forma «ronda: n fuentes: k cambios: …»`); return; }
    if (r.n !== i + 1) malos.push(`ronda ${i + 1}: lleva el número ${r.n}; van 1, 2, 3… sin saltos`);
    if (r.fuentes >= fmin) buenas += 1;
    else malos.push(`ronda ${r.n}: ${r.fuentes} fuentes; cada ronda consulta ${fmin} o más`);
  });
  if (buenas < min) malos.push(`${buenas} rondas con fuentes; el método pide ${min} o más (buscar, contrastar, destilar)`);
  return malos;
}

// ── Las listas de excepciones que solo bajan ───────────────────────────────

/**
 * `actual`: clave → cuántas faltas hay hoy; `guardado`: clave → cuántas se toleran.
 * Falla si hay más faltas de las toleradas (una nueva) o si se toleran más de las que hay (la lista no baja sola).
 */
export function problemasDeExcepciones(actual, guardado, que) {
  const malos = [];
  for (const [k, n] of Object.entries(actual)) {
    const t = guardado?.[k] ?? 0;
    if (n > t) malos.push(`${k}: ${n} (${que}); se toleran ${t}. Corrígelo: la lista de excepciones solo baja`);
  }
  for (const [k, t] of Object.entries(guardado ?? {})) {
    const n = actual[k] ?? 0;
    if (!Number.isInteger(t) || t < 1) malos.push(`${k}: la excepción es un entero de 1 o más`);
    else if (n < t) malos.push(`${k}: se toleran ${t} y hay ${n}. Baja la excepción con «npm run forja -- --escribir»`);
  }
  return malos;
}

/** La lista tras mirar el estado de hoy: solo baja o se quita; nunca sube ni añade (salvo la siembra inicial). */
export function bajarExcepciones(actual, guardado, { sembrar = false } = {}) {
  if (sembrar) return { ...actual };
  const r = {};
  for (const [k, t] of Object.entries(guardado ?? {})) {
    const n = Math.min(t, actual[k] ?? 0);
    if (n > 0) r[k] = n;
  }
  return r;
}

/** Contra una referencia de git (origin/staging): ninguna excepción sube ni aparece. */
export function problemasDeExcepcionesContraReferencia(guardado, ref) {
  const malos = [];
  for (const [k, n] of Object.entries(guardado ?? {})) {
    if (!(k in (ref ?? {}))) malos.push(`${k}: excepción nueva respecto a la referencia; la lista solo baja`);
    else if (n > ref[k]) malos.push(`${k}: sube de ${ref[k]} a ${n}; la lista solo baja`);
  }
  return malos;
}

export const sumaExcepciones = (m) => Object.values(m ?? {}).reduce((s, n) => s + n, 0);

/**
 * Las tareas de un estándar que ya tienen texto de estándar (agentes completos) y no cumplen el método de
 * rondas: mapa `estandar:agente/tarea` → 1. Es lo que va a la lista de excepciones, que solo baja.
 */
export function faltasDeRondas(estandares, datos) {
  const r = {};
  for (const [agente, ag] of Object.entries(estandares.agentes ?? {})) {
    for (const t of ag.tareas ?? []) {
      if (!t.estandar) continue;
      if (problemasDeRondas(t.rondas, datos).length) r[`estandar:${agente}/${t.id}`] = 1;
    }
  }
  return r;
}
