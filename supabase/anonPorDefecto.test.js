import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `anon` no tiene permisos por defecto en lo nuevo de `public` (0096, #367).
 *
 * Dos cosas, las dos leídas del SQL:
 *  1. la 0096 quita a `anon` la plantilla de tablas y secuencias
 *     de `postgres` en `public` (las funciones no: ver su cabecera) (y no toca ningún grant de lo existente);
 *  2. desde la 0096, ninguna migración da permisos de tabla o secuencia a
 *     `anon` ni a `public` (que lo incluye), salvo la marca `-- anon: <porqué>`
 *     o `/* anon: <porqué> *\/` dentro de la propia sentencia. Las funciones
 *     quedan fuera: un RPC público lleva su `grant execute` explícito (§8).
 *
 * Es un lector de texto: lo que de verdad pasa en la base lo comprueba la
 * autoprueba al final de la propia 0096 (crea una tabla con su secuencia de
 * prueba y las deshace).
 */
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(AQUI, "migrations");
const DESDE = 96;

/** El SQL sin comentarios y en minúsculas (lo justo para leer grants). */
const limpiar = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "").toLowerCase();

const A_ANON = /\bto\b[^;]*\b(anon|public)\b/;

/** Sentencias que dan permisos de tabla o secuencia a anon/public sin la marca. */
export function grantsAnon(sql) {
  const malos = [];
  for (const trozo of sql.split(";")) {
    const s = limpiar(trozo).trim();
    if (!s) continue;
    const marca = /(--|\/\*)\s*anon:\s*\S/i.test(trozo);

    // grant … on tables|sequences|<tabla> … to anon|public
    const g = /^grant\b([\s\S]*)$/.exec(s);
    if (g && A_ANON.test(g[1])) {
      const on = /\bon\s+(function|functions|all\s+functions|routine|schema|type|domain|language|database|foreign|large)\b/.test(g[1]);
      if (!on && !marca) malos.push(s.replace(/\s+/g, " ").slice(0, 140));
    }
    // alter default privileges … grant … to anon|public (sobre tablas o secuencias)
    if (/^alter\s+default\s+privileges\b/.test(s) && /\bgrant\b/.test(s) && A_ANON.test(s)
        && /\bon\s+(tables|sequences)\b/.test(s) && !marca) {
      malos.push(s.replace(/\s+/g, " ").slice(0, 140));
    }
  }
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
    ["grant a tabla", "grant select on table public.cosas to anon;"],
    ["grant a tabla sin la palabra table", "grant select, insert on public.cosas to anon, authenticated;"],
    ["grant a public", "grant select on public.cosas to public;"],
    ["grant en todas las tablas", "grant all on all tables in schema public to anon;"],
    ["grant en secuencias", "grant usage on sequence public.cosas_id_seq to anon;"],
    ["default privileges que vuelven a dar", "alter default privileges for role postgres in schema public grant select on tables to anon;"],
    ["una marca de otro sitio no vale", "-- anon: vale\ngrant select on public.cosas to anon;\ngrant select on public.otra to anon;"],
  ])("%s se rechaza", (_d, sql) => {
    expect(grantsAnon(sql).length).toBeGreaterThan(0);
  });

  it.each([
    ["grant a authenticated", "grant select on public.cosas to authenticated;"],
    ["grant execute de una función a anon (RPC público)", "grant execute on function public.ver_enlace(text) to anon;"],
    ["usage en el esquema", "grant usage on schema public to anon;"],
    ["revoke a anon", "revoke all on table public.cosas from anon, authenticated;"],
    ["con la marca y su porqué", "grant select on public.enlaces to anon /* anon: lectura pública del enlace, sin datos de familias */;"],
    ["una tabla llamada anonima", "grant select on public.anonima to authenticated;"],
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
