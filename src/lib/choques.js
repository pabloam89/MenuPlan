/**
 * El método de choques (trozo 33 de #1037): clasificar, ordenar y responder. Lo define
 * specs/arquitectura-objetivo.md, «Choques» (su única fuente); aquí vive como constantes con su test.
 *
 *   clasificar  claseDe: de qué clase es una preferencia (CLASES_CHOQUE), por su origen y si toca la salud.
 *   ordenar     ordenar: gana el primero de los siete criterios (CRITERIOS_CHOQUE) que distingue a los dos lados;
 *               rangoDeClase es el criterio «clase», con el que relaja el solver (preferenciasSistema.js).
 *   responder   responder: aplicar en silencio, aplicar y avisar, preguntar o tarea de decisión (RESPUESTAS_CHOQUE).
 *               Lo usa la puerta al guardar (operaciones/puerta.js); textoDeChoque la dice en el chat (Lola).
 *
 * Un lado de un choque: { clase, fuerza?, papel?, habla_de_si?, autor?, sujeto?, cuando?, vigente?, at?, peso? }.
 * Pura y sin dependencias del motor: la carga Lola.
 */
import {
  CLASES_CHOQUE, CLASE_CHOQUE as CL, CRITERIOS_CHOQUE, CRITERIO_CHOQUE as CR, RESPUESTA_CHOQUE as R, ORIGEN_DATO, FUERZAS_PREFERENCIA,
  OPERADOR_PREFERENCIA as OP,
} from "./vocabularios.js";
import { puede } from "./papeles.js";

/** La fuerza que no se rompe (la primera de FUERZAS_PREFERENCIA). */
const OBLIGATORIA = FUERZAS_PREFERENCIA[0];

/**
 * La clase de una preferencia según su origen (ORIGEN_DATO): lo que dice la familia es un deseo; lo visto, aprendido;
 * lo supuesto y el defecto, supuesto; lo derivado, una regla del producto (preferenciasSistema.js).
 */
export const CLASE_DE_ORIGEN = Object.freeze({
  dicho: CL.DESEO, delegado: CL.DESEO, no_quiere_decirlo: CL.DESEO,
  visto: CL.APRENDIDO, supuesto: CL.SUPUESTO, por_defecto: CL.SUPUESTO, derivado: CL.SISTEMA,
});

/** Pura. La clase de una preferencia: la salud (`seguridad` en el registro) antes que nada; si no, la de su origen. Lanza si no la hay. */
export function claseDe({ origen, seguridad = false }) {
  if (seguridad) return CL.SEGURIDAD;
  const clase = CLASE_DE_ORIGEN[origen];
  if (!clase) throw new Error(`choque: sin clase para el origen ${origen}`);
  return clase;
}

/**
 * El rango de una clase en el criterio «clase» (más alto, manda más). Una regla del sistema obligatoria es calidad
 * mínima: no cede ante un deseo dicho (la tabla de clases), así que va justo encima del deseo, debajo del hecho.
 */
export function rangoDeClase({ clase, fuerza }) {
  const i = CLASES_CHOQUE.indexOf(clase);
  if (i < 0) throw new Error(`choque: clase ${clase} fuera de CLASES_CHOQUE`);
  if (clase === CL.SISTEMA && fuerza === OBLIGATORIA) return CLASES_CHOQUE.length - CLASES_CHOQUE.indexOf(CL.DESEO) + 0.5;
  return CLASES_CHOQUE.length - i;
}

/** Quién está detrás, del que más decide al que menos: un adulto que edita la casa, otro papel (lector), sin papel. */
const rangoDePapel = (papel) => (papel == null ? 0 : puede(papel, "editar_casa") ? 2 : 1);
/** Lo más concreto gana: de quién (persona > grupo > casa) y para cuándo (un día > la semana > siempre). */
export const SUJETOS = Object.freeze(["casa", "grupo", "persona"]);
export const CUANDOS = Object.freeze(["siempre", "semana", "dia"]);
/** Pura. El alcance de una preferencia (una fila de `preferencia`): de quién (SUJETOS) y para cuándo (CUANDOS). */
export const alcanceDe = (p) => ({ sujeto: SUJETOS[p.persona_id ? 2 : p.grupo_id ? 1 : 0], cuando: CUANDOS[p.dias ? 2 : p.semanas ? 1 : 0] });

/** Cómo distingue cada criterio a un lado: un número, más alto gana; null si el criterio no mira ese lado. */
const MEDIDA = Object.freeze({
  [CR.RIESGO]: (x) => (x.clase === CL.SEGURIDAD ? 1 : 0),
  [CR.CLASE]: (x) => rangoDeClase(x),
  [CR.FUERZA]: (x) => (x.fuerza ? FUERZAS_PREFERENCIA.length - FUERZAS_PREFERENCIA.indexOf(x.fuerza) : null),
  // El papel, y a igual papel quien habla de sí mismo (un adulto sobre sí; un adulto sobre un niño no se distingue aquí).
  [CR.AUTORIDAD]: (x) => (x.papel === undefined ? null : rangoDePapel(x.papel) * 2 + (x.habla_de_si ? 1 : 0)),
  [CR.ALCANCE]: (x) => (x.sujeto || x.cuando ? SUJETOS.indexOf(x.sujeto ?? "casa") * CUANDOS.length + CUANDOS.indexOf(x.cuando ?? "siempre") : null),
  // Lo vigente antes que lo caducado; a igualdad, lo más reciente.
  [CR.TIEMPO]: (x) => (x.vigente === undefined && !x.at ? null : (x.vigente === false ? 0 : 1) * 1e13 + (x.at ? Date.parse(x.at) : 0)),
  [CR.PESO_APRENDIDO]: (x) => (x.clase === CL.APRENDIDO && Number.isFinite(x.peso) ? x.peso : null),
});
for (const c of CRITERIOS_CHOQUE) if (!MEDIDA[c]) throw new Error(`choque: el criterio ${c} no tiene medida`);

