/**
 * La demo (`?demo=1`) enseña platos reales del catálogo. Este test impide que
 * vuelva a enseñar otra cosa: ids que no existen, platos fuera del Recetario
 * (no Estrella), o un demoState.json que ya no sale de demoMenu.js.
 * Para regenerarlo: node scripts/gen-demo-state.mjs
 */
import { describe, it, expect } from "vitest";
import { DEMO_MENU_SLOTS, DEMO_MENU_IDS, planDemo } from "./demoMenu.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { RECIPES_BY_ID } from "../data/recipes.js";
import demoState from "./demoState.json";

describe("el menú de la demo", () => {
  it("hay una semana entera: 7 días × comida y cena", () => {
    const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    expect(Object.keys(DEMO_MENU_SLOTS)).toEqual(dias.flatMap((d) => [`${d}-Comida`, `${d}-Cena`]));
  });

  it("todos los ids existen en el catálogo y son Estrella", () => {
    const fuera = DEMO_MENU_IDS.filter((id) => !recipeCatalogById[id]?.estrella);
    expect(fuera).toEqual([]);
  });

  it("cada plato tiene un papel que cabe en su hueco", () => {
    const roles = (id) => recipeCatalogById[id].mealRole ?? [];
    const malos = [];
    for (const [hueco, [principal, primero]] of Object.entries(DEMO_MENU_SLOTS)) {
      const cena = hueco.endsWith("Cena");
      const okPrincipal = cena
        ? roles(principal).some((r) => ["cena", "plato_unico"].includes(r))
        : roles(principal).some((r) => ["segundo", "plato_unico"].includes(r));
      if (!okPrincipal) malos.push(`${hueco}: ${principal}`);
      if (primero && (cena || !roles(primero).includes("primero"))) malos.push(`${hueco}: primero ${primero}`);
    }
    expect(malos).toEqual([]);
  });

  it("demoState.json sale de demoMenu.js (regenerar con scripts/gen-demo-state.mjs)", () => {
    const grupo = demoState.data.groups[0].id;
    expect(demoState.menuPlan).toEqual(planDemo(grupo, demoState.data.members.length));
    expect(demoState.aiRecipes.map((r) => r.id).sort()).toEqual([...DEMO_MENU_IDS].sort());
  });

  it("las recetas de la demo traen los pasos reales del catálogo, no cuatro genéricos", () => {
    const paella = demoState.aiRecipes.find((r) => r.id === "pasta_arroces_077");
    expect(paella.name).toBe("Paella mixta");
    expect(paella.steps).toHaveLength(recipeCatalogById.pasta_arroces_077.steps.length);
    expect(paella.steps.length).toBeGreaterThanOrEqual(16);
  });

  it("el registro de recetas arranca vacío: no hay recetas de prototipo en el código", () => {
    // RECIPES_BY_ID solo lo llena registerRecipes en ejecución; si aquí aparece algo, alguien ha vuelto a escribir recetas a mano en recipes.js.
    expect(Object.keys(RECIPES_BY_ID)).toEqual([]);
  });
});
