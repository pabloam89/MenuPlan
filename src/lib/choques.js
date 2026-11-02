/**
 * El método de choques (trozo 33 de #1037): clasificar, ordenar y responder. Lo define
 * specs/arquitectura-objetivo.md, «Choques» (su única fuente); aquí vive como constantes con su test.
 *
 *   clasificar  claseDe: de qué clase es una preferencia (CLASES_CHOQUE), por su origen y si toca la salud.
 *   ordenar     rangoDeClase: el criterio «clase», del que más manda al que menos. Con él relaja el solver
 *               (preferenciasSistema.js, ESCALONES_RELAJAR).
 *
 * Pura y sin dependencias del motor: la cargará Lola.
 */
import { CLASES_CHOQUE, CLASE_CHOQUE as CL, ORIGEN_DATO, FUERZAS_PREFERENCIA } from "./vocabularios.js";

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

// Las clases de origen cubren todo ORIGEN_DATO (principio 3: comprobado al cargar).
for (const o of ORIGEN_DATO) if (!CLASE_DE_ORIGEN[o]) throw new Error(`choque: el origen ${o} sin clase`);
