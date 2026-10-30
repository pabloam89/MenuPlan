import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * El dato con sobre (plan fichas con estado, trozo 7): lo que no vigilan principios.test.js ni
 * vocabularios.test.js. La 0105 crea la tabla operacion; la escriben las RPC de la 0106.
 *  - operacion: la leen los de la casa y ningún usuario la escribe; una clave por casa.
 *  - sobre apunta a su operación, que se puede purgar sin llevarse el dato.
 */
const sinComentarios = (texto) => texto.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const sql = readFileSync(new URL("./migrations/0105_dato_con_sobre.sql", import.meta.url), "utf8");
const codigo = sinComentarios(sql);

/** Las migraciones de la 0105 en adelante, sin comentarios. */
function desde0105() {
  const dir = new URL("./migrations/", import.meta.url);
  return readdirSync(dir).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) >= 105)
    .map((f) => sinComentarios(readFileSync(new URL(f, dir), "utf8"))).join("\n");
}

describe("0105: operacion, solo para el servidor", () => {
  it("nace con RLS y sin ningún permiso de usuario: guarda salud y aún no tiene lector en la app", () => {
    expect(codigo).toMatch(/alter table public\.operacion enable row level security;/);
    expect(codigo).toMatch(/revoke all on table public\.operacion from anon, authenticated;/);
    const grants = [...desde0105().matchAll(/grant\s+([^;]*?)\s+on\s+(?:table\s+)?public\.operacion\b[^;]*?\bto\s+([^;]*);/gi)].map((m) => [m[1].trim(), m[2].trim()]);
    expect(grants).toEqual([]);
  });

  it("ninguna política la abre (la lectura por papel llegará en su propia migración)", () => {
    expect(desde0105()).not.toMatch(/create policy \w+ on public\.operacion\b/i);
  });

  it("una clave de idempotencia por casa", () => {
    expect(codigo).toMatch(/create unique index uq_operacion_clave on public\.operacion \(household_id, clave\);/);
  });

  it("cada estado con su fecha (PRINCIPIOS §21)", () => {
    expect(codigo).toMatch(/constraint operacion_ejecutada check \(\(estado in \('hecha', 'deshecha'\)\) = \(ejecutada_at is not null\)\)/);
    expect(codigo).toMatch(/constraint operacion_deshecha check \(\(estado = 'deshecha'\) = \(deshecha_at is not null\)\)/);
  });

  it("el sobre apunta a su operación de la misma casa; purgarla no se lleva el dato", () => {
    expect(codigo).toMatch(/foreign key \(household_id, operacion_id\)\s+references public\.operacion\(household_id, id\) on delete set null \(operacion_id\)/);
    expect(codigo).toMatch(/create index sobre_operacion on public\.sobre \(household_id, operacion_id\);/);
  });

  it("la persona autora se puede borrar sin llevarse la operación (ni la casa de la fila)", () => {
    expect(codigo).toMatch(/references public\.persona\(household_id, id\) on delete set null \(autor_persona_id\)/);
  });
});