/**
 * Pura. Quién gana un choque entre `a` y `b`: el primero de CRITERIOS_CHOQUE que los distingue. Un criterio que
 * no mira a los dos lados (falta su dato en uno) no distingue. `gana` es null si ninguno los distingue (empate).
 * @returns {{ gana: "a"|"b"|null, criterio: string|null }}
 */
export function ordenar(a, b) {
  for (const criterio of CRITERIOS_CHOQUE) {
    // Lo más reciente gana entre lo que dijo una misma persona; entre dos personas no: sería pisar a la otra por llegar
    // tarde. Ahí el orden no decide (empate de autoridad entre dos adultos).
    if (criterio === CR.TIEMPO && a.autor && b.autor && a.autor !== b.autor) continue;
    const x = MEDIDA[criterio](a);
    const y = MEDIDA[criterio](b);
    if (x == null || y == null || x === y || Number.isNaN(x) || Number.isNaN(y)) continue;
    return { gana: x > y ? "a" : "b", criterio };
  }
  return { gana: null, criterio: null };
}

/**
 * Pura. La respuesta a un choque ya ordenado (specs/arquitectura-objetivo.md, «3. Responder»): preguntar si toca la
 * seguridad o una obligatoria o el orden no decide (tarea de decisión si es de la casa y no de quien escribe); en
 * silencio si gana por alcance o frente a lo caducado; si no, aplicar y avisar. Lo irreversible, lo que se repite y el
 * Trato de la cuenta los traen sus trozos (34 y 16). `orden`, lo que da ordenar(a, b).
 */
export function responder({ a, b }, orden, { de_la_casa = false } = {}) {
  const serio = [a, b].some((x) => x.clase === CL.SEGURIDAD || x.fuerza === OBLIGATORIA);
  if (serio || orden.gana == null) return de_la_casa ? R.TAREA_DE_DECISION : R.PREGUNTAR;
  const pierde = orden.gana === "a" ? b : a;
  if (orden.criterio === CR.ALCANCE || (orden.criterio === CR.TIEMPO && pierde.vigente === false)) return R.APLICAR_EN_SILENCIO;
  return R.APLICAR_Y_AVISAR;
}

/**
 * Pura. Un choque entero, listo para apuntar en la operación (operacion.choques) y contar: las dos clases, quién
 * ganó y por qué criterio, y la respuesta. `que` dice qué chocó (ids), sin valores: puede tocar la salud.
 */
export function resolverChoque(a, b, como = {}, que = {}) {
  const orden = ordenar(a, b);
  return Object.freeze({ ...que, clases: [a.clase, b.clase], gana: orden.gana, criterio: orden.criterio, respuesta: responder({ a, b }, orden, como) });
}

/** Cómo se dice el operador de una preferencia en una línea. */
const COMO_SE_DICE = Object.freeze({ [OP.MAS]: "más", [OP.MENOS]: "menos", [OP.ES]: "", [OP.NO_ES]: "nada de", [OP.AL_MENOS]: "al menos", [OP.COMO_MUCHO]: "como mucho" });
const CON_CANTIDAD = Object.freeze([OP.AL_MENOS, OP.COMO_MUCHO]);

/** Pura. Una preferencia (una fila) en palabras: «más horno», «como mucho 2 pescado». */
export const textoDePreferencia = (p) =>
  [COMO_SE_DICE[p.operador] ?? p.operador, CON_CANTIDAD.includes(p.operador) ? p.cantidad ?? "" : "", typeof p.valor === "string" ? p.valor : JSON.stringify(p.valor ?? "")].filter((x) => x !== "").join(" ");

/**
 * Pura. Lo que Lola dice en el chat de un choque al guardar (la respuesta, en una línea), o null si va en silencio.
 * `fila` es la preferencia nueva que chocó.
 */
export function textoDeChoque(choque, fila) {
  const que = `«${textoDePreferencia(fila)}»`;
  switch (choque.respuesta) {
    case R.APLICAR_EN_SILENCIO: return null;
    case R.APLICAR_Y_AVISAR: return choque.gana === "a" ? `He apuntado ${que}, que cambia lo que había apuntado antes` : `No he apuntado ${que}: choca con algo que ya estaba dicho y que manda`;
    case R.PREGUNTAR: return `No he apuntado ${que}: choca con algo importante que ya estaba apuntado; pregunta si lo cambio`;
    case R.TAREA_DE_DECISION: return `No he apuntado ${que}: otra persona de la casa dijo lo contrario; pregunta quién decide y no lo cambies sin su respuesta`;
    default: throw new Error(`choque: respuesta ${choque.respuesta} sin texto`);
  }
}

// Las clases de origen cubren todo ORIGEN_DATO (principio 3: comprobado al cargar).
for (const o of ORIGEN_DATO) if (!CLASE_DE_ORIGEN[o]) throw new Error(`choque: el origen ${o} sin clase`);
