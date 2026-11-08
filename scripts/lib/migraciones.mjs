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
 *
 * Además, abajo, las columnas y las FK de cada tabla (aplicarEsquema, esquemaFinal),
 * para los tests que miran qué pasa al borrar (supabase/cascadas.test.js y
 * supabase/cascadaPersona.test.js): una sola lectura, no una regex por test.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

// ── Columnas y FK de cada tabla ─────────────────────────────────────────────
//
// Lo que entiende: `create table` (FK de columna y de tabla, con nombre o sin
// él), `alter table … add column | add constraint … foreign key | drop
// constraint | drop column`, y lo que borra `eventosTabla` (drop table). Lo
// que va dentro de `$$ … $$` no se ve. Una FK sin nombre se identifica como la
// nombra Postgres (`<tabla>_<columnas>_fkey`), para que un `drop constraint`
// posterior la encuentre.

/** Lo que puede hacer una FK al borrar la fila a la que apunta (Postgres). Vocabulario cerrado. */
export const ACCIONES_BORRADO = ["cascade", "set null", "set default", "restrict", "no action"];
/** Por nombre: ACCION_BORRADO.SET_NULL === "set null". */
export const ACCION_BORRADO = Object.freeze(Object.fromEntries(ACCIONES_BORRADO.map((a) => [a.toUpperCase().replace(" ", "_"), a])));
const BORRADO = new RegExp(String.raw`on\s+delete\s+(${ACCIONES_BORRADO.map((a) => a.replace(" ", String.raw`\s+`)).join("|")})`, "i");
const TABLA = String.raw`(?:if\s+not\s+exists\s+|if\s+exists\s+|only\s+)*(?:"?public"?\.)?"?(\w+)"?`;
const OTRO_ESQUEMA = String.raw`(?:if\s+not\s+exists\s+|if\s+exists\s+|only\s+)*"?(?!public")(?!public\.)\w+"?\.`;
const NO_COLUMNA = ["constraint", "foreign", "primary", "unique", "check", "exclude", "like"];
const VACIO = "''";

/** El SQL sin los cuerpos `$x$ … $x$` (funciones, `do`), que no declaran columnas ni FK de tabla. */
export const sinCuerpos = (sql) => String(sql).replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, () => VACIO);

/** Parte por comas de primer nivel (fuera de paréntesis). */
function trozos(texto) {
  const out = [];
  let nivel = 0;
  let actual = "";
  for (const ch of texto) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) { out.push(actual.trim()); actual = ""; continue; }
    actual += ch;
  }
  if (actual.trim()) out.push(actual.trim());
  return out;
}

/**
 * La FK de un trozo de `create table` o de `alter table … add`: «col tipo references t(…) on delete …» o
 * «[constraint n] foreign key (…) references …». `nombre`: el escrito, o null; `clave`: el que le da Postgres.
 */
