/**
 * Topes en caracteres y wording por tipo de texto (#689, programa #652, acuerdo del 13 oct 2026).
 *
 * Dos cosas en un solo dato, `ops/topes.json`:
 *  1. Un TOPE en CARACTERES por campo de texto de cada entidad (`norma.exigencia`, `principio.porque`…). Sale de
 *     MEDIR el máximo de hoy (`npm run topes`), nunca de inventarlo: el tope solo baja (como los techos de
 *     `ops/normas-techos.json`), y se compara con origin/staging.
 *  2. El TIPO DE TEXTO de cada campo (vocabulario cerrado `tipos_de_texto`; los cinco primeros son las filas de la tabla
 *     de redacción de `ops/forja/base/redaccion.json`, BASE-FORJA §3.2). Un solo control aplica a cada campo la regla de
 *     su tipo (voz, modo y tiempo, persona; para un principio, además, sin palabras de fuerza y de pocas palabras). Lo
 *     que hoy ya la incumple va a `excepciones_wording`, un recuento por campo y código que solo baja.
 *
 * El texto existente no se arregla aquí: solo se cuenta. Este módulo es el único lector; lo vigila ops/topes.test.js.
 * Repo público (#300): dice QUÉ se pide, nunca cómo se salta un control.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MODAL_DESCRIPTIVO, OTRO_TIEMPO, PASIVA_REFLEJA, PASIVA_SER, PERSONA_MALA, SUJETO_NOMINAL } from "./forjaForma.mjs";
import { leerEstandares } from "./estandaresAgentes.mjs";
import { activos, leerGlosario } from "./glosario.mjs";
import { leerForja } from "./forja.mjs";
import { leerRegistro } from "./normas.mjs";
import { leerPool } from "./pool.mjs";
import { PALABRAS_DE_FUERZA } from "./regla.mjs";
import { leerPrincipiosCasa } from "./principios.mjs";
import { nombresDeSkills, parsearSkill } from "./skills.mjs";

export const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RUTA_TOPES = "ops/topes.json";
const RUTA_REDACCION = "ops/forja/base/redaccion.json";

/** Los códigos de un fallo de wording (vocabulario cerrado, para contarlos). */
export const CODIGOS_WORDING = {
  "voz-pasiva": "El texto está en voz pasiva y la tabla de redacción pide voz activa",
  "modo-tiempo": "El texto no está en el modo y tiempo de su tipo: futuro o pasado, un sujeto nominal o un modal que describe en vez de mandar",
  persona: "El texto usa una persona que no es la de su tipo",
  "fuerza-en-principio": "Un principio lleva una palabra de fuerza: la obligación es de la norma",
  "frase-larga": "El texto pasa del máximo de palabras que declara su campo",
};

const palabras = (t) => String(t).trim().split(/\s+/).filter(Boolean).length;
const sinVacios = (l) => l.filter((x) => typeof x === "string" && x.trim());
const json = (raiz, ruta) => JSON.parse(readFileSync(join(raiz, ruta), "utf8"));

/** Las tareas, las comunes y las reglas por campos de los estándares. */
function deEstandares(raiz) {
  const e = leerEstandares(raiz);
  const tareas = Object.values(e.agentes ?? {}).flatMap((a) => a.tareas ?? []);
  const comunes = Object.values(e.comunes ?? {});
  return { tareas, comunes, reglas: [...tareas, ...comunes].flatMap((t) => t.reglas ?? []) };
}

/**
 * Los campos medidos: id → cómo se leen sus textos. El tipo de texto y el tope NO están aquí sino en `ops/topes.json`
 * (el dato); aquí solo cómo se leen del repo. Un campo nuevo se añade aquí y se siembra con `npm run topes -- --escribir`.
 */
export const LECTORES = {
  "norma.exigencia": (r) => sinVacios(leerRegistro(r).normas.map((n) => n.exigencia)),
  "norma.nota": (r) => sinVacios(leerRegistro(r).normas.map((n) => n.nota)),
  "principio.enunciado": (r) => sinVacios(leerPrincipiosCasa(r).principios.map((p) => p.enunciado)),
  "principio.porque": (r) => sinVacios(leerPrincipiosCasa(r).principios.map((p) => p.porque)),
  "practica.practica": (r) => sinVacios(Object.values(leerPool(r).agentes).flatMap((a) => (a.practicas ?? []).map((p) => p.practica))),
  "skill.description": (r) => sinVacios(nombresDeSkills(r).map((n) => parsearSkill(readFileSync(join(r, ".claude/skills", n, "SKILL.md"), "utf8")).meta?.description)),
  "tarea.tarea": (r) => { const { tareas, comunes } = deEstandares(r); return sinVacios([...tareas, ...comunes].map((t) => t.tarea)); },
  "regla.exigencia": (r) => sinVacios(deEstandares(r).reglas.map((x) => x.exigencia)),
  "regla.nota": (r) => sinVacios(deEstandares(r).reglas.map((x) => x.nota)),
  "regla.porque": (r) => sinVacios(deEstandares(r).reglas.map((x) => x.porque)),
  "criterio.exigencia": (r) => sinVacios(leerForja(r).criterios.map((c) => c.exigencia)),
  "termino.definicion": (r) => sinVacios(activos(leerGlosario(r)).map((t) => t.definicion)),
  "documento.claude_md": (r) => (existsSync(join(r, "CLAUDE.md")) ? [readFileSync(join(r, "CLAUDE.md"), "utf8")] : []),
};

