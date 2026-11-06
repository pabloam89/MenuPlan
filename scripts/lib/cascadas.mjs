/**
 * Cascadas (trozo 36 de #1037): toda tabla que guarda algo de una casa, de un usuario o de una persona se va, o se
 * suelta, cuando se borra esa casa, ese usuario o esa persona.
 *
 * El borrado de cuenta depende de las cascadas de las FK y ya falló una vez en producción (specs/auth.md, 15 ago
 * 2026): una tabla con `household_id`, `user_id` o `persona_id` sin FK, o con una FK que no dice qué hacer, deja
 * restos o hace fallar el borrado. En el estado final de las migraciones, cada una de esas columnas tiene que tener
 * una FK con `on delete cascade` o `on delete set null`, o estar en ANONIMIZADAS con su porqué (lo que se guarda a
 * propósito, sin dueño, tras el borrado).
 *
 * La lectura de columnas y FK es la de scripts/lib/migraciones.mjs (esquemaFinal). Quién lo usa: la barrera
 * supabase/cascadas.test.js y la cifra `tablas_sin_cascada` (scripts/lib/cifrasModelo.js).
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ACCION_BORRADO, esquemaFinal } from "./migraciones.mjs";

export const DIR_MIGRACIONES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations");

/** Las columnas que dicen de quién es una fila. */
export const COLUMNAS_DUENO = ["household_id", "user_id", "persona_id"];

/** Lo que basta: la fila se va con su dueño o se queda sin él. */
export const BORRADOS_VALIDOS = [ACCION_BORRADO.CASCADE, ACCION_BORRADO.SET_NULL];

/**
 * Columnas de dueño que se quedan sin regla de borrado a propósito, con su porqué. `tabla.columna`.
 * Vacía el 3 nov 2026: en la base, las 61 columnas de dueño tienen FK con cascade o set null.
 */
export const ANONIMIZADAS = new Map([]);

/** Cuántas columnas de dueño hay en un estado (Map tabla → { columnas }). */
export const columnasDeDueno = (estado) => [...estado.values()].reduce((n, t) => n + COLUMNAS_DUENO.filter((c) => t.columnas.has(c)).length, 0);

/** Las columnas de dueño sin una FK que diga qué hacer al borrar: ["tabla.columna (lo que tiene)"]. */
export function sinRegla(estado, anonimizadas = ANONIMIZADAS) {
  const malas = [];
  for (const [tabla, t] of [...estado].sort(([a], [b]) => a.localeCompare(b))) {
    for (const col of COLUMNAS_DUENO) {
      if (!t.columnas.has(col) || anonimizadas.has(`${tabla}.${col}`)) continue;
      const fks = [...t.fks.values()].filter((fk) => fk.columnas.includes(col));
      if (fks.some((fk) => BORRADOS_VALIDOS.includes(fk.onDelete))) continue;
      malas.push(`${tabla}.${col} (${fks.length ? fks.map((fk) => `${fk.destino} on delete ${fk.onDelete}`).join(", ") : "sin FK"})`);
    }
  }
  return malas;
}

/** La cifra `tablas_sin_cascada`: las columnas de dueño sin regla, de todas las que hay. */
export function medirCascadas(dir = DIR_MIGRACIONES) {
  const estado = esquemaFinal(dir);
  return { valor: sinRegla(estado).length, de: columnasDeDueno(estado) };
}
