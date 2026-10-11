import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checksDeLista } from "../scripts/lib/checksVocabulario.mjs";
import { COLUMNAS_VOCABULARIO } from "../scripts/lib/columnasVocabulario.mjs";
import { CLASES_COLUMNA, CLASES_DEL_FICHERO, RUTA_COLUMNAS_TEXTO, columnasDeTexto, leerMigracionesSql, problemasDeClases } from "../scripts/lib/columnasTexto.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migraciones = leerMigracionesSql(RAIZ);
const clasificadas = JSON.parse(readFileSync(join(RAIZ, RUTA_COLUMNAS_TEXTO), "utf8")).columns;

/** Las columnas con CHECK de lista (cualquier migración) o en el registro de vocabularios del producto. */
const vocabularioDe = (migs) => new Set([...checksDeLista(migs).keys(), ...Object.keys(COLUMNAS_VOCABULARIO)]);
const sql = (fichero, texto) => ({ fichero, sql: texto });

// #585 (norma C4): una columna de texto nueva que debería ser un vocabulario y no entra en el registro no
// hacía fallar nada. Ahora cada columna de texto de las migraciones está en una de cuatro clases.
describe("columnas de texto: todas clasificadas (#585)", () => {
  it("cada columna de texto es vocabulario (CHECK o registro) o está en ops/columnas-texto.json con su motivo, y al revés", () => {
    expect(problemasDeClases(columnasDeTexto(migraciones), vocabularioDe(migraciones), clasificadas)).toEqual([]);
  });

  it("el fichero solo usa las clases que lleva a mano y todas tienen definición", () => {
    expect(Object.keys(CLASES_COLUMNA).sort()).toEqual(["excluded", "free_text", "identifier", "vocabulary"]);
    expect(CLASES_DEL_FICHERO.every((c) => c in CLASES_COLUMNA)).toBe(true);
    expect(CLASES_DEL_FICHERO).not.toContain("vocabulary");
  });

  it("las excluidas de salud siguen con su motivo (esperan el catálogo de alergias)", () => {
    const salud = ["persona_alergia.alergeno", "persona_estado.estado", "persona_intolerancia.valor", "persona_perfil_salud.perfil", "user_recipes.allergens", "bot_tareas.valor"];
    for (const c of salud) {
      expect(clasificadas[c]?.class, c).toBe("excluded");
      expect(clasificadas[c].reason, c).toMatch(/VOCABULARIOS_PENDIENTES/);
    }
  });
});

describe("el lector de columnas de texto (con migraciones de mentira)", () => {
  const base = sql("0001_a.sql", "create table public.demo (id uuid primary key, nombre text not null, estado text, n integer, etiquetas text[], codigo varchar(20), mote citext, largo character varying(10), constraint demo_ck check (n > 0));");

  it("lee text, varchar, citext, character varying y arrays; ignora lo que no es texto", () => {
    const c = columnasDeTexto([base]);
    expect([...c.keys()]).toEqual(["demo.codigo", "demo.estado", "demo.etiquetas", "demo.largo", "demo.mote", "demo.nombre"]);
    expect(c.get("demo.etiquetas").tipo).toBe("text[]");
  });

  it("sigue add column, alter type, drop column y drop table", () => {
    const c = columnasDeTexto([
      base,
      sql("0002_b.sql", "alter table demo add column if not exists nota text, add column edad int; alter table demo alter column n type text; alter table demo alter column nombre type integer using 0; alter table demo drop column estado;"),
      sql("0003_c.sql", "create table otra (a text); drop table otra;"),
    ]);
    expect(c.has("demo.nota")).toBe(true);
    expect(c.has("demo.edad")).toBe(false);
    expect(c.has("demo.n")).toBe(true);
    expect(c.has("demo.nombre")).toBe(false);
    expect(c.has("demo.estado")).toBe(false);
    expect([...c.keys()].some((k) => k.startsWith("otra."))).toBe(false);
  });

  it("«add» sin «column» también cuenta; «add constraint» no es una columna (auditor-datos)", () => {
    const c = columnasDeTexto([base, sql("0002_b.sql", "alter table demo add foo text, add constraint demo_u unique (codigo), add if not exists bar varchar(5);")]);
    expect(c.has("demo.foo")).toBe(true);
    expect(c.has("demo.bar")).toBe(true);
    expect([...c.keys()].some((k) => k.startsWith("demo.constraint") || k.startsWith("demo.demo_u"))).toBe(false);
  });

  it("un rename lanza: el lector tiene que aprender a seguirlo antes de dar nada por bueno", () => {
    expect(() => columnasDeTexto([base, sql("0002_b.sql", "alter table demo rename column nombre to titulo;")])).toThrow(/rename/);
  });

  // La prueba de que el test falla: una columna nueva sin clasificar, una clasificada que ya no existe,
  // una clasificada que además tiene CHECK y un motivo que falta.
  it("una columna de texto nueva sin clasificar hace fallar; también una clasificada que ya no existe", () => {
    const migs = [base, sql("0002_nueva.sql", "alter table demo add column tipo_nuevo text;")];
    const columnas = columnasDeTexto(migs);
    const ok = { class: "free_text", reason: "Texto que escribe la persona" };
    const todas = Object.fromEntries([...columnas.keys()].filter((c) => c !== "demo.tipo_nuevo").map((c) => [c, ok]));
    const sin = problemasDeClases(columnas, vocabularioDe(migs), todas);
    expect(sin).toHaveLength(1);
    expect(sin[0]).toMatch(/demo\.tipo_nuevo.*sin clasificar/);
    const huerfana = problemasDeClases(columnas, vocabularioDe(migs), { ...todas, "demo.tipo_nuevo": ok, "demo.fantasma": ok });
    expect(huerfana).toHaveLength(1);
    expect(huerfana[0]).toMatch(/demo\.fantasma.*ya no es una columna/);
  });

  it("con CHECK de lista es vocabulario y no puede estar además en el fichero; sin motivo o con clase rara falla", () => {
    const migs = [sql("0001_a.sql", "create table demo (id uuid, estado text check (estado in ('a','b')), nota text);")];
    const columnas = columnasDeTexto(migs);
    const voc = vocabularioDe(migs);
    expect(voc.has("demo.estado")).toBe(true);
    expect(problemasDeClases(columnas, voc, { "demo.nota": { class: "free_text", reason: "Nota que escribe la persona" } })).toEqual([]);
    expect(problemasDeClases(columnas, voc, { "demo.nota": { class: "free_text", reason: "Nota que escribe la persona" }, "demo.estado": { class: "free_text", reason: "Nota que escribe la persona" } })[0]).toMatch(/demo\.estado.*además/);
    expect(problemasDeClases(columnas, voc, { "demo.nota": { class: "free_text", reason: "corto" } })[0]).toMatch(/falta el motivo/);
    expect(problemasDeClases(columnas, voc, { "demo.nota": { class: "vocabulary", reason: "Nota que escribe la persona" } })[0]).toMatch(/clase «vocabulary» no válida/);
  });
});