export function leerTopes(raiz = RAIZ_REPO) {
  return json(raiz, RUTA_TOPES);
}

/** Los tipos de texto de la tabla de redacción de la base (BASE-FORJA §3.2). */
export const tiposDeLaBase = (raiz = RAIZ_REPO) => Object.keys(json(raiz, RUTA_REDACCION).valor);

/** Mínimo, mediana, p95 y máximo de una lista de textos, en caracteres. */
export function estadisticas(textos) {
  const l = textos.map((t) => [...t].length).sort((a, b) => a - b);
  if (!l.length) return { n: 0, min: 0, mediana: 0, p95: 0, max: 0 };
  const en = (p) => l[Math.min(l.length - 1, Math.ceil(p * l.length) - 1)];
  const mediana = l.length % 2 ? l[(l.length - 1) / 2] : Math.round((l[l.length / 2 - 1] + l[l.length / 2]) / 2);
  return { n: l.length, min: l[0], mediana, p95: en(0.95), max: l[l.length - 1] };
}

/** Lo medido hoy: campo → { n, min, mediana, p95, max }. */
export function medir(raiz = RAIZ_REPO, lectores = LECTORES) {
  return Object.fromEntries(Object.entries(lectores).map(([c, leer]) => [c, estadisticas(leer(raiz))]));
}

// ── El wording de un texto contra la regla de su tipo ──────────────────────

/** Los códigos de wording que incumple un texto. `regla` es la fila de su tipo en la base (voz, modo_tiempo, persona). */
export function codigosDeWording(texto, regla, { palabras_max: max, tipo } = {}) {
  const t = String(texto);
  const malos = new Set();
  if (PASIVA_SER.test(t) || PASIVA_REFLEJA.test(t)) malos.add("voz-pasiva");
  if (OTRO_TIEMPO.test(t)) malos.add("modo-tiempo");
  if (regla.modo_tiempo === "imperativo" && (SUJETO_NOMINAL.test(t.trim()) || MODAL_DESCRIPTIVO.test(t))) malos.add("modo-tiempo");
  if (PERSONA_MALA[regla.persona?.[0]]?.test(t)) malos.add("persona");
  if (tipo === "principio" && PALABRAS_DE_FUERZA.test(t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase())) malos.add("fuerza-en-principio");
  if (max && palabras(t) > max) malos.add("frase-larga");
  return [...malos];
}

/** Recuento de hoy de faltas de wording: `campo:código` → n. Solo para los campos cuyo tipo tiene regla en la base. */
export function faltasDeWording(raiz, topes, lectores = LECTORES) {
  const base = json(raiz, RUTA_REDACCION).valor;
  const cuenta = {};
  for (const [campo, def] of Object.entries(topes.campos)) {
    const regla = base[def.tipo_texto];
    if (!regla || !lectores[campo]) continue;
    for (const texto of lectores[campo](raiz)) {
      for (const c of codigosDeWording(texto, regla, { palabras_max: def.palabras_max, tipo: def.tipo_texto })) cuenta[`${campo}:${c}`] = (cuenta[`${campo}:${c}`] ?? 0) + 1;
    }
  }
  return cuenta;
}

// ── Los problemas del dato ─────────────────────────────────────────────────

