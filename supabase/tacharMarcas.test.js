import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MARCA_COMPRA, MARCAS_COMPRA } from "../src/lib/vocabularios.js";
import { marcasEntre } from "../src/lib/tacharLector.js";

// 0120 (trozo 18 de #1037): el lector tacha también en una compra guardada como
// marcas. Lee el SQL: la migración no está aplicada y no hay base en los tests.
const sql = readFileSync(new URL("./migrations/0120_tachar_marcas.sql", import.meta.url), "utf8");
const codigo = sql.replace(/--[^\n]*/g, "");

/** El cuerpo de una función, desde su create hasta el siguiente create. */
function funcion(nombre) {
  const i = codigo.indexOf(`create or replace function public.${nombre}(`);
  expect(i, `falta ${nombre}`).toBeGreaterThanOrEqual(0);
  const j = codigo.indexOf("create or replace function", i + 10);
  return codigo.slice(i, j < 0 ? undefined : j);
}

describe("0120: tachar en una compra con marcas", () => {
  const marcar = funcion("_marcar_compra");

  it("la única marca que escribe es 'comprado', la de vocabularios.js", () => {
    const literales = new Set([...marcar.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((v) => MARCAS_COMPRA.includes(v)));
    expect([...literales]).toEqual([MARCA_COMPRA.COMPRADO]);
  });

  it("con marcas busca el artículo por el id que manda la app", () => {
    expect(marcar).toMatch(/v_id := v_marca->>'id'/);
    expect(marcar).toMatch(/where e\.x->>'id' = v_id/);
    const [m] = marcasEntre([{ id: "leche|ml", name: "Leche", unit: "ml", have: false }], [{ id: "leche|ml", name: "Leche", unit: "ml", have: true }]);
    expect(m.id).toBe("leche|ml");
  });

  it("con la lista entera, lo de siempre (_marcar_items por nombre y unidad)", () => {
    expect(marcar).toMatch(/if jsonb_typeof\(p_compra->'marcas'\) is distinct from 'array' then\s+return jsonb_set\(p_compra, '\{items\}', public\._marcar_items\(p_compra->'items', p_marcas\), true\);/);
  });

  it("un dato roto se dice y no se pisa: sin compra guardada, una vacía (0087); algo que no es objeto, o una marca sin id o sin have, error", () => {
    expect(marcar).toMatch(/p_compra := coalesce\(p_compra, '\{\}'::jsonb\);\s+if jsonb_typeof\(p_compra\) <> 'object' then\s+raise exception/);
    expect(marcar).toMatch(/if v_id is null or v_have is null then\s+raise exception/);
    expect(marcar).not.toMatch(/continue when v_id is null/);
    expect(marcar).not.toMatch(/else '\{\}'::jsonb end/);
  });

  it("un artículo que se queda sin marcas sale de la lista; uno sin marcas solo se apunta si se tacha", () => {
    expect(marcar).toMatch(/if jsonb_array_length\(v_suyas\) = 0 then\s+v_lista := v_lista - v_pos;/);
    expect(marcar).toMatch(/continue when not v_have;/);
  });

  it("nadie puede llamarla desde fuera", () => {
    expect(codigo).toMatch(/revoke all on function public\._marcar_compra\(jsonb, jsonb\) from public, anon, authenticated;/);
    expect(codigo).not.toMatch(/grant execute on function public\._marcar_compra/);
  });
});

describe("0120: household_shopping_mark pasa la semana y la copia viva por _marcar_compra", () => {
  const f = funcion("household_shopping_mark");

  it("la semana y la copia viva, las dos", () => {
    expect(f).toMatch(/set shopping = public\._marcar_compra\(w\.shopping, p_marcas\)/);
    expect(f).toMatch(/jsonb_set\(v_state, '\{shopping\}', public\._marcar_compra\(v_state->'shopping', p_marcas\), true\)/);
    expect(f).not.toMatch(/_marcar_items/);
  });

  it("como la 0087, a una casa sin copia viva de la compra no se le crea", () => {
    expect(f).toMatch(/and jsonb_typeof\(v_state->'shopping'\) = 'object' then\s+v_state := jsonb_set/);
  });

  it("sigue mirando user_menus.is_active (0087) y los mismos permisos", () => {
    expect(f).toMatch(/m\.id = p_menu_id and m\.is_active/);
    expect(codigo).toMatch(/grant execute on function public\.household_shopping_mark\(uuid, text, date, jsonb\) to authenticated, service_role;/);
  });
});
