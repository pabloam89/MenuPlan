/**
 * migraciones.mjs — lo que las herramientas necesitan saber de un `drop table`.
 *
 * Hasta el borrado del catálogo en SQL (#302, #303) el repo nunca había tenido
 * un `drop table`, y varias herramientas recorren las migraciones suponiendo
 * que toda tabla creada sigue existiendo. Aquí vive, en un solo sitio, la
 * lectura de «qué tablas y vistas borra este SQL», para que verificar-estado,
 * cableado y los tests que recorren las migraciones no copien la regex: la
 * regex es la de `testigos()` de verificar-estado, y esto solo la filtra.
 *
 * Reconoce sentencias sueltas `drop table [if exists] a [, b] [cascade]` y
 * `drop view [if exists] …` (también `materialized view`), con mayúsculas y
 * esquema opcional. Ignora comentarios SQL y todo lo que va dentro de una
 * cadena o de un cuerpo `$$ … $$` (límite documentado: un `drop table` dentro
 * de un `do $$ … $$` no cuenta; hoy ninguna migración lo hace así).
 */
import { testigos } from "../verificar-estado.mjs";

/**
 * Las tablas y vistas que borra un SQL, en orden:
 * [{ tipo: "tabla"|"vista", esquema, nombre }].
 */
export function borrados(sql) {
  return testigos(sql).quita
    .filter((t) => t.tipo === "tabla" || t.tipo === "vista")
    .map((t) => {
      const i = t.id.indexOf(".");
      return { tipo: t.tipo, esquema: t.id.slice(0, i), nombre: t.id.slice(i + 1) };
    });
}

/**
 * Quita de `vivas` (Set de nombres de tabla en `public`) las que borra este SQL.
 * Se llama tras anotar lo que crea la misma migración, y en orden de número:
 * si una migración posterior la vuelve a crear, vuelve a contar.
 */
export function quitarBorradas(vivas, sql) {
  for (const b of borrados(sql)) if (b.tipo === "tabla" && b.esquema === "public") vivas.delete(b.nombre);
  return vivas;
}
