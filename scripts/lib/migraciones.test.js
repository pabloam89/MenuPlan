/**
 * Que las herramientas que recorren las migraciones sepan qué es un `drop table`
 * (#302), antes de que exista el primero (#303). Todo con migraciones
 * sintéticas en un directorio temporal: no depende de las reales.
 * Los recorridos de supabase/idsPersonaGrupo.test.js y cascadaPersona.test.js
 * llevan sus propios tests de lo mismo (cada uno con su carpeta sintética).
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { aplicarATablas, borrados, eventosTabla } from "./migraciones.mjs";
import { tablas } from "../cableado.mjs";
import { sinComentarios, testigos, veredictos } from "../verificar-estado.mjs";

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
/** Lo que CREA deja en el catálogo de producción cuando está aplicada. */
const CATALOGO_CON_COSAS = () => ({
  tabla: new Map([["public.cosas", ""]]),
  columna: new Map([["public.cosas.peso_g", ""]]),
  constraint: new Map([["public.cosas:cosas_peso_check", "CHECK ((peso_g > 0))"]]),
  índice: new Map([["public.idx_cosas_nombre", ""]]),
  política: new Map([["public.cosas:leer cosas", ""]]),
  trigger: new Map([["public.cosas:t_cosas", ""]]),
});
const nombres = (sql) => borrados(sql).map((b) => `${b.tipo}|${b.esquema}.${b.nombre}`);

/** ¿Hay un `drop table|view` en el texto sin comentarios que `borrados()` no ve (p. ej. dentro de un $$)? */
function dropsSinLeer(sql) {
  const hay = (sinComentarios(sql).match(/\bdrop\s+(?:table|(?:materialized\s+)?view)\b/gi) ?? []).length;
  return hay > 0 && borrados(sql).length === 0;
}

describe("borrados() y eventosTabla(): qué le pasa a las tablas en un SQL", () => {
  it("la forma simple, con if exists, esquema, comillas y mayúsculas", () => {
    expect(nombres("drop table public.a;\nDROP TABLE IF EXISTS b;\ndrop view c;\ndrop materialized view if exists public.d;\ndrop table \"E\";")).toEqual([
      "tabla|public.a", "tabla|public.b", "vista|public.c", "vista|public.d", "tabla|public.E",
    ]);
  });

  it("una lista `drop table a, b` borra las dos, y cascade no estorba", () => {
    expect(nombres("drop table public.a, public.b , c cascade;")).toEqual(["tabla|public.a", "tabla|public.b", "tabla|public.c"]);
  });

  it("un drop en un comentario o en una cadena no cuenta", () => {
    expect(nombres("-- drop table public.a;\n/* drop table public.b; */\nselect 'drop table public.c;';")).toEqual([]);
  });

  it("drop column, drop constraint, drop index y drop policy no son tablas", () => {
    expect(nombres("alter table public.t drop column x;\nalter table t drop constraint y;\ndrop index z;\ndrop policy p on t;")).toEqual([]);
  });

  it("rename to y set schema dejan de existir la tabla de antes, como un drop", () => {
    expect(eventosTabla("alter table public.a rename to b;\nalter table if exists only c set schema archivo;")).toEqual([
      { accion: "borra", tipo: "tabla", esquema: "public", nombre: "a" },
      { accion: "crea", tipo: "tabla", esquema: "public", nombre: "b" },
      { accion: "borra", tipo: "tabla", esquema: "public", nombre: "c" },
      { accion: "crea", tipo: "tabla", esquema: "archivo", nombre: "c" },
    ]);
    // rename column no renombra la tabla
    expect(eventosTabla("alter table public.a rename column x to y;")).toEqual([]);
  });

  it("los eventos salen EN ORDEN de sentencia", () => {
    expect(eventosTabla("drop table if exists x;\ncreate table x (id int);").map((e) => e.accion)).toEqual(["borra", "crea"]);
    expect(eventosTabla("create table x (id int);\ndrop table x;").map((e) => e.accion)).toEqual(["crea", "borra"]);
  });

  it("aplicarATablas: solo el esquema public, y en orden", () => {
    const vivas = new Set(["a", "b", "c"]);
    aplicarATablas(vivas, "drop table public.a;\ndrop view b;\ndrop table otro.c;");
    expect([...vivas].sort()).toEqual(["b", "c"]);
  });

  it("un drop dentro de un cuerpo $$ no se ve (límite) y dropsSinLeer lo caza", () => {
    const sql = "do $$ begin drop table public.e; end $$;";
    expect(nombres(sql)).toEqual([]);
    expect(dropsSinLeer(sql)).toBe(true);
    expect(dropsSinLeer("drop table public.a;")).toBe(false);
    expect(dropsSinLeer("-- drop table public.a;\nselect 1;")).toBe(false);
  });
});

