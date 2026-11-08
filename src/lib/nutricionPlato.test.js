import { describe, it, expect } from "vitest";
import { nutrienteDe, vectorDe, crudoDe, CAMPOS_PLATO } from "./nutricionPlato.js";
import { catalogToFrontendRecipe } from "./aiPlanner.js";
import { recipeCatalog, recipeCatalogById } from "../data/recipeCatalog.js";
import { registerRecipes, RECIPES_BY_ID } from "../data/recipes.js";
import { POR_RACION } from "../data/nutrientes.js";

const GAZPACHO = recipeCatalogById.sopas_cremas_046;
const enRuntime = (r) => catalogToFrontendRecipe(r, 2);

describe("nutrienteDe: las dos formas de plato", () => {
  it("el gazpacho de fresas en runtime (el plato de ahora) da sus macros", () => {
    const runtime = enRuntime(GAZPACHO);
    expect(runtime.protein_g).toBeUndefined();
    expect(nutrienteDe(runtime, "protein_g")).toEqual({ valor: 3, cobertura: 1, motivo: null });
    expect(nutrienteDe(runtime, "carbs_g").valor).toBe(23);
    expect(nutrienteDe(runtime, "fat_g").valor).toBe(19);
    expect(nutrienteDe(runtime, "fiber_g").valor).toBe(4);
    expect(nutrienteDe(runtime, "kcal").valor).toBe(275);
  });

  it("registrado como lo hace el bot, con prefijo de grupo, se sigue leyendo", () => {
    registerRecipes([{ ...enRuntime(GAZPACHO), id: "mayores__sopas_cremas_046" }]);
    const registrado = RECIPES_BY_ID["mayores__sopas_cremas_046"];
    expect(nutrienteDe(registrado, "protein_g").valor).toBe(3);
    expect(crudoDe(registrado)).toBe(GAZPACHO);
  });

  it("los 32 dan lo mismo por la forma plana y por la runtime", () => {
    const muestra = recipeCatalog.filter((r) => r.estrella).slice(0, 80);
    expect(CAMPOS_PLATO).toHaveLength(Object.keys(POR_RACION).length);
    let comparados = 0;
    for (const r of muestra) {
      const runtime = enRuntime(r);
      for (const campo of CAMPOS_PLATO) {
        const plano = nutrienteDe(r, campo);
        expect(nutrienteDe(runtime, campo), `${r.id} ${campo}`).toEqual(plano);
        if (plano.valor !== null) comparados++;
      }
    }
    // Que la comparación no sea de nulls contra nulls.
    expect(comparados).toBeGreaterThan(muestra.length * 25);
  });

  it("un micro con poca cobertura no da número, y lo dice", () => {
    const r = recipeCatalog.find((x) => Object.values(x.micronutrientesCobertura ?? {}).some((c) => c < 0.5));
    const [campo, cobertura] = Object.entries(r.micronutrientesCobertura).find(([, c]) => c < 0.5);
    expect(nutrienteDe(r, campo)).toEqual({ valor: null, cobertura, motivo: "cobertura" });
    expect(nutrienteDe(enRuntime(r), campo)).toEqual({ valor: null, cobertura, motivo: "cobertura" });
    expect(nutrienteDe(r, campo, { umbralCobertura: 0 }).valor).toBe(r[campo]);
  });

  it("0 es un valor; lo que falta es sin_dato; lo que no existe, campo_desconocido", () => {
    expect(nutrienteDe({ protein_g: 0 }, "protein_g")).toEqual({ valor: 0, cobertura: 1, motivo: null });
    expect(nutrienteDe({ macros: { protein: 0 } }, "protein_g").valor).toBe(0);
    expect(nutrienteDe({ kcal: 300 }, "fiber_g").motivo).toBe("sin_dato");
    expect(nutrienteDe(GAZPACHO, "omega3_g").motivo).toBe("campo_desconocido");
    expect(nutrienteDe(null, "kcal").motivo).toBe("sin_dato");
  });
});

describe("vectorDe y crudoDe", () => {
  it("el vector trae los 32 y null donde no hay valor fiable", () => {
    const v = vectorDe(enRuntime(GAZPACHO));
    expect(Object.keys(v).filter((k) => k !== "cobertura")).toEqual(CAMPOS_PLATO);
    expect(v.protein_g).toBe(3);
    expect(v).toEqual(vectorDe(GAZPACHO));
  });

  it("crudoDe: catálogo, receta de usuario o el propio plato", () => {
    const propia = { id: "user_abc", name: "Lentejas de la abuela", protein_g: 18 };
    expect(crudoDe({ id: "ninos__user_abc", macros: { protein: 20 } }, { userRecipes: [propia] })).toBe(propia);
    const suelto = { id: "inventado_1", macros: { protein: 5 } };
    expect(crudoDe(suelto)).toBe(suelto);
    expect(crudoDe({ ...enRuntime(GAZPACHO), id: "x__otra", baseRecipeId: "sopas_cremas_046" })).toBe(GAZPACHO);
  });
});
