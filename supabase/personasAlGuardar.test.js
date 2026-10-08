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
  it("con otro roster activo (PWA vieja en «Otro grupo»), no toca nada", () => {
    expect(f).toMatch(/if coalesce\(new\.state->'data'->>'activeRosterId', 'default'\) <> 'default' then\s+return null/);
  });
  it("con la familia vacía no llama (la 0082 lo rechazaría)", () => {
    expect(f).toMatch(/jsonb_array_length\(v_filas->'personas'\) = 0 then\s+return null/);
  });
  it("convertir, comprobar y sincronizar van DENTRO del begin…exception", () => {
    const bloque = /\bbegin\s+v_filas := public\._persona_filas_de_estado\(new\.state\);[\s\S]*?exception when others then\s+raise warning/.exec(f)?.[0] ?? "";
    expect(bloque).toMatch(/jsonb_array_length\(v_filas->'personas'\) = 0/);
    expect(bloque).toMatch(/perform public\.persona_sincronizar_casa\(new\.household_id, v_filas\)/);
    // Y fuera del bloque, nada que pueda fallar.
    expect(f.slice(0, f.indexOf("v_filas := "))).not.toMatch(/_persona_filas_de_estado|persona_sincronizar_casa/);
  });
});

describe("0089: quitar a alguien no borra sus tareas", () => {
  it("la FK de bot_tareas pasa a on delete set null (persona_id), not valid, en una sola sentencia", () => {
    expect(sinComentarios).toMatch(/alter table public\.bot_tareas\s+drop constraint if exists bot_tareas_persona_fk,\s+add constraint bot_tareas_persona_fk\s+foreign key \(household_id, persona_id\) references public\.persona\(household_id, id\)\s+on delete set null \(persona_id\) not valid;/);
    expect(sinComentarios).not.toMatch(/bot_tareas_persona_fk[\s\S]{0,200}on delete cascade/);
  });
  it("la cabecera lo dice: se va la persona y su salud, no sus tareas", () => {
    expect(sql).toMatch(/borra su fila de\s+--\s+persona y, en cascada, su salud/);
    expect(sql).toMatch(/Sus tareas NO/);
  });
  it("el validate pendiente está apuntado en PENDIENTES.md con la 0089", () => {
    const pendientes = fs.readFileSync(path.join(AQUI, "PENDIENTES.md"), "utf8");
    expect(pendientes).toMatch(/0089[^\n]*\n[\s\S]{0,400}bot_tareas_persona_fk[\s\S]{0,400}on delete set null/);
  });
});

describe("0089: el gemelo en SQL de filasDeCasa", () => {
  const f = funcion("_persona_filas_de_estado");
  it("lee solo la familia activa: ni rosters aparcados ni invitados", () => {
    expect(f).toMatch(/p_state->'data'->'members'/);
    // Con otro roster activo, ni miembros ni grupos (como filasDeCasa).
    expect(f.match(/coalesce\(p_state->'data'->>'activeRosterId', 'default'\) = 'default'/g)?.length).toBe(2);
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
    expect(fin).toMatch(/for r in\s+select household_id, state from public\.household_state\s+where jsonb_typeof\(state->'data'->'members'\) = 'array'\s+and coalesce\(state->'data'->>'activeRosterId', 'default'\) = 'default'/);
    expect(fin).toMatch(/begin\s+v_filas := public\._persona_filas_de_estado\(r\.state\);/);
    expect(fin).toMatch(/perform public\.persona_sincronizar_casa\(r\.household_id, v_filas\)[\s\S]*exception when others then\s+raise warning/);
  });
});