describe("las migraciones reales no esconden un drop table que las herramientas no ven", () => {
  it("ningún drop table|view dentro de un $$ sin que el fichero tenga ninguno suelto", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations");
    const malas = readdirSync(dir).filter((f) => f.endsWith(".sql")).filter((f) => dropsSinLeer(readFileSync(join(dir, f), "utf8")));
    expect(malas, "Un `drop table` dentro de un do $$ o de una función no lo ven verificar-estado ni cableado: sácalo a una sentencia suelta").toEqual([]);
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

  it("si se vuelve a crear en una migración posterior, vuelve a contar", () => {
    const r = raiz({
      "0001_a": "create table public.cosas (id int);",
      "0002_b": "drop table public.cosas;",
      "0003_c": "create table public.cosas (id int, nombre text);",
    });
    expect([...tablas(r)]).toEqual(["cosas"]);
  });

  it("en el mismo fichero manda el orden: drop + create vive, create + drop no", () => {
    const viva = raiz({ "0001_a": "drop table if exists public.cosa_nueva;\ncreate table public.cosa_nueva (id int);" });
    expect([...tablas(viva)]).toEqual(["cosa_nueva"]);
    const muerta = raiz({ "0001_a": "create table public.cosa_nueva (id int);\ndrop table public.cosa_nueva;" });
    expect([...tablas(muerta)]).toEqual([]);
  });

  it("el esquema importa: `drop table otro.cosas` no quita public.cosas", () => {
    const r = raiz({ "0001_a": "create table public.cosas (id int);\ndrop table otro.cosas;" });
    expect([...tablas(r)]).toEqual(["cosas"]);
  });

  it("renombrar una tabla deja la de antes fuera y la nueva dentro", () => {
    const r = raiz({ "0001_a": "create table public.cosas (id int);\nalter table public.cosas rename to cositas;" });
    expect([...tablas(r)]).toEqual(["cositas"]);
  });
});

describe("verificar-estado: el drop de una tabla o vista es un testigo negativo", () => {
  const migraciones = (...sqls) => sqls.map((sql, i) => ({ nombre: `000${i + 1}_x`, ...testigos(sql) }));
  const SIN_APLICAR = new Set();

  it("el drop NO aplicado (la tabla sigue en la base): la de borrado sale «sin aplicar», la antigua sigue «aplicada» y choca", () => {
    const v = veredictos(migraciones(CREA, "drop table public.cosas;"), CATALOGO_CON_COSAS(), SIN_APLICAR);
    expect(v[0].estado).toBe("aplicada");
    expect(v[0].filas.every((f) => f.resultado === "está")).toBe(true);
    expect(v[1].estado).toBe("sin aplicar");
    expect(v[1].filas).toMatchObject([{ tipo: "tabla", id: "public.cosas", negativo: true, resultado: "falta" }]);
    expect(v[1].choca).toBe(true);
  });

  it("el drop aplicado (la tabla ya no está): la de borrado «aplicada», la antigua «sobrescrita»", () => {
    const v = veredictos(migraciones(CREA, "drop table public.cosas;"), {}, SIN_APLICAR);
    expect(v[0].estado).toBe("sobrescrita");
    expect(v[0].filas.every((f) => f.resultado === "después")).toBe(true);
    expect(v[1].estado).toBe("aplicada");
    expect(v.some((x) => x.choca)).toBe(false);
  });

  it("aunque quede un índice suelto en el catálogo, con el drop aplicado la antigua no sale «parcial»", () => {
    const v = veredictos(migraciones(CREA, "drop table public.cosas;"), { índice: new Map([["public.idx_cosas_nombre", ""]]) }, SIN_APLICAR);
    expect(v[0].estado).toBe("sobrescrita");
  });

  it("lo que ESTADO.md da por sin aplicar no cuenta como posterior", () => {
    const v = veredictos(migraciones(CREA, "drop table public.cosas;"), {}, new Set(["0002_x"]));
    expect(v[0].estado).toBe("sin aplicar"); // falta en la base y el drop no cuenta: se lee tal cual
    expect(v[1].estado).toBe("aplicada"); // ya no existe, aunque ESTADO.md dijera lo contrario…
    expect(v[1].choca).toBe(true); // …y por eso choca
  });

  it("`drop table a, b` y `drop view if exists`: un testigo negativo por nombre", () => {
    const ms = migraciones("create table a (id int);\ncreate table b (id int);\ncreate view v as select 1;", "DROP TABLE IF EXISTS a, b;\ndrop view if exists v;");
    const v = veredictos(ms, {}, SIN_APLICAR);
    expect(v.map((x) => x.estado)).toEqual(["sobrescrita", "aplicada"]);
    expect(v[1].filas.map((f) => `${f.tipo}|${f.id}`)).toEqual(["tabla|public.a", "tabla|public.b", "vista|public.v"]);
    const aun = veredictos(ms, { tabla: new Map([["public.a", ""], ["public.b", ""]]), vista: new Map([["public.v", ""]]) }, SIN_APLICAR);
    expect(aun.map((x) => x.estado)).toEqual(["aplicada", "sin aplicar"]);
  });

  it("un drop dentro de un comentario no borra nada", () => {
    const v = veredictos(migraciones(CREA, "-- drop table public.cosas;\nselect 1;"), CATALOGO_CON_COSAS(), SIN_APLICAR);
    expect(v.map((x) => x.estado)).toEqual(["aplicada", "sin testigo"]);
  });

  it("si la recrea una migración posterior, el drop sale «sobrescrita» y lo nuevo se mide", () => {
    const ms = migraciones(CREA, "drop table public.cosas;", "create table public.cosas (id uuid primary key);");
    const v = veredictos(ms, { tabla: new Map([["public.cosas", ""]]) }, SIN_APLICAR);
    expect(v[1].estado).toBe("sobrescrita");
    expect(v[2].estado).toBe("aplicada");
  });

  it("drop + create en la misma migración: no se mide el drop", () => {
    const v = veredictos(migraciones("drop table if exists public.cosas;\ncreate table public.cosas (id int);"), { tabla: new Map([["public.cosas", ""]]) }, SIN_APLICAR);
    expect(v[0].filas).toMatchObject([{ tipo: "tabla", id: "public.cosas", resultado: "está" }]);
    expect(v[0].estado).toBe("aplicada");
  });

  it("el drop de una tabla ajena no afecta a las columnas de otra", () => {
    const ms = migraciones("create table a (id int);\ncreate table b (id int);", "drop table a;");
    expect(veredictos(ms, { tabla: new Map([["public.b", ""]]) }, SIN_APLICAR)[0].estado).toBe("aplicada");
  });

  it("el esquema importa: `drop table otro.cosas` no quita public.cosas", () => {
    const v = veredictos(migraciones(CREA, "drop table otro.cosas;"), CATALOGO_CON_COSAS(), SIN_APLICAR);
    expect(v[0].estado).toBe("aplicada");
  });

  it("rename to: la de antes cuenta como borrada y la nueva como creada", () => {
    const ms = migraciones("create table a (id int);", "alter table public.a rename to b;");
    const v = veredictos(ms, { tabla: new Map([["public.b", ""]]) }, SIN_APLICAR);
    expect(v.map((x) => x.estado)).toEqual(["sobrescrita", "aplicada"]);
  });
});
