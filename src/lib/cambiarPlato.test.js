import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { apuntaSuPlato, generateMenuWithAI, pickCatalogReplacement, platoDelHueco } from "./aiPlanner.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { casaAleatoria } from "./casasAleatorias.js";

/**
 * Un cambio de plato apunta en el hueco su receta, su guarnición y su salsa, y para qué receta son (#1246, paso 2b):
 * el plato que se pinta sale del hueco, igual que los que pone el motor, y no de una copia.
 *
 * Banco: casas de prueba (casasAleatorias.js), con el motor sin red (solver), la fecha y el azar fijos.
 */
// Un plato fijado con su guarnición y su salsa: en las casas de prueba el motor no empareja guarniciones solo, y así
// hay huecos con guarnición que cambiar.
const FIJO = { name: "Carrilleras de ternera al vino tinto", catalogId: "carnes_037", garnishId: "guarniciones_024", sauceId: "salsas_001", timesPerWeek: 2, meals: ["Comida"] };
const CASAS = [casaAleatoria(1, { nivel: 0 }), casaAleatoria(2, { nivel: 0 }), { ...casaAleatoria(7, { nivel: 0 }), fixedDishes: [FIJO] }];
const curso = (course) => (course === "first" ? "primero" : "principal");

describe("cambiar un plato apunta el plato en el hueco (#1246, paso 2b)", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T09:00:00Z"));
    vi.stubGlobal("localStorage", { getItem: (k) => (k === "mp_motor" ? "solver" : null) });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("el hueco cambiado da el mismo plato que el cambio trae, en cada curso de cada hueco, al azar o a mano", async () => {
    let cambios = 0;
    let conGuarnicion = 0;
    for (const casa of CASAS) {
      const { plan } = await generateMenuWithAI(casa);
      for (const [groupId, huecos] of Object.entries(plan).filter(([g]) => !g.startsWith("_"))) {
        for (const [clave, hueco] of Object.entries(huecos)) {
          const [day, meal] = clave.split("-");
          for (const course of [hueco.firstRecipeId && "first", hueco.recipeId && "main"].filter(Boolean)) {
            const otro = recipeCatalogById.carnes_056;
            for (const opciones of [{}, course === "main" ? { forcedRecipe: otro } : null].filter(Boolean)) {
              const r = pickCatalogReplacement(casa, plan, { groupId, day, meal, course, ...opciones });
              if (!r) continue;
              const cambiado = { ...hueco, ...r.hueco };
              expect(apuntaSuPlato(cambiado, curso(course)), `${clave} ${course}`).toBe(true);
              expect(platoDelHueco(cambiado, curso(course)), `${clave} ${course}`).toEqual(r.frontendRecipe);
              // El otro curso sigue como estaba.
              if (course === "main" && hueco.firstRecipeId) expect(cambiado.primeroDe).toBe(hueco.primeroDe);
              cambios++;
              // Uno que tenía guarnición y salsa no se las pasa al plato nuevo.
              if (course === "main" && hueco.garnishId) {
                expect(cambiado.platoDe).toBe(r.recipeId);
                expect([cambiado.garnishId, cambiado.sauceId]).toEqual([null, null]);
                conGuarnicion++;
              }
            }
          }
        }
      }
    }
    // El banco tiene que tener huecos con guarnición que cambiar, o no prueba lo que dice.
    expect(cambios).toBeGreaterThan(30);
    expect(conGuarnicion).toBeGreaterThan(0);
  }, 300000);

  it("un hueco de antes (sin recambios ni guarnición apuntada) queda apuntado al cambiarlo", async () => {
    const casa = casaAleatoria(1, { nivel: 0 });
    const { plan } = await generateMenuWithAI(casa);
    const [groupId] = Object.keys(plan).filter((g) => !g.startsWith("_"));
    const [clave, hueco] = Object.entries(plan[groupId]).find(([, h]) => h.recipeId && !h.firstRecipeId);
    const deAntes = { recipeId: hueco.recipeId, eaters: hueco.eaters, mode: hueco.mode, warnings: [] };
    const viejo = { ...plan, [groupId]: { ...plan[groupId], [clave]: deAntes } };
    const [day, meal] = clave.split("-");
    const r = pickCatalogReplacement(casa, viejo, { groupId, day, meal, course: "main" });
    const cambiado = { ...deAntes, ...r.hueco };
    expect(apuntaSuPlato(cambiado)).toBe(true);
    expect(platoDelHueco(cambiado)).toEqual(r.frontendRecipe);
  }, 300000);

  // App.jsx no se monta en los tests: se mira su fuente. Cada sitio que coloca lo que da pickCatalogReplacement
  // escribe su `hueco`; si alguno escribiera solo la receta, el hueco quedaría con la guarnición de la de antes
  // (y se leería de su copia, apuntaSuPlato).
  it("la app y la pizarra escriben el hueco del cambio, no solo la receta", () => {
    const fuente = (f) => fs.readFileSync(path.resolve(import.meta.dirname, f), "utf8");
    for (const f of ["../App.jsx", "./pizarraIA.js"]) {
      expect(fuente(f), f).not.toMatch(/(?:firstRecipeId|recipeId): (?:result|r|c|p|first)\.recipeId/);
    }
    expect(fuente("../App.jsx").match(/\.\.\.(?:result|r|c|first)\.hueco|Object\.assign\(base, p\.hueco\)/g)).toHaveLength(7);
    expect(fuente("./pizarraIA.js")).toContain("...r.hueco");
  });
});
