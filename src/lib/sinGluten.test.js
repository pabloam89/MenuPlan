/**
 * Sin gluten: para quien tiene el gluten como alergia, la pasta, el pan o la
 * soja se cambian por su versión sin gluten, en vez de quitar la receta. Pero
 * solo si TODO lo que lleva gluten tiene recambio real; si no, fuera como antes.
 */
import { describe, it, expect } from "vitest";
import { filterRecipes, recipeViolatesHardSafety } from "../utils/filterRecipes.js";
import { planAdaptations } from "./substitutions.js";
import { recipeCatalog } from "../data/recipeCatalog.js";

const conGluten = (r) => (r.allergens ?? []).some((a) => String(a).toLowerCase() === "gluten");
const nombres = (rs) => new Set(rs.map((r) => r.id));

describe("sin gluten", () => {
  it("sin la adaptación, una alergia al gluten quita todo lo que lo lleva (como siempre)", () => {
    const { recipes } = filterRecipes({ allergies: ["Gluten"] });
    expect(recipes.some(conGluten)).toBe(false);
  });

  it("con la adaptación, vuelven recetas con pasta o pan, y cada una lleva su recambio", () => {
    const antes = filterRecipes({ allergies: ["Gluten"] }).recipes;
    const ahora = filterRecipes({ allergies: ["Gluten"], intolerances: ["sin_gluten"] }).recipes;
    const recuperadas = ahora.filter((r) => !nombres(antes).has(r.id));
    expect(recuperadas.length).toBeGreaterThan(10);
    for (const r of recuperadas) {
      expect(r.adaptations?.some((a) => a.label === "sin gluten")).toBe(true);
      expect(recipeViolatesHardSafety(r, { allergies: ["Gluten"], intolerances: ["sin_gluten"] })).toBe(false);
    }
  });

  it("lo que no tiene recambio (harina, pan rallado, cuscús) sigue fuera", () => {
    const ahora = filterRecipes({ allergies: ["Gluten"], intolerances: ["sin_gluten"] }).recipes;
    const ids = new Set(ahora.map((r) => r.id));
    const conHarina = recipeCatalog.filter((r) => (r.ingredients ?? []).some((i) => /^harina\b|pan rallado|cusc[uú]s/i.test(i.name)));
    expect(conHarina.length).toBeGreaterThan(0);
    for (const r of conHarina) expect(ids.has(r.id)).toBe(false);
  });

  it("y la comprobación de seguridad no da por bueno lo que no se adapta entero", () => {
    const r = recipeCatalog.find((x) => conGluten(x) && planAdaptations(x, ["sin_gluten"]).blocked);
    expect(r).toBeTruthy();
    expect(recipeViolatesHardSafety(r, { allergies: ["Gluten"], intolerances: ["sin_gluten"] })).toBe(true);
  });

  it("un plato que declara gluten sin ingrediente que lo explique no se adapta", () => {
    const falso = { name: "Plato raro", allergens: ["gluten"], ingredients: [{ name: "Tomate" }] };
    expect(planAdaptations(falso, ["sin_gluten"]).blocked).toBe(true);
  });

  it("una receta propia con algo que no se reconoce y lleva gluten no se adapta (seitán, picatostes)", () => {
    const conSeitan = { name: "Salteado", allergens: ["gluten"], ingredients: [{ name: "Espaguetis" }, { name: "Seitán" }] };
    const conPicatostes = { name: "Crema", allergens: [], ingredients: [{ name: "Calabaza" }, { name: "Picatostes" }] };
    const declaradoSinSaber = { name: "Salsa de la casa", allergens: ["gluten"], ingredients: [{ name: "Espaguetis" }, { name: "Mi salsa secreta" }] };
    for (const r of [conSeitan, conPicatostes, declaradoSinSaber]) expect(planAdaptations(r, ["sin_gluten"]).blocked).toBe(true);
  });

  it("«pasta de miso» no es pasta: no se cambia por pasta sin gluten", () => {
    const r = { name: "Sopa de miso", allergens: ["gluten"], ingredients: [{ name: "Pasta de miso" }] };
    expect(planAdaptations(r, ["sin_gluten"]).blocked).toBe(true);
  });

  it("la avena no se cambia (la avena sin gluten no vale para todos los celíacos)", () => {
    const r = { name: "Porridge", allergens: ["gluten"], ingredients: [{ name: "Copos de avena" }, { name: "Leche" }] };
    expect(planAdaptations(r, ["sin_gluten"]).blocked).toBe(true);
  });

  it("desayunos, meriendas y postres no se adaptan: el gluten los sigue excluyendo", () => {
    const r = recipeCatalog.find((x) => x.category === "desayunos" && conGluten(x) && !planAdaptations(x, ["sin_gluten"]).blocked);
    if (r) expect(recipeViolatesHardSafety(r, { allergies: ["Gluten"], intolerances: ["sin_gluten"], offMenu: true })).toBe(true);
  });
});
