/**
 * Que las herramientas que recorren las migraciones sepan qué es un `drop table`
 * (#302), antes de que exista el primero (#303). Todo con migraciones
 * sintéticas en un directorio temporal: no depende de las reales.
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { borrados, quitarBorradas } from "./migraciones.mjs";
import { tablas } from "../cableado.mjs";
import { testigos, veredictos } from "../verificar-estado.mjs";

const temporales = [];
afterAll(() => temporales.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Una raíz con supabase/migrations/<nombre>.sql por cada par. */
function raiz(migraciones) {
  const r = mkdtempSync(join(tmpdir(), "menuplan-drop-"));
  temporales.push(r);
  mkdirSync(join(r, "supabase", "migrations"), { recursive: true });
  for (const [n, sql] of Object.entries(migraciones)) writeFileSync(join(r, "supabase", "migrations", `${n}.sql`), sql);
  return r;
}

const CREA = `
  create table public.cosas (id uuid primary key, nombre text);
  alter table public.cosas add column peso_g integer;
  alter table public.cosas add constraint cosas_peso_check check (peso_g > 0);
  create index idx_cosas_nombre on public.cosas (nombre);
  create policy "leer cosas" on public.cosas for select using (true);
  create trigger t_cosas before insert on public.cosas for each row execute function f();
`;
const nombres = (sql) => borrados(sql).map((b) => `${b.tipo}|${b.esquema}.${b.nombre}`);

describe("borrados(): qué tablas y vistas borra un SQL", () => {
  it("la forma simple, con if exists, esquema, comillas y mayúsculas", () => {
    expect(nombres("drop table public.a;\nDROP TABLE IF EXISTS b;\ndrop view c;\ndrop materialized view if exists public.d;\ndrop table \"E\";")).toEqual([
      "tabla|public.a", "tabla|public.b", "vista|public.c", "vista|public.d", "tabla|public.E",
    ]);
  });

  it("una lista `drop table a, b` borra las dos, y cascade no estorba", () => {
    expect(nombres("drop table public.a, public.b , c cascade;")).toEqual(["tabla|public.a", "tabla|public.b", "tabla|public.c"]);
  });

  it("un drop en un comentario, en una cadena o en un cuerpo $$ no cuenta (límite: tampoco un do $$ real)", () => {
    const sql = `
      -- drop table public.a;
      /* drop table public.b; */
      select 'drop table public.c;';
      create function f() returns void language plpgsql as $$ begin drop table public.d; end $$;
      do $$ begin drop table public.e; end $$;
    `;
    expect(nombres(sql)).toEqual([]);
  });

  it("drop column, drop constraint, drop index y drop policy no son tablas", () => {
    expect(nombres("alter table public.t drop column x;\nalter table t drop constraint y;\ndrop index z;\ndrop policy p on t;")).toEqual([]);
  });

  it("quitarBorradas solo toca el esquema public y las tablas", () => {
    const vivas = new Set(["a", "b", "c"]);
    quitarBorradas(vivas, "drop table public.a;\ndrop view b;\ndrop table otro.c;");
    expect([...vivas].sort()).toEqual(["b", "c"]);
  });
});

describe("cableado.mjs tablas()", () => {
  it("no lista una tabla que una migración posterior borra", () => {
    const r = raiz({ "0001_a": "create table public.cosas (id int);\ncreate table public.otras (id int);", "0002_b": "drop table public.cosas;" });
    expect([...tablas(r)]).toEqual(["otras"]);
  });

  it("`drop table a, b`, if exists y mayúsculas las quitan todas; un comentario con drop no quita nada", () => {
    const r = raiz({
      "0001_a": "create table a (id int); create table b (id int); create table c (id int); create table d (id int);",
      "0002_b": "-- drop table c;\nDROP TABLE IF EXISTS a, public.b;",
    });
    expect([...tablas(r)].sort()).toEqual(["c", "d"]);
  });

  it("si se vuelve a crear después del borrado, vuelve a contar", () => {
    const r = raiz({
      "0001_a": "create table public.cosas (id int);",
      "0002_b": "drop table public.cosas;",
      "0003_c": "create table public.cosas (id int, nombre text);",
    });
    expect([...tablas(r)]).toEqual(["cosas"]);
  });
});

describe("verificar-estado: el drop table se lleva lo que colgaba de la tabla", () => {
  const catalogoVacio = {};
  const migraciones = (...sqls) => sqls.map((sql, i) => ({ nombre: `000${i + 1}_x`, ...testigos(sql) }));
  const estados = (ms) => veredictos(ms, catalogoVacio, new Set()).map((v) => v.estado);

  it("sin el drop, la base sin la tabla deja la migración «sin aplicar» (el control)", () => {
    expect(estados(migraciones(CREA))).toEqual(["sin aplicar"]);
  });

  it("con un drop posterior no se exige ningún testigo de la tabla: «sobrescrita», no «parcial»", () => {
    const ms = migraciones(CREA, "drop table public.cosas;");
    const v = veredictos(ms, { tabla: new Map(), índice: new Map() }, new Set())[0];
    expect(v.estado).toBe("sobrescrita");
    expect(v.filas.map((f) => f.tipo).sort()).toEqual(["columna", "constraint", "política", "tabla", "trigger", "índice"]);
    expect(v.filas.every((f) => f.resultado === "después")).toBe(true);
  });

  it("aunque quede un testigo suelto en el catálogo (el índice), no sale «parcial»", () => {
    const ms = migraciones(CREA, "drop table public.cosas;");
    const catalogo = { índice: new Map([["public.idx_cosas_nombre", ""]]) };
    expect(veredictos(ms, catalogo, new Set())[0].estado).toBe("sobrescrita");
  });

  it("`drop table a, b` y `drop view if exists` quitan testigos de cada nombre", () => {
    const ms = migraciones("create table a (id int, x int);\ncreate table b (id int);\ncreate view v as select 1;", "DROP TABLE IF EXISTS a, b;\ndrop view if exists v;");
    expect(estados(ms)).toEqual(["sobrescrita", "sin testigo"]);
    expect(ms[1].quita.map((q) => q.id)).toEqual(["public.a", "public.b", "public.v"]);
  });

  it("un drop dentro de un comentario no borra nada", () => {
    expect(estados(migraciones(CREA, "-- drop table public.cosas;\nselect 1;"))).toEqual(["sin aplicar", "sin testigo"]);
  });

  it("si la tabla se vuelve a crear después, lo nuevo sí se exige; lo viejo, no", () => {
    const ms = migraciones(CREA, "drop table public.cosas;", "create table public.cosas (id uuid primary key);");
    const v = veredictos(ms, catalogoVacio, new Set());
    expect(v[0].estado).toBe("sobrescrita");
    expect(v[2].estado).toBe("sin aplicar");
  });

  it("el drop de una tabla ajena no afecta a las columnas de otra", () => {
    const ms = migraciones("create table a (id int);\ncreate table b (id int);", "drop table a;");
    expect(veredictos(ms, { tabla: new Map([["public.b", ""]]) }, new Set())[0].estado).toBe("aplicada");
  });
});
