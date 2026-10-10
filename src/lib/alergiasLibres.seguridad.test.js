import { describe, it, expect } from "vitest";
import { normalizeAllergenId, recipeIngredientIdsHitFreeAllergy, recipeIngredientsHitAllergens } from "./allergensCore.js";
import { filterGarnishes, filterRecipes, recipeViolatesHardSafety } from "../utils/filterRecipes.js";

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

// Los jueces (revisor y seguridad) vieron que el primer arreglo solo protegía
// dentro de recipeViolatesHardSafety: el generador y las guarniciones usaban
// una copia del filtro sin el nivel 2, y el nivel 1 no entendía el plural.
describe("alergias libres: plural, texto raro y todos los caminos", () => {
  const tieneIngrediente = (receta, re) => (receta.ingredients ?? []).some((i) => re.test(i.name));
  const caso = (alergia, ingrediente) =>
    recipeIngredientsHitAllergens([ingrediente], new Set([normalizeAllergenId(alergia)]));

  it("plural y singular dan igual en el nivel 1, en las dos direcciones", () => {
    expect(caso("Pimientos", "Pimiento rojo")).toBe(true);
    expect(caso("Judías verdes", "Judía verde")).toBe(true);
    expect(caso("Judía verde", "Judías verdes")).toBe(true);
    expect(caso("Champiñones", "Champiñón")).toBe(true);
    expect(caso("Fresas", "Fresa")).toBe(true);
    expect(caso("Lentejas", "Lenteja pardina")).toBe(true);
  });

  it("y no se vuelve loco: otra legumbre u otra verdura siguen sin bloquear", () => {
    expect(caso("Judías verdes", "Judías blancas")).toBe(false);
    expect(caso("Pimientos", "Patata")).toBe(false);
  });

  it("texto con símbolos de regex no lanza ni bloquea de más", () => {
    for (const rara of ["Kiwi (leve", "fresa)", "C++", "*", "?", "[", "\\", "a|"]) {
      expect(() => caso(rara, "Brócoli")).not.toThrow();
    }
    // «a|» no se interpreta como «a o vacío»: no bloquea todo el catálogo.
    expect(caso("a|", "Brócoli")).toBe(false);
  });

  it("un patrón que colgaría el proceso (ReDoS) no cuesta nada", () => {
    const t0 = performance.now();
    caso("(a|a)*b", "aaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    caso("(.*a){12}x", "aaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it("un texto larguísimo se acota en vez de compilar un regex enorme", () => {
    expect(() => caso("pimiento ".repeat(500), "Pimiento rojo")).not.toThrow();
  });

  it("la puntuación pegada y las listas no dejan la alergia sin efecto", () => {
    expect(caso("Tomates.", "Tomate frito")).toBe(true);
    expect(caso("tomate/pimiento", "Pimiento rojo")).toBe(true);
    expect(caso("Fresas, kiwi", "Fresa")).toBe(true);
    expect(caso("Fresas, kiwi", "Kiwi")).toBe(true);
    expect(caso("Kiwi y fresa", "Fresa")).toBe(true);
    expect(caso("Fresas; kiwi", "Brócoli")).toBe(false);
  });

  it("lo de entre paréntesis es una nota, no el ingrediente", () => {
    expect(caso("Tomate (crudo)", "Tomate frito")).toBe(true);
    expect(caso("Tomate (crudo)", "Crudo de ternera")).toBe(false);
    expect(caso("Fresa (leve", "Fresa")).toBe(true);
  });

  it("una letra suelta no bloquea todo lo que empiece por ella", () => {
    expect(caso("a", "Ajo")).toBe(false);
    expect(caso("(a|a)*b", "Brócoli")).toBe(false);
  });

  it("el nivel 2 recorta el texto y resuelve cada alergia una sola vez", () => {
    const llamadas = [];
    const resolutor = (texto) => {
      llamadas.push(texto);
      return texto.startsWith("brocoli") ? "brocoli" : null;
    };
    const ingredientes = [{ name: "x", ingredientId: "brocoli" }];
    const largo = `brocoli ${"relleno ".repeat(2000)}`;
    for (let i = 0; i < 50; i += 1) {
      expect(recipeIngredientIdsHitFreeAllergy([largo], ingredientes, resolutor)).toBe(true);
    }
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].length).toBeLessThanOrEqual(60);
  });

  it("el nivel 2 resuelve cada alternativa de una lista", () => {
    const resolutor = (texto) => (texto === "kiwi" ? "kiwi" : texto === "fresa" ? "fresa" : null);
    expect(recipeIngredientIdsHitFreeAllergy(["Fresa, kiwi"], [{ ingredientId: "kiwi" }], resolutor)).toBe(true);
    expect(recipeIngredientIdsHitFreeAllergy(["Fresa, kiwi"], [{ ingredientId: "mango" }], resolutor)).toBe(false);
  });

  it("el generador principal (filterRecipes) deja fuera «Tomates», «Judía verde» y «Pimientos», que antes se colaban", () => {
    for (const [alergia, re] of [
      ["Tomates", /tomate/i],
      ["Judía verde", /jud[ií]as? verdes?/i],
      ["Pimientos", /pimiento/i],
    ]) {
      const { recipes: pool, error } = filterRecipes({ allergies: [alergia] });
      expect(error).toBeNull();
      expect(pool.length).toBeGreaterThan(0);
      expect(pool.filter((r) => tieneIngrediente(r, re)).map((r) => r.name)).toEqual([]);
    }
  });

  it("el nivel 2 (por id) llega al generador y a las guarniciones, no solo a recipeViolatesHardSafety", () => {
    // Frases que el nivel 1 por sí solo NO encuentra («brocoli al vapor» no
    // aparece en ningún ingrediente): solo las salva el resolutor por id.
    const sinAlergia = filterRecipes({}).recipes;
    expect(sinAlergia.some((r) => tieneIngrediente(r, /br[óo]coli/i))).toBe(true);
    const { recipes } = filterRecipes({ allergies: ["Brócoli al vapor"] });
    expect(recipes.filter((r) => tieneIngrediente(r, /br[óo]coli/i)).map((r) => r.name)).toEqual([]);

    expect(filterGarnishes({}).some((g) => tieneIngrediente(g, /patata/i))).toBe(true);
    const guarniciones = filterGarnishes({ allergies: ["Patata cocida"] });
    expect(guarniciones.filter((g) => tieneIngrediente(g, /patata/i)).map((g) => g.name)).toEqual([]);
  });

  it("las guarniciones también respetan una alergia libre en plural", () => {
    const guarniciones = filterGarnishes({ allergies: ["Patatas"] });
    expect(guarniciones.length).toBeGreaterThan(0);
    expect(guarniciones.filter((g) => tieneIngrediente(g, /patata/i)).map((g) => g.name)).toEqual([]);
  });

  it("los tres caminos deciden igual para una misma alergia libre", () => {
    const conTomate = { allergens: [], ingredients: [{ name: "Tomate frito", ingredientId: "tomate" }] };
    expect(recipeViolatesHardSafety(conTomate, { allergies: ["Tomates"] })).toBe(true);
    expect(filterGarnishes({ allergies: ["Tomates"] }, [{ name: "g", ...conTomate }])).toEqual([]);
  });
});
