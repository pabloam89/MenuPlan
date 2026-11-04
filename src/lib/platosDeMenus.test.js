import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateMenuWithAI, platosDeMenus, platosDelPlan } from "./aiPlanner.js";
import { casaAleatoria } from "./casasAleatorias.js";

/**
 * La app registra los platos de los menús sacándolos de sus huecos (#1246, paso 2), y un menú nuevo ya no guarda
 * copias en la casa (`aiRecipes`). Esto prueba que lo que sale de los huecos son las mismas recetas que el motor
 * copiaba, en todas las semanas de todos los menús, y que los huecos de antes (sin lo que hace falta) no salen.
 *
 * Banco: casas de prueba (casasAleatorias.js), con el motor sin red (solver), la fecha y el azar fijos.
 */
const FIJO = { name: "Carrilleras de ternera al vino tinto", catalogId: "carnes_037", garnishId: "guarniciones_024", sauceId: "salsas_001", timesPerWeek: 2, meals: ["Comida"] };
const LUNES = "2026-11-02";
const clave = (r) => JSON.stringify(r);

describe("los platos de los menús salen de sus huecos (#1246, paso 2)", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${LUNES}T09:00:00Z`));
    vi.stubGlobal("localStorage", { getItem: (k) => (k === "mp_motor" ? "solver" : null) });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("de todas las semanas de todos los menús salen justo las recetas que el motor copiaba", async () => {
    const a = await generateMenuWithAI(casaAleatoria(1, { nivel: 0 }));
    const b = await generateMenuWithAI({ ...casaAleatoria(2, { nivel: 0 }), fixedDishes: [FIJO] });
    const menus = {
      viejo: { weeks: { [LUNES]: { plan: a.plan } } },
      nuevo: { weeks: { [LUNES]: { plan: b.plan } } },
    };
    const platos = platosDeMenus(menus);
    const copias = [...a.recipes, ...b.recipes];
    // El banco tiene que tener la guarnición y la salsa, o no prueba lo que dice.
    expect(copias.some((r) => r.garnishId) && copias.some((r) => r.sauceId)).toBe(true);
    // Cada copia sale de algún hueco, y cada plato es de una receta que se copiaba. Un plato fijado dos veces con
    // distintas raciones da dos platos con el mismo id: el motor copiaba uno solo (el registro guarda uno por id, igual).
    const deHuecos = new Set(platos.map(clave));
    for (const copia of copias) expect(deHuecos.has(clave(copia)), copia.id).toBe(true);
    expect(new Set(platos.map((r) => r.id))).toEqual(new Set(copias.map((r) => r.id)));
  }, 120000);

  it("un hueco de antes (sin recambios) no sale: va con su copia; lo que no es un grupo, tampoco", () => {
    const plan = {
      _warnings: [],
      adultos: {
        "0-Comida": { recipeId: "carnes_037", eaters: 2 },
        "1-Comida": { recipeId: "carnes_037", eaters: 2, restricciones: [], garnishId: "guarniciones_024", sauceId: null },
      },
    };
    expect(platosDelPlan(plan).map((r) => [r.id, r.garnishId])).toEqual([["carnes_037", "guarniciones_024"]]);
    expect(platosDeMenus({ m: { weeks: { [LUNES]: { plan } } }, vacio: {} })).toHaveLength(1);
  });
});
