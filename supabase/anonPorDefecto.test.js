import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `anon` no tiene permisos por defecto en lo nuevo de `public` (0096, #367).
 *
 * Dos cosas, las dos leídas del SQL:
 *  1. la 0096 quita a `anon` la plantilla de tablas y secuencias de `postgres`
 *     en `public` (las funciones no: ver su cabecera) y no toca ningún grant de
 *     lo existente;
 *  2. desde la 0096, ninguna migración da permisos de tabla o secuencia a
 *     `anon` ni a `public` (que lo incluye), ni cambia el dueño de nada a
 *     ellos (`owner to`), salvo la marca `-- anon: <porqué en tres palabras o
 *     más>` dentro de la sentencia (antes de su `;`) o en una línea que sea solo
 *     ese comentario, justo encima. Las funciones quedan fuera: un RPC público
 *     lleva su `grant execute` explícito (§8).
 *
 * Es un lector de texto, y lo que NO cubre:
 *  - SQL armado en dos trozos (`'grant ' || ...`, `format(...)`) o leído de una tabla;
 *  - dar permisos por pertenencia a un rol (`grant authenticated to anon`);
 *  - objetos creados por otro rol que no sea `postgres` (`supabase_admin` tiene su
 *    propia plantilla, abierta a `anon`: PRINCIPIOS §8);
 *  - un `;` dentro de un texto entre comillas simples parte la sentencia a efectos
 *    de la marca (solo la hace más estricta);
 *  - un cambio en el panel de Supabase, sin migración.
 * Lo que de verdad pasa en la base lo comprueba la autoprueba al final de la
 * propia 0096 (crea una tabla con su secuencia de prueba y las deshace).
 */
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(AQUI, "migrations");
const DESDE = 96;

/** El SQL sin comentarios y en minúsculas (lo justo para leer grants). */
const limpiar = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "").toLowerCase();

/**
 * El SQL con los comentarios en blanco (mismos desplazamientos, mismos saltos
 * de línea), en minúsculas, más la lista de comentarios. Respeta las comillas
 * simples: un '--' dentro de un texto no es un comentario.
 */
function leerSql(sql) {
  let limpio = "";
  const comentarios = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      limpio += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "-" && sql[i + 1] === "-") {
      let j = sql.indexOf("\n", i);
      if (j < 0) j = sql.length;
      comentarios.push({ ini: i, fin: j, texto: sql.slice(i + 2, j) });
      limpio += " ".repeat(j - i);
      i = j;
    } else if (c === "/" && sql[i + 1] === "*") {
      let j = sql.indexOf("*/", i + 2);
      j = j < 0 ? sql.length : j + 2;
      comentarios.push({ ini: i, fin: j, texto: sql.slice(i + 2, j - 2) });
      limpio += sql.slice(i, j).replace(/[^\n]/g, " ");
      i = j;
    } else {
      limpio += c;
      i++;
    }
  }
  return { limpio: limpio.toLowerCase(), comentarios };
}

/** La marca: 'anon:' y al menos tres palabras de porqué. */
const MARCA = /\banon:\s*\S+\s+\S+\s+\S+/i;
const OBJETOS_QUE_NO_SON_TABLA = /\bon\s+(?:function|functions|all\s+functions|routine|routines|procedure|all\s+procedures|schema|schemas|type|types|domain|language|database|foreign|large)\b/;

/**
 * Lo que da permisos de tabla o secuencia a anon/public sin la marca. Lee el
 * texto entero, no solo el principio de cada sentencia, así que ve también un
 * \'execute 'grant … to anon'\' dentro de un bloque do. Una marca vale si está
 * dentro de la sentencia (antes de su \';\') o en una línea que sea solo un
 * comentario, justo encima de la línea donde empieza el \'grant\'.
 */
export function grantsAnon(sql) {
  const { limpio, comentarios } = leerSql(sql);
  const malos = [];
  const linea = (pos) => limpio.slice(0, pos).split("\n").length;
  const resumen = (t) => t.replace(/\s+/g, " ").trim().slice(0, 140);

  for (const m of limpio.matchAll(/\bgrant\b[^;]*?\bto\b[^;]*?\b(?:anon|public)\b/g)) {
    if (OBJETOS_QUE_NO_SON_TABLA.test(m[0])) continue;
    const ini = m.index;
    const fin = limpio.indexOf(";", ini + m[0].length);
    const hasta = fin < 0 ? limpio.length : fin;
    const dentro = comentarios.some((c) => c.ini >= ini && c.ini < hasta && MARCA.test(c.texto));
    const encima = comentarios.some((c) => {
      if (!MARCA.test(c.texto) || linea(c.fin) !== linea(ini) - 1) return false;
      const antes = sql.slice(sql.lastIndexOf("\n", c.ini - 1) + 1, c.ini);
      return antes.trim() === "";
    });
    if (!dentro && !encima) malos.push(resumen(m[0]));
  }
  for (const m of limpio.matchAll(/\bowner\s+to\s+(?:anon|public)\b/g)) malos.push(resumen(m[0]));
  return malos;
}

