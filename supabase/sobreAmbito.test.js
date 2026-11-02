import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DIAS, COMIDAS, DIMENSIONES_AMBITO } from "../src/lib/vocabularios.js";
import { REGISTRO_CAMPOS } from "../src/lib/registroCampos.js";

/**
 * El sobre con ámbito (plan fichas con estado, trozo 55; 0114): un sobre por hueco. Lo que no vigilan
 * registroCampos.test.js (el INSERT y el CHECK de registro_campo.ambito) ni vocabularios.test.js (que solo
 * compara los CHECK de las migraciones aplicadas): que cada dimensión de DIMENSIONES_AMBITO tenga su columna,
 * entre en la clave única y la exija el disparador, y que el día y la comida sean los de DIAS y COMIDAS.
 */
const sinComentarios = (texto) => texto.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const sql = sinComentarios(readFileSync(new URL("./migrations/0114_sobre_ambito.sql", import.meta.url), "utf8"));

/** La columna de sobre de cada dimensión: el grupo es una referencia (grupo_id); las demás, su nombre. */
const columnaDe = (dimension) => (dimension === "grupo" ? "grupo_id" : dimension);
const literales = (texto) => [...texto.matchAll(/'([^']*)'/g)].map((m) => m[1]);

describe("0114: cada dimensión del ámbito es una columna de sobre", () => {
  it("sobre gana una columna por dimensión, y ninguna más", () => {
    const m = sql.match(/alter table public\.sobre\s+((?:add column \w+ \w+,?\s*)+);/);
    expect(m, "falta el alter table de las columnas del ámbito").not.toBeNull();
    const columnas = [...m[1].matchAll(/add column (\w+)/g)].map((x) => x[1]);
    expect(columnas).toEqual(DIMENSIONES_AMBITO.map(columnaDe));
  });

  it("el día y la comida admiten exactamente DIAS y COMIDAS, y la semana es un lunes", () => {
    expect(literales(sql.match(/constraint sobre_dia_vocabulario check \(dia in \(([^)]*)\)\)/)[1])).toEqual(DIAS);
    expect(literales(sql.match(/constraint sobre_comida_vocabulario check \(comida in \(([^)]*)\)\)/)[1])).toEqual(COMIDAS);
    expect(sql).toMatch(/constraint sobre_semana_lunes check \(extract\(isodow from semana\) = 1\)/);
  });

  it("el grupo es de la misma casa y su dato se va con él, con índice de la FK", () => {
    expect(sql).toMatch(/foreign key \(household_id, grupo_id\)\s+references public\.grupo\(household_id, id\) on delete cascade/);
    expect(sql).toMatch(/create index sobre_grupo on public\.sobre \(household_id, grupo_id\);/);
  });
});

describe("0114: un hueco, una fila", () => {
  it("la clave única es casa, campo, persona y cada dimensión, con los nulos iguales; la de antes se va", () => {
    const m = sql.match(/create unique index sobre_unico_ambito\s+on public\.sobre \(([^)]*)\) nulls not distinct;/);
    expect(m, "falta la clave única con nulls not distinct").not.toBeNull();
    expect(m[1].split(",").map((c) => c.trim())).toEqual(["household_id", "campo", "persona_id", ...DIMENSIONES_AMBITO.map(columnaDe)]);
    expect(sql).toMatch(/drop index public\.sobre_unico;/);
  });

  it("el disparador exige cada dimensión si y solo si está en el ámbito de su campo", () => {
    const f = sql.slice(sql.indexOf("create or replace function public.sobre_valor_valido"));
    const cuerpo = f.slice(0, f.indexOf("end $$;"));
    for (const d of DIMENSIONES_AMBITO) {
      expect(cuerpo, d).toContain(`(new.${columnaDe(d)} is not null) <> ('${d}' = any(r.ambito))`);
    }
    expect(cuerpo).toMatch(/then\s+raise exception 'sobre: el ámbito de % es \{%\}, y el sobre no cuadra'[^;]*using errcode = '23514';/);
  });

  it("hay campos con cada dimensión en el registro (si no, la columna no tiene quien la lea)", () => {
    const usadas = new Set(Object.values(REGISTRO_CAMPOS).flatMap((c) => c.ambito));
    expect([...usadas].sort()).toEqual([...DIMENSIONES_AMBITO].sort());
  });
});