export function fkDe(trozo, tabla) {
  const ref = /\breferences\s+(?:"?(\w+)"?\.)?"?(\w+)"?/i.exec(trozo);
  if (!ref) return null;
  const onDelete = (BORRADO.exec(trozo)?.[1] ?? "no action").toLowerCase().replace(/\s+/g, " ");
  const destino = `${(ref[1] ?? "public").toLowerCase()}.${ref[2].toLowerCase()}`;
  const deTabla = /^(?:constraint\s+"?(\w+)"?\s+)?foreign\s+key\s*\(([^)]*)\)/i.exec(trozo);
  if (deTabla) {
    const columnas = deTabla[2].split(",").map((c) => c.trim().replace(/"/g, "").toLowerCase());
    const nombre = deTabla[1]?.toLowerCase() ?? null;
    return { nombre, clave: nombre ?? `${tabla}_${columnas.join("_")}_fkey`, columnas, destino, onDelete };
  }
  const col = /^"?(\w+)"?/.exec(trozo)[1].toLowerCase();
  const nombre = /\bconstraint\s+"?(\w+)"?\s+references\b/i.exec(trozo)?.[1]?.toLowerCase() ?? null;
  return { nombre, clave: nombre ?? `${tabla}_${col}_fkey`, columnas: [col], destino, onDelete };
}

/**
 * Aplica una sentencia a `estado` (Map tabla → { columnas: Set, fks: Map clave → fk }), solo de public. Un `alter`
 * de una tabla que no está no hace nada, salvo con `crearSiFalta` (para leer un trozo de SQL suelto). `fichero`
 * se apunta en cada FK que se declara.
 */
export function aplicarEsquema(estado, sentencia, { crearSiFalta = false, fichero = null } = {}) {
  const s = sinCuerpos(sentencia);
  for (const e of eventosTabla(s)) {
    if (e.tipo === "tabla" && e.esquema === "public" && e.accion === "borra") estado.delete(e.nombre);
  }
  const conFichero = (fk) => (fichero ? { ...fk, fichero } : fk);
  const crea = new RegExp(String.raw`^create\s+(?:unlogged\s+)?table\s+${TABLA}\s*\(([\s\S]*)\)`, "i").exec(s);
  if (crea && !new RegExp(String.raw`^create\s+(?:unlogged\s+)?table\s+${OTRO_ESQUEMA}`, "i").test(s)) {
    const tabla = crea[1].toLowerCase();
    // `create table if not exists` de una que ya está no hace nada.
    if (/^create\s+(?:unlogged\s+)?table\s+if\s+not\s+exists/i.test(s) && estado.has(tabla)) return estado;
    const t = { columnas: new Set(), fks: new Map() };
    for (const trozo of trozos(crea[2])) {
      const col = /^"?(\w+)"?\s/.exec(trozo)?.[1]?.toLowerCase();
      if (col && !NO_COLUMNA.includes(col)) t.columnas.add(col);
      const fk = fkDe(trozo, tabla);
      if (fk) t.fks.set(fk.clave, conFichero(fk));
    }
    estado.set(tabla, t);
    return estado;
  }
  const cambia = new RegExp(String.raw`^alter\s+table\s+${TABLA}\s+([\s\S]*)$`, "i").exec(s);
  if (!cambia || new RegExp(String.raw`^alter\s+table\s+${OTRO_ESQUEMA}`, "i").test(s)) return estado;
  const tabla = cambia[1].toLowerCase();
  if (!estado.has(tabla)) {
    if (!crearSiFalta) return estado;
    estado.set(tabla, { columnas: new Set(), fks: new Map() });
  }
  const t = estado.get(tabla);
  for (const trozo of trozos(cambia[2])) {
    const quitaCol = /^drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/i.exec(trozo);
    const quitaFk = /^drop\s+constraint\s+(?:if\s+exists\s+)?"?(\w+)"?/i.exec(trozo);
    const anade = /^add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([\s\S]*)$/i.exec(trozo);
    if (quitaCol) {
      const col = quitaCol[1].toLowerCase();
      t.columnas.delete(col);
      for (const [k, fk] of t.fks) if (fk.columnas.includes(col)) t.fks.delete(k);
    } else if (quitaFk) {
      t.fks.delete(quitaFk[1].toLowerCase());
    } else if (anade) {
      const resto = anade[1];
      const col = /^"?(\w+)"?/.exec(resto)?.[1]?.toLowerCase();
      if (col && !NO_COLUMNA.includes(col)) t.columnas.add(col);
      const fk = fkDe(resto, tabla);
      if (fk) t.fks.set(fk.clave, conFichero(fk));
    }
  }
  return estado;
}

/** El estado tras todas las migraciones de `dir`, en orden de nombre y sentencia a sentencia. */
export function esquemaFinal(dir) {
  const estado = new Map();
  for (const f of readdirSync(dir).filter((n) => /^\d{4}.*\.sql$/.test(n)).sort()) {
    for (const s of sentencias(readFileSync(join(dir, f), "utf8"))) aplicarEsquema(estado, s, { fichero: f });
  }
  return estado;
}
