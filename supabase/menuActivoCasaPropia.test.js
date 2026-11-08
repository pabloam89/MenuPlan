import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 0087: el menú activo lo dice user_menus.is_active y la casa propia es la que
// le nació (propia), no la más antigua. Lee el SQL: la migración no está
// aplicada y no hay base en los tests.
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(AQUI, "migrations", "0087_menu_activo_y_casa_propia.sql"), "utf8");
const sinComentarios = sql.replace(/--[^\n]*/g, "");

/** El cuerpo de una función, desde su create hasta el siguiente create. */
function funcion(nombre) {
  const i = sinComentarios.indexOf(`create or replace function public.${nombre}(`);
  expect(i, `falta ${nombre}`).toBeGreaterThanOrEqual(0);
  const j = sinComentarios.indexOf("create or replace function", i + 10);
  return sinComentarios.slice(i, j < 0 ? undefined : j);
}

describe("0087: precondición", () => {
  it("para si no existe households.propia (0075), antes de tocar ninguna función", () => {
    const pre = sinComentarios.slice(0, sinComentarios.indexOf("create or replace function"));
    expect(pre).toMatch(/do \$\$[\s\S]*if not exists \([\s\S]*table_name = 'households' and column_name = 'propia'[\s\S]*raise exception/);
  });
});

describe("0087: el lector tacha según user_menus.is_active", () => {
  const f = funcion("household_shopping_mark");
  it("mira la tabla", () => {
    expect(f).toMatch(/exists\s*\(\s*select 1 from public\.user_menus m\s+where m\.household_id = p_household_id and m\.id = p_menu_id and m\.is_active\s*\)/);
  });
  it("y ya no la caché del JSON", () => {
    expect(f).not.toMatch(/activeMenuId/);
  });
});

describe("0087: la casa propia es la que le nació", () => {
  it.each(["ensure_user_household", "_unirse", "_despedir"])("%s ordena por propia antes que por antigüedad", (nombre) => {
    const f = funcion(nombre);
    expect(f).toMatch(/where owner_user_id = (v_user_id|p_user_id)\s+order by propia desc, created_at\s+limit 1/);
    expect(f).not.toMatch(/owner_user_id = (v_user_id|p_user_id)\s+order by created_at/);
  });
  it("ensure_user_household devuelve 'propia' a la app", () => {
    expect(funcion("ensure_user_household")).toMatch(/'propia', h\.propia/);
  });
});
