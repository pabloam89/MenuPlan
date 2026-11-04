// Lola, al cambiar un plato, apunta en el hueco su receta, su guarnición y su salsa, y para qué receta son (#1246,
// paso 3): el plato que se pinta sale del hueco (platoDelHueco), como los que pone el motor y los que cambia la app.
// Motor real; base, casa y señales falsas.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("./db.js", () => ({ select: vi.fn(async () => []), insert: vi.fn(async () => {}), eq: (v) => `eq.${v}` }));
const casa = vi.hoisted(() => ({ deHoy: null, guardado: null }));
vi.mock("./casa.js", () => ({
  hoyISO: () => "2026-10-05",
  cargarCasa: vi.fn(async () => casa.deHoy),
  conCasa: vi.fn(async (_id, cambiar) => {
    casa.guardado = await cambiar(casa.deHoy);
    return casa.guardado ? { ok: true } : { ok: true, sinCambios: true };
  }),
}));
vi.mock("./embudo.js", () => ({ rastro: vi.fn(), registrar: vi.fn(), EMBUDO: {} }));
vi.mock("./aprender.js", () => ({ sumarSenales: vi.fn(async () => {}) }));

const core = await import("../../src/server/botCore.js");
const { apuntaSuPlato, platoDelHueco } = await import("../../src/lib/aiPlanner.js");
const { cambiarPlato, usarMotor } = await import("./menu.js");

const data = {
  members: [{ id: "m1", name: "Ana", age: 38 }, { id: "m2", name: "Luis", age: 40 }],
  groups: [{ id: "g1", label: "Familia", memberIds: ["m1", "m2"] }],
  schedule: {},
};
// El hueco lleva la guarnición y la salsa de un plato fijado: el que entra no se las puede quedar.
const SALE = "g1__carnes_037";
const casaCon = (hueco) => {
  const plan = { g1: { "Vie-Cena": hueco } };
  return {
    householdId: "h",
    state: { data, aiRecipes: [], menuPlan: plan },
    menu: { id: "menu1", userId: "u1" },
    semanaViva: "2026-10-05",
    semanas: [{ weekStart: "2026-10-05", weekEnd: "2026-10-11", plan, shopping: { items: [] } }],
  };
};
const CON_GUARNICION = { recipeId: SALE, eaters: 2, restricciones: [], garnishId: "guarniciones_024", sauceId: "salsas_001", platoDe: SALE };

beforeAll(() => usarMotor(core));
beforeEach(() => { casa.guardado = null; vi.spyOn(Math, "random").mockReturnValue(0.5); });
afterEach(() => vi.restoreAllMocks());

describe("Lola apunta el plato en el hueco al cambiarlo (#1246, paso 3)", () => {
  it("el hueco cambiado da el plato que Lola registra, sin la guarnición ni la salsa del de antes", async () => {
    for (const pedido of [{}, { receta: "lentejas" }]) {
      casa.deHoy = casaCon({ ...CON_GUARNICION });
      const out = {};
      await cambiarPlato("h", { dia: "viernes", franja: "Cena", ...pedido }, null, out);
      expect(out.cambiado, JSON.stringify(pedido)).toBe(true);
      const hueco = casa.guardado.semana.plan.g1["Vie-Cena"];
      expect(hueco.recipeId).toBe(out.recetaId);
      expect(apuntaSuPlato(hueco)).toBe(true);
      expect(hueco.platoDe).toBe(out.recetaId);
      expect([hueco.garnishId, hueco.sauceId]).toEqual([null, null]);
      expect(platoDelHueco(hueco)).toEqual(core.RECIPES_BY_ID[out.recetaId]);
    }
  });

  it("un hueco de antes (sin recambios ni guarnición apuntada) queda apuntado", async () => {
    casa.deHoy = casaCon({ recipeId: SALE, eaters: 2 });
    const out = {};
    await cambiarPlato("h", { dia: "viernes", franja: "Cena" }, null, out);
    const hueco = casa.guardado.semana.plan.g1["Vie-Cena"];
    expect(apuntaSuPlato(hueco)).toBe(true);
    expect(platoDelHueco(hueco)).toEqual(core.RECIPES_BY_ID[out.recetaId]);
  });

  // Los otros dos sitios (el mismo plato a los demás grupos, y los platos pedidos al generar) se miran en la fuente:
  // si alguno escribiera solo la receta, el hueco quedaría con la guarnición de la de antes.
  it("menu.js y generar.js escriben el hueco del cambio, no solo la receta", () => {
    const fuente = (f) => fs.readFileSync(path.resolve(import.meta.dirname, f), "utf8");
    for (const f of ["menu.js", "generar.js"]) expect(fuente(f), f).not.toMatch(/"firstRecipeId" : "recipeId"\]:/);
    expect(fuente("menu.js").match(/\.\.\.(?:elegido|suyoElegido)\.hueco/g)).toHaveLength(2);
    expect(fuente("generar.js")).toContain("...el.hueco");
  });
});
