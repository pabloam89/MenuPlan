/**
 * Sin deriva en la v2: la migración 0080 y el registro dicen lo mismo. En CI no
 * hay Postgres, así que se lee el texto SQL. Los CHECK de 0080 llevan la forma
 * «columna is null or columna in (...)», distinta de la de 0076-0078.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ENUMS, TIPO_DE_KIND } from "./registroTareas.js";

const sql = readFileSync(new URL("../../supabase/migrations/0080_bot_tareas_v2.sql", import.meta.url), "utf8");
// Sin comentarios: los SELECT de comprobación previa no cuentan como esquema.
const codigo = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

const valoresDe = (columna) => {
  const m = codigo.match(new RegExp(`${columna}\\s+is\\s+null\\s+or\\s+${columna}\\s+in\\s*\\(([^)]*)\\)`, "i"));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
};

describe("0080 = registroTareas", () => {
  for (const col of ["tipo", "resultado", "objetivo"]) {
    it(`bot_tareas.${col}`, () => {
      const enBase = valoresDe(col);
      expect(enBase, `no encuentro el CHECK de ${col} en 0080`).toBeTruthy();
      expect([...enBase].sort()).toEqual([...ENUMS[`bot_tareas.${col}`]].sort());
    });
  }

  it("el disparador kind ↔ tipo reparte igual que el registro", () => {
    for (const [kind, tipo] of Object.entries(TIPO_DE_KIND)) {
      // kind → tipo: «pregunta» tiene su rama; el resto pasa tal cual (else new.kind).
      if (kind !== tipo) expect(codigo).toMatch(new RegExp(`when\\s+'${kind}'\\s+then\\s+'${tipo}'`));
      // tipo → kind, rama explícita para cada uno.
      expect(codigo).toMatch(new RegExp(`when\\s+'${tipo}'\\s+then\\s+'${kind}'`));
    }
    for (const tipo of ENUMS["bot_tareas.tipo"]) {
      if (!Object.values(TIPO_DE_KIND).includes(tipo)) expect(codigo, `${tipo} no tiene kind viejo: debe quedar null`).not.toMatch(new RegExp(`when\\s+'${tipo}'\\s+then`));
    }
  });

  it("solo añade: nada de borrar columnas ni tablas, ni índices que bloqueen", () => {
    expect(codigo).not.toMatch(/\bdrop\s+(table|column)\b/i);
    expect(codigo).not.toMatch(/\bcreate\s+(unique\s+)?index\s+(?!if not exists bot_reminders_tarea|if not exists bot_idempotencia_purga)/i);
    // Las columnas nuevas no pueden ser NOT NULL sin default (reescribirían o fallarían).
    for (const m of codigo.matchAll(/add column if not exists (\w+)\s+([^,;\n]+)/gi)) {
      if (/not null/i.test(m[2])) expect(m[2], `${m[1]} es not null sin default`).toMatch(/default/i);
    }
  });

  it("los CHECK nuevos entran NOT VALID (no escanean ni bloquean lo que ya hay)", () => {
    const checks = [...codigo.matchAll(/add constraint (\w+)\s+check[\s\S]*?;/gi)].map((m) => [m[1], m[0]]);
    expect(checks.length).toBeGreaterThan(0);
    for (const [nombre, texto] of checks) expect(texto, `${nombre} sin NOT VALID`).toMatch(/not valid\s*;$/i);
  });

  it("idempotencia por casa: la clave sola no basta", () => {
    expect(codigo).toMatch(/create table if not exists public\.bot_idempotencia[\s\S]*primary key \(household_id, clave\)/i);
  });
});

// El tope de 0078 rechazaba esperas y decisiones (kind null) y no separaba
// casa y personales; lo cazó el ensayo de la 0080 en Postgres. Se fija su forma.
describe("0080: el tope solo cuenta seguimientos y separa casa y personales", () => {
  const tope = sql.slice(sql.indexOf("create or replace function public.bot_tareas_tope()"));
  it("solo seguimientos, también con kind null", () => {
    expect(tope).toMatch(/coalesce\(new\.tipo, new\.kind\) is distinct from 'seguimiento'/);
  });
  it("cuenta abiertas y aplazadas, y vale al pasar a vivo en un update", () => {
    expect(tope).toMatch(/status in \('abierta', 'aplazada'\)/);
    expect(tope).toMatch(/before insert or update on public\.bot_tareas/);
  });
  it("8 de la casa y 5 personales por dueño", () => {
    expect(tope).toMatch(/owner_user_id is not distinct from new\.owner_user_id/);
    expect(tope).toMatch(/when new\.owner_user_id is null then 8 else 5/);
  });
  it("el recordatorio cuelga de una tarea de su casa", () => {
    expect(sql).toMatch(/foreign key \(household_id, tarea_id\) references public\.bot_tareas\(household_id, id\)/);
  });
});
