import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Lo que pide extrasDeFicha a la base, y lo que le devolvemos.
const pedidas = [];
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${encodeURIComponent(v)}`,
  select: vi.fn(async (tabla, filtro, columnas) => {
    pedidas.push({ tabla, columnas });
    if (tabla === "user_pantry") return [{ ingredient_name: "Lentejas estofadas", portions: 3, frozen: false }];
    return [];
  }),
}));

const { extrasDeFicha } = await import("./ficha.js");

// Las columnas de una tabla según las migraciones: el `create table` y cada
// `add column`. Si la ficha pide una columna que no está aquí, PostgREST
// devuelve 400 y el `.catch` la deja en blanco sin que nadie se entere.
function columnasDe(tabla) {
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  const cols = new Set();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8").replace(/--.*$/gm, "");
    const crear = sql.match(new RegExp(`create table (?:if not exists )?(?:public\\.)?${tabla}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"));
    if (crear) for (const l of crear[1].split("\n")) { const m = l.trim().match(/^([a-z_]+)\s/); if (m) cols.add(m[1]); }
    for (const bloque of sql.split(";")) {
      if (!new RegExp(`alter table (?:if exists )?(?:public\\.)?${tabla}\\b`, "i").test(bloque)) continue;
      for (const m of bloque.matchAll(/add column (?:if not exists )?([a-z_]+)/gi)) cols.add(m[1]);
    }
  }
  return cols;
}

describe("extrasDeFicha", () => {
  beforeEach(() => { pedidas.length = 0; });

  it("lo cocinado de la nevera pide columnas que existen en user_pantry", async () => {
    await extrasDeFicha("casa-1", null);
    const despensa = pedidas.find((p) => p.tabla === "user_pantry");
    const existen = columnasDe("user_pantry");
    expect(existen.has("ingredient_name")).toBe(true);
    for (const c of despensa.columnas.split(",").map((s) => s.trim())) expect(existen, `user_pantry.${c}`).toContain(c);
  });

  it("los avisos piden columnas que existen en bot_reminders", async () => {
    await extrasDeFicha("casa-1", 42);
    const avisos = pedidas.find((p) => p.tabla === "bot_reminders");
    const existen = columnasDe("bot_reminders");
    for (const c of avisos.columnas.split(",").map((s) => s.trim())) expect(existen, `bot_reminders.${c}`).toContain(c);
  });

  it("y lo pinta con el nombre del plato", async () => {
    const { nevera } = await extrasDeFicha("casa-1", null);
    expect(nevera).toEqual(["3 raciones de Lentejas estofadas (nevera)"]);
  });
});