/** La plantilla que debe dejar la 0096 (tablas y secuencias; las funciones no, ver su cabecera). */
export function plantillaSinAnon(sql) {
  const c = limpiar(sql);
  const quita = (tipo) => new RegExp(
    String.raw`alter\s+default\s+privileges\s+for\s+role\s+postgres\s+in\s+schema\s+public\s+revoke\s+all\s+on\s+${tipo}\s+from\s+anon\b`,
  ).test(c);
  return { tablas: quita("tables"), secuencias: quita("sequences") };
}

describe("anon por defecto: el lector distingue SQL bueno de malo", () => {
  it.each([
    ["grant a tabla", "grant select on table public.cosas to anon;", 1],
    ["grant a tabla sin la palabra table", "grant select, insert on public.cosas to anon, authenticated;", 1],
    ["grant a public", "grant select on public.cosas to public;", 1],
    ["grant en todas las tablas", "grant all on all tables in schema public to anon;", 1],
    ["grant en secuencias", "grant usage on sequence public.cosas_id_seq to anon;", 1],
    ["default privileges que vuelven a dar", "alter default privileges for role postgres in schema public grant select on tables to anon;", 1],
    ["una marca de otro sitio no vale", "-- anon: lectura publica del enlace\ngrant select on public.cosas to anon;\ngrant select on public.otra to anon;", 1],
    ["grant dentro de execute en un do", "do $$ begin execute 'grant select on public.cosas to anon'; end $$;", 1],
    ["un ; dentro de un comentario no parte la sentencia", "grant select on public.cosas -- ojo; ahora viene anon\n to anon;", 1],
    ["un ; en un comentario de bloque tampoco", "grant select on public.cosas /* a; b */ to anon;", 1],
    ["owner to anon", "alter table public.cosas owner to anon;", 1],
    ["owner to public", "alter table public.cosas owner to public;", 1],
    ["marca pegada a la sentencia anterior", "grant select on public.a to authenticated; -- anon: lectura publica del enlace\ngrant select on public.b to anon;", 1],
    ["marca con menos de tres palabras", "grant select on public.cosas to anon /* anon: vale */;", 1],
    ["marca lejos de la sentencia", "-- anon: lectura publica del enlace\n\ngrant select on public.cosas to anon;", 1],
  ])("%s se rechaza", (_d, sql, n) => {
    expect(grantsAnon(sql)).toHaveLength(n);
  });

  it.each([
    ["grant a authenticated", "grant select on public.cosas to authenticated;"],
    ["grant execute de una función a anon (RPC público)", "grant execute on function public.ver_enlace(text) to anon;"],
    ["usage en el esquema", "grant usage on schema public to anon;"],
    ["revoke a anon", "revoke all on table public.cosas from anon, authenticated;"],
    ["con la marca y su porqué, dentro", "grant select on public.enlaces to anon /* anon: lectura pública del enlace, sin datos de familias */;"],
    ["con la marca en la línea anterior", "-- anon: lectura pública del enlace, sin datos de familias\ngrant select on public.enlaces to anon;"],
    ["una tabla llamada anonima", "grant select on public.anonima to authenticated;"],
    ["owner a postgres", "alter table public.cosas owner to postgres;"],
  ])("%s pasa", (_d, sql) => {
    expect(grantsAnon(sql)).toEqual([]);
  });

  it("la plantilla: falla si falta tablas o secuencias", () => {
    const base = "alter default privileges for role postgres in schema public revoke all on tables from anon;\n"
      + "alter default privileges for role postgres in schema public revoke all on sequences from anon;\n";
    expect(plantillaSinAnon(base)).toEqual({ tablas: true, secuencias: true });
    expect(plantillaSinAnon(base.replace(/.*sequences.*\n/, ""))).toMatchObject({ secuencias: false });
    expect(plantillaSinAnon(base.replace("from anon;", "from authenticated;"))).toMatchObject({ tablas: false });
  });
});

describe("anon por defecto: las migraciones del repo", () => {
  const ficheros = fs.readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const leer = (f) => fs.readFileSync(path.join(DIR, f), "utf8");

  it("la 0096 quita a anon la plantilla de tablas y secuencias", () => {
    const f = ficheros.find((x) => x.startsWith("0096_"));
    expect(f, "falta la migración 0096").toBeTruthy();
    expect(plantillaSinAnon(leer(f))).toEqual({ tablas: true, secuencias: true });
  });

  it("la 0096 no toca los grants de lo que ya existe", () => {
    const c = limpiar(leer(ficheros.find((x) => x.startsWith("0096_"))));
    const sueltos = sinDefaults(c).filter((s) => /^(grant|revoke)\b/.test(s));
    expect(sueltos).toEqual([]);
  });

  const nuevas = ficheros.filter((f) => Number(f.slice(0, 4)) >= DESDE);
  it.each(nuevas)("%s no da permisos de tabla a anon sin marca", (f) => {
    expect(grantsAnon(leer(f))).toEqual([]);
  });
});

/** Sentencias de nivel superior que no son `alter default privileges`. */
function sinDefaults(codigo) {
  return codigo.split(";").map((s) => s.trim()).filter((s) => s && !/^alter\s+default\s+privileges\b/.test(s));
}