/** Errores de forma de `ops/topes.json` contra los lectores y la tabla de redacción de la base. */
export function problemasDeTopes(topes, { lectores = LECTORES, tiposBase = [] } = {}) {
  const malos = [];
  const tipos = Object.keys(topes.tipos_de_texto ?? {});
  for (const t of tiposBase) if (!tipos.includes(t)) malos.push(`tipos_de_texto: falta «${t}», una fila de la tabla de redacción de la base`);
  for (const [t, que] of Object.entries(topes.tipos_de_texto ?? {})) if (typeof que !== "string" || que.length < 20) malos.push(`tipos_de_texto.${t}: dice qué es en una frase`);
  for (const c of Object.keys(lectores)) if (!topes.campos?.[c]) malos.push(`${c}: se mide y no tiene tope ni tipo de texto en ${RUTA_TOPES}`);
  for (const [c, d] of Object.entries(topes.campos ?? {})) {
    if (!lectores[c]) malos.push(`${c}: tiene tope y nadie lo mide (quítalo o añade su lector en scripts/lib/topes.mjs)`);
    if (!tipos.includes(d.tipo_texto)) malos.push(`${c}: tipo_texto «${d.tipo_texto}» no está en tipos_de_texto (${tipos.join(", ")})`);
    if (!Number.isInteger(d.tope) || d.tope < 1) malos.push(`${c}: tope es un entero de caracteres, 1 o más`);
    if (d.palabras_max !== undefined && (!Number.isInteger(d.palabras_max) || d.palabras_max < 1)) malos.push(`${c}: palabras_max es un entero, 1 o más`);
  }
  for (const [k, n] of Object.entries(topes.excepciones_wording ?? {})) {
    const [campo, codigo] = k.split(":");
    if (!topes.campos?.[campo]) malos.push(`excepciones_wording.${k}: el campo «${campo}» no existe`);
    if (!CODIGOS_WORDING[codigo]) malos.push(`excepciones_wording.${k}: «${codigo}» no es un código (${Object.keys(CODIGOS_WORDING).join(", ")})`);
    if (!Number.isInteger(n) || n < 1) malos.push(`excepciones_wording.${k}: la excepción es un entero de 1 o más`);
  }
  return malos;
}

/** El tope de cada campo frente al máximo de hoy: pasarse es un error; tener holgura, también (el tope solo baja y se ajusta). */
export function problemasDeMedida(topes, medido) {
  const malos = [];
  for (const [c, d] of Object.entries(topes.campos ?? {})) {
    const m = medido[c];
    if (!m) continue;
    if (m.max > d.tope) malos.push(`${c}: el máximo de hoy es ${m.max} caracteres y el tope es ${d.tope}. Acorta el texto: el tope no sube`);
    else if (m.max < d.tope) malos.push(`${c}: el máximo de hoy es ${m.max} y el tope sigue en ${d.tope}. Bájalo con «npm run topes -- --escribir»`);
  }
  return malos;
}

/** El wording de hoy frente a las excepciones: una falta nueva o una excepción que ya sobra son errores. */
export function problemasDeWording(faltas, excepciones) {
  const malos = [];
  for (const [k, n] of Object.entries(faltas)) {
    const t = excepciones?.[k] ?? 0;
    if (n > t) malos.push(`${k}: ${n} textos incumplen la regla de su tipo y se toleran ${t}. Corrígelo: la lista de excepciones solo baja`);
  }
  for (const [k, t] of Object.entries(excepciones ?? {})) {
    const n = faltas[k] ?? 0;
    if (n < t) malos.push(`${k}: se toleran ${t} y hay ${n}. Bájalo con «npm run topes -- --escribir»`);
  }
  return malos;
}

/** Contra una referencia (origin/staging): ningún tope ni excepción sube, y ningún campo deja de medirse. */
export function problemasContraReferencia(topes, ref) {
  const malos = [];
  for (const [c, d] of Object.entries(ref?.campos ?? {})) {
    const hoy = topes.campos?.[c];
    if (!hoy) { malos.push(`${c}: tenía tope en la referencia y ha desaparecido; un campo no deja de medirse`); continue; }
    if (hoy.tope > d.tope) malos.push(`${c}: el tope sube de ${d.tope} a ${hoy.tope}; solo baja`);
    if (hoy.tipo_texto !== d.tipo_texto) malos.push(`${c}: el tipo_texto cambia de ${d.tipo_texto} a ${hoy.tipo_texto}; cambiarlo deja de vigilar su wording`);
    if (d.palabras_max !== undefined && !(hoy.palabras_max <= d.palabras_max)) malos.push(`${c}: palabras_max sube de ${d.palabras_max} a ${hoy.palabras_max ?? "ninguno"}; solo baja`);
  }
  for (const [k, n] of Object.entries(topes.excepciones_wording ?? {})) {
    const antes = ref?.excepciones_wording?.[k];
    if (antes === undefined) malos.push(`${k}: excepción nueva respecto a la referencia; la lista solo baja`);
    else if (n > antes) malos.push(`${k}: la excepción sube de ${antes} a ${n}; solo baja`);
  }
  return malos;
}

/** Lo que baja `--escribir`: los topes al máximo de hoy y las excepciones que sobran. Un campo nuevo se siembra con su máximo. */
export function ajustar(topes, medido, faltas, { sembrar = false } = {}) {
  const campos = {};
  for (const [c, m] of Object.entries(medido)) {
    const ant = topes.campos?.[c];
    campos[c] = ant ? { ...ant, tope: Math.min(ant.tope, m.max) } : { tipo_texto: "documento", tope: m.max };
  }
  const excepciones = {};
  if (sembrar) Object.assign(excepciones, faltas);
  else for (const [k, t] of Object.entries(topes.excepciones_wording ?? {})) { const n = Math.min(t, faltas[k] ?? 0); if (n > 0) excepciones[k] = n; }
  return { ...topes, campos, excepciones_wording: excepciones };
}
