import { describe, it, expect } from "vitest";
import { normalizeAllergenId, recipeIngredientsHitAllergens } from "./allergensCore.js";
import { recipeViolatesHardSafety } from "../utils/filterRecipes.js";

// Hueco de seguridad real en producción (aviso de menuplan-05): una persona
// guarda «Brócoli» como alergia confirmada. normalizeAllergenId la convierte
// en el id "brocoli", pero no es uno de los 14 alérgenos UE ni está en
// INGREDIENT_ALLERGEN_KEYWORDS, así que no hay ningún campo declarado ni
// ninguna palabra clave que la cubra: no protegía nada.

describe("alergias libres (fuera de los 14 UE)", () => {
  const recetaConBrocoli = {
    allergens: [],
    ingredients: [{ name: "Brócoli" }, { name: "Ajo" }],
  };

  it("«brocoli» normaliza a un id que no es ninguno de los 14 UE", () => {
    const id = normalizeAllergenId("Brócoli");
    expect(id).toBe("brocoli");
  });

  it("recipeIngredientsHitAllergens detecta el ingrediente por el nombre, aunque no esté en ninguna lista", () => {
    expect(recipeIngredientsHitAllergens(["Brócoli", "Ajo"], new Set(["brocoli"]))).toBe(true);
    expect(recipeIngredientsHitAllergens(["Ajo", "Cebolla"], new Set(["brocoli"]))).toBe(false);
  });

  it("recipeViolatesHardSafety bloquea la receta para quien declaró alergia al brócoli", () => {
    expect(recipeViolatesHardSafety(recetaConBrocoli, { allergies: ["Brócoli"] })).toBe(true);
  });

  it("no bloquea una receta que de verdad no lleva ese ingrediente", () => {
    const sinBrocoli = { allergens: [], ingredients: [{ name: "Ajo" }, { name: "Cebolla" }] };
    expect(recipeViolatesHardSafety(sinBrocoli, { allergies: ["Brócoli"] })).toBe(false);
  });

  it("una alergia libre de dos palabras también se detecta (frontera de palabra, no substring)", () => {
    const conJudiasVerdes = { allergens: [], ingredients: [{ name: "Judías verdes" }] };
    const conJudiasBlancas = { allergens: [], ingredients: [{ name: "Judías blancas" }] };
    expect(recipeViolatesHardSafety(conJudiasVerdes, { allergies: ["Judías verdes"] })).toBe(true);
    expect(recipeViolatesHardSafety(conJudiasBlancas, { allergies: ["Judías verdes"] })).toBe(false);
  });

  it("los 14 alérgenos UE sin palabra clave propia siguen sin pasar por aquí (los cubre el campo declarado)", () => {
    // "soja" SÍ tiene palabra clave; "huevos" NO la tiene y no debe inventarse
    // una: se cubre con recipe.allergens, no con el nombre.
    expect(recipeIngredientsHitAllergens(["Huevo cocido"], new Set(["huevos"]))).toBe(false);
  });
});

describe("alergias libres, nivel 2: resolver al ingrediente real, no solo buscar la palabra", () => {
  // Caso que el nivel 1 NO puede resolver: la frase completa de la alergia no
  // aparece literal en ningún nombre de receta, pero resuelve al mismo
  // ingrediente que resolvería esa misma frase dentro de una receta.
  const recetaConBrocoliSolo = { allergens: [], ingredients: [{ name: "Brócoli", ingredientId: "brocoli" }, { name: "Ajo", ingredientId: "ajo" }] };
  const recetaSinBrocoli = { allergens: [], ingredients: [{ name: "Zanahoria", ingredientId: "zanahoria" }] };

  it("«Brócoli al vapor» como alergia bloquea una receta con brócoli, aunque la receta diga solo «Brócoli»", () => {
    expect(recipeViolatesHardSafety(recetaConBrocoliSolo, { allergies: ["Brócoli al vapor"] })).toBe(true);
    expect(recipeViolatesHardSafety(recetaSinBrocoli, { allergies: ["Brócoli al vapor"] })).toBe(false);
  });

  it("y el nivel 1 por sí solo, con esa misma frase de tres palabras, no la encuentra", () => {
    // Lo que demuestra que el nivel 2 añade cobertura real, no que la repite.
    expect(recipeIngredientsHitAllergens(["Brócoli", "Ajo"], new Set(["brocoli_al_vapor"]))).toBe(false);
  });

  it("una categoría («Marisco») no resuelve, y sigue sin bloquear nada por sí sola", () => {
    const conGambas = { allergens: [], ingredients: [{ name: "Gambas peladas", ingredientId: "gambas" }] };
    expect(recipeViolatesHardSafety(conGambas, { allergies: ["Marisco"] })).toBe(false);
  });
});
