import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAMPOS_CON_COLUMNA, RANGOS } from "../src/lib/personasTabla.js";

// 0089: cada guardado de la casa copia la familia activa a persona/grupo, en la
// misma transacción, desde un trigger sobre household_state. Lee el SQL: la
// migración no está aplicada y no hay base en los tests.
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(AQUI, "migrations");
const fichero = fs.readdirSync(DIR).find((f) => /^0089_personas_al_guardar\.sql$/.test(f));
const sql = fichero ? fs.readFileSync(path.join(DIR, fichero), "utf8") : "";
const sinComentarios = sql.replace(/--[^\n]*/g, "");

/** El cuerpo de una función, desde su create hasta el siguiente create ("" si no está). */
function funcion(nombre) {
  const i = sinComentarios.indexOf(`create or replace function public.${nombre}(`);
  if (i < 0) return "";
  const j = sinComentarios.indexOf("create or replace", i + 10);
  return sinComentarios.slice(i, j < 0 ? undefined : j);
}

describe("0089: existe y para si falta lo que necesita", () => {
  it("el fichero está", () => {
    expect(fichero).toBeTruthy();
  });
  it("precondición: persona_sincronizar_casa con las guardas de la 0082, antes de crear nada", () => {
    const pre = sinComentarios.slice(0, sinComentarios.indexOf("create or replace function"));
    expect(pre).toMatch(/do \$\$[\s\S]*to_regprocedure\('public\.persona_sincronizar_casa\(uuid, jsonb\)'\) is null[\s\S]*raise exception/);
    expect(pre).toMatch(/lista de personas vacía[\s\S]*raise exception/);
  });
});

describe("0089: un solo sitio, todos los escritores", () => {
  it("trigger tras insertar y tras actualizar state en household_state", () => {
    expect(sinComentarios).toMatch(/create or replace trigger \w+\s+after insert on public\.household_state\s+for each row[\s\S]*?execute function public\._personas_al_guardar\(\)/);
    expect(sinComentarios).toMatch(/create or replace trigger \w+\s+after update of state on public\.household_state\s+for each row/);
  });
  it("al actualizar, solo si cambian los comensales o los grupos (tachar la compra no copia nada)", () => {
    const upd = /after update of state on public\.household_state[\s\S]*?execute function/.exec(sinComentarios)?.[0] ?? "";
    expect(upd).toMatch(/old\.state->'data'->'members' is distinct from new\.state->'data'->'members'/);
    expect(upd).toMatch(/old\.state->'data'->'groups' is distinct from new\.state->'data'->'groups'/);
  });
  it("no reescribe las funciones de guardado (cada una sigue siendo la de su migración)", () => {
    expect(sinComentarios).not.toMatch(/function public\.(save_household_state|bot_save_casa|bot_save_casa_activando)\(/);
  });
});

describe("0089: el trigger no rompe un guardado", () => {
  const f = funcion("_personas_al_guardar");
  it("es security definer (save_household_state corre como el usuario)", () => {
    expect(f).toMatch(/security definer\s+set search_path = public, pg_temp/);
  });
  it("sin lista de comensales (guardado parcial), no toca nada", () => {
    expect(f).toMatch(/jsonb_typeof\(new\.state->'data'->'members'\) is distinct from 'array' then\s+return null/);
  });
  it("con la familia vacía no llama (la 0082 lo rechazaría)", () => {
    expect(f).toMatch(/jsonb_array_length\(v_filas->'personas'\) = 0 then\s+return null/);
  });
  it("llama a persona_sincronizar_casa y, si falla, avisa y deja seguir el guardado", () => {
    expect(f).toMatch(/perform public\.persona_sincronizar_casa\(new\.household_id, v_filas\)/);
    expect(f).toMatch(/exception when others then\s+raise warning/);
  });
});

describe("0089: el gemelo en SQL de filasDeCasa", () => {
  const f = funcion("_persona_filas_de_estado");
  it("lee solo la familia activa: ni rosters aparcados ni invitados", () => {
    expect(f).toMatch(/p_state->'data'->'members'/);
    expect(f).toMatch(/p_state->'data'->'groups'/);
    expect(f).not.toMatch(/rosters/);
    expect(f).toMatch(/'invitado' is distinct from 'true'::jsonb/);
    expect(f).toMatch(/not like 'inv\\_%'/);
  });
  it("lo que va a resto son las mismas claves que en JS", () => {
    const m = /- array\[([^\]]*)\]/.exec(f);
    expect(m, "falta el «- array[...]» de resto").toBeTruthy();
    const sqlClaves = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    expect(sqlClaves).toEqual([...CAMPOS_CON_COLUMNA].sort());
  });
  it.each(Object.entries(RANGOS))("%s con los mismos topes que en JS", (col, [min, max]) => {
    expect(f).toMatch(new RegExp(String.raw`>= ${min} and [\w.]+ <= ${max}`));
  });
});

describe("0089: pone al día las casas que ya hay", () => {
  it("recorre household_state y sincroniza cada casa, sin parar si una falla", () => {
    const fin = sinComentarios.slice(sinComentarios.lastIndexOf("create or replace trigger"));
    expect(fin).toMatch(/for r in\s+select household_id, state from public\.household_state/);
    expect(fin).toMatch(/perform public\.persona_sincronizar_casa\(r\.household_id, v_filas\)[\s\S]*exception when others then\s+raise warning/);
  });
});
