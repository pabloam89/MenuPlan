/**
 * El registro de normas (#296, fondo #185).
 *
 * Una norma es algo que el repo dice que «se cumple siempre». `ops/normas.json`
 * apunta cada una con quién la hace cumplir y cómo de dura es de verdad, en un
 * vocabulario cerrado para poder contarlas. `ops/normas.test.js` falla cuando
 * una norma que se dice dura no lo es.
 *
 * El repo es público (#300): el registro dice QUÉ norma es, QUIÉN la hace
 * cumplir y su VEREDICTO. Nunca cómo se salta ni qué le falta exactamente;
 * eso va a Pablo en privado.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Quién hace cumplir la norma. Los cinco primeros son «del sistema»: no dependen de que alguien se acuerde. */
export const EJECUTORES = {
  github_regla: "Un ajuste de GitHub (protección de rama, ruleset, environment, seguridad del repo)",
  ci: "Un paso del CI que falla el check obligatorio",
  base_datos: "La propia base: un rol, un CHECK, una RLS, un permiso",
  codigo_en_ejecucion: "El código desplegado lo comprueba en cada petición",
  proveedor: "Un servicio de fuera (GitHub, Vercel, Supabase, Anthropic) lo impone",
  guardia: "Un hook de Claude Code (guardia, pendientes, arranque): solo ve a las sesiones de Claude",
  clasificador: "El clasificador del modo auto de Claude Code",
  script_propio: "Un script del repo, solo si se usa ese script",
  persona: "Alguien que se acuerda (Pablo, Álvaro, un agente juez)",
  nada: "Nada: solo está escrita",
};

/** Los ejecutores que no dependen de que una sesión o una persona coopere. */
export const EJECUTORES_DEL_SISTEMA = ["github_regla", "ci", "base_datos", "codigo_en_ejecucion", "proveedor"];

/** A quién alcanza el ejecutor. */
export const ALCANCES = {
  todos: "A cualquiera: Pablo, Álvaro, una sesión, un workflow o la terminal",
  solo_claude: "Solo a las sesiones de Claude Code",
  solo_script: "Solo a quien usa el script del repo",
  nadie: "No alcanza a nadie: no hay ejecutor",
};

/** Qué pasa si el ejecutor falla (se cae, no puede leer, se pasa de tiempo). */
export const ANTE_FALLO = {
  cerrado: "Si el ejecutor falla, no deja pasar",
  abierto: "Si el ejecutor falla, deja pasar",
  no_aplica: "No hay ejecutor que pueda fallar",
};

/** Cómo de dura es la norma hoy. */
export const VEREDICTOS = {
  dura: "Ejecutor del sistema, para todos, falla cerrado y con un test que lo vigila",
  semidura: "Tiene ejecutor, pero no alcanza a todos, falla abierto o no hay test",
  blanda: "Solo texto o una persona que se acuerda",
  rota: "Se dice que hay ejecutor y hoy no funciona",
};

/** Cuánto duele que se incumpla. */
export const RIESGOS = {
  alto: "Dinero, producción, datos de familias o permisos",
  medio: "Rompe trabajo o deja un hueco que se nota tarde",
  bajo: "Molesta, se ve enseguida y se arregla",
};

/** Campos de cada norma. `nota` es opcional y neutra: nunca cómo se salta. */
export const CAMPOS = ["id", "texto", "donde", "ejecutor", "alcance", "ante_fallo", "test", "veredicto", "riesgo", "issue"];
export const CAMPOS_OPCIONALES = ["nota", "test_fallo"];

export const RUTA_REGISTRO = "ops/normas.json";

/** Lee el registro. */
export function leerRegistro(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_REGISTRO), "utf8"));
}

/** `test` puede ser una ruta o una comprobación de la medición semanal de planos: `planos:<regla>[:<rama>]`. */
export function esReferenciaPlanos(test) {
  return typeof test === "string" && test.startsWith("planos:");
}

/** ¿Hay en ops/planos.json un criterio `regla_github` como el que cita `planos:<regla>[:<rama>]`? */
export function existeEnPlanos(test, planos) {
  const [, regla, rama] = test.split(":");
  return planos.planos.some((p) => Object.values(p.niveles).flat()
    .some((c) => c.tipo === "regla_github" && c.regla === regla && (rama === undefined || c.rama === rama)));
}

/** Errores de forma de una norma: campos, vocabulario y tipos. Lista vacía si está bien. */
export function problemasDeForma(n) {
  const malos = [];
  const id = n?.id ?? "(sin id)";
  for (const c of CAMPOS) if (!(c in n)) malos.push(`${id}: falta «${c}»`);
  for (const c of Object.keys(n)) if (!CAMPOS.includes(c) && !CAMPOS_OPCIONALES.includes(c)) malos.push(`${id}: campo desconocido «${c}»`);
  if (typeof n.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n.id)) malos.push(`${id}: el id va en minúsculas con guiones`);
  if (typeof n.texto !== "string" || !n.texto.trim()) malos.push(`${id}: sin texto`);
  if (!Array.isArray(n.donde) || !n.donde.length) malos.push(`${id}: «donde» es una lista de rutas`);
  const vocab = [["ejecutor", EJECUTORES], ["alcance", ALCANCES], ["ante_fallo", ANTE_FALLO], ["veredicto", VEREDICTOS], ["riesgo", RIESGOS]];
  for (const [campo, v] of vocab) if (!(n[campo] in v)) malos.push(`${id}: ${campo} «${n[campo]}» no está en el vocabulario`);
  if (n.test !== null && typeof n.test !== "string") malos.push(`${id}: «test» es una ruta, «planos:…» o null`);
  if (n.issue !== null && !Number.isInteger(n.issue)) malos.push(`${id}: «issue» es un número o null`);
  if (n.test_fallo !== undefined && (typeof n.test_fallo?.ruta !== "string" || typeof n.test_fallo?.caso !== "string")) {
    malos.push(`${id}: «test_fallo» lleva ruta y caso`);
  }
  return malos;
}

/** Recuento por veredicto y por riesgo: las cifras de partida. */
export function recuento(normas) {
  const por = (campo, vocab) => Object.fromEntries(Object.keys(vocab).map((k) => [k, normas.filter((n) => n[campo] === k).length]));
  return { total: normas.length, veredicto: por("veredicto", VEREDICTOS), riesgo: por("riesgo", RIESGOS) };
}
