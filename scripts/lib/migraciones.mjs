/**
 * migraciones.mjs — lo que las herramientas necesitan saber de un `drop table`.
 *
 * Hasta el borrado del catálogo en SQL (#302, #303) el repo nunca había tenido
 * un `drop table`, y varias herramientas recorren las migraciones suponiendo
 * que toda tabla creada sigue existiendo. Aquí vive, en un solo sitio, la
 * lectura de «qué le pasa a las tablas en este SQL», para que cableado y los
 * tests que recorren las migraciones no copien la regex: la lectura es
 * `eventosTabla()` de verificar-estado (que ya sabe partir en sentencias sin
 * comentarios ni cadenas) y esto solo la aplica.
 *
 * Qué cuenta, sentencia a sentencia y en orden: `create table`, `drop table
 * [if exists] a [, b] [cascade]`, `drop view` (también `materialized view`),
 * `alter table … rename to` y `alter table … set schema` (la de antes deja de
 * existir como en un drop). Con mayúsculas, esquema opcional y comillas.
 *
 * Límites, a propósito: lo que va dentro de un cuerpo `$$ … $$` (una función o
 * un `do $$`) no se ve, ni `alter view … rename`. Lo vigila el test «un drop
 * dentro de $$» de migraciones.test.js, que falla si una migración real trae
 * un `drop table` que esto no lee.
 */
import { eventosTabla, sentencias } from "../verificar-estado.mjs";

export { eventosTabla, sentencias };

/**
 * Las tablas y vistas que borra un SQL, en orden:
 * [{ tipo: "tabla"|"vista", esquema, nombre }].
 */
export function borrados(sql) {
  return eventosTabla(sql)
    .filter((e) => e.accion === "borra")
    .map(({ tipo, esquema, nombre }) => ({ tipo, esquema, nombre }));
}

/**
 * Aplica a `vivas` (Set de nombres de tabla del esquema `public`) lo que hace
 * este SQL, EN ORDEN: `drop table x; create table x (…)` deja x viva y
 * `create table x (…); drop table x` no. Las de otro esquema no se tocan.
 */
export function aplicarATablas(vivas, sql) {
  for (const e of eventosTabla(sql)) {
    if (e.tipo !== "tabla" || e.esquema !== "public") continue;
    if (e.accion === "crea") vivas.add(e.nombre);
    else vivas.delete(e.nombre);
  }
  return vivas;
}
