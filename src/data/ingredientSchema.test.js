import { describe, it, expect } from "vitest";

import { EU_ALLERGEN_IDS, IngredientSchema, validateIngredients } from "./ingredientSchema.js";
import { EU_ALLERGENS } from "../lib/allergens.js";

const VALID = {
  id: "tomate-frito",
  name: "Tomate frito",
  aliases: ["Salsa de tomate"],
  aisle: "Aceites y conservas",
  category: "Despensa",
  allergens: [],
  cookingAllergens: [],
  conflictsWith: [],
  isVegetarian: true,
  isVegan: true,
  defaultUnit: "g",
  medianAmount: 100,
};

describe("EU_ALLERGEN_IDS", () => {
  // ingredientSchema.js repite la lista de los 14 alérgenos en vez de
  // importarla de allergens.js, para no arrastrar lucide-react a la capa de
  // datos. Este test es el precio de esa decisión: si alguien toca uno de los
  // dos vocabularios y no el otro, falla aquí en vez de en producción.
  it("coincide exactamente con las claves de EU_ALLERGENS", () => {
    expect([...EU_ALLERGEN_IDS].sort()).toEqual(Object.keys(EU_ALLERGENS).sort());
  });

  it("tiene los 14 alérgenos del Anexo II", () => {
    expect(EU_ALLERGEN_IDS).toHaveLength(14);
  });
});

describe("IngredientSchema", () => {
  it("acepta un ingrediente válido", () => {
    expect(IngredientSchema.safeParse(VALID).success).toBe(true);
  });

  it("rechaza un id que no es kebab-case", () => {
    for (const id of ["Tomate Frito", "tomate_frito", "tomate-", "TOMATE"]) {
      expect(IngredientSchema.safeParse({ ...VALID, id }).success).toBe(false);
    }
  });

  it("rechaza el vocabulario histórico del catálogo de recetas", () => {
    // "lactosa"/"marisco"/"huevo"/"frutos_secos" son válidos en RecipeSchema
    // pero NO aquí: este catálogo usa los ids canónicos UE.
    for (const bad of ["lactosa", "marisco", "huevo", "frutos_secos"]) {
      expect(IngredientSchema.safeParse({ ...VALID, allergens: [bad] }).success).toBe(false);
    }
    expect(IngredientSchema.safeParse({ ...VALID, allergens: ["leche"] }).success).toBe(true);
  });

  it("rechaza vegano sin vegetariano", () => {
    const r = IngredientSchema.safeParse({ ...VALID, isVegetarian: false, isVegan: true });
    expect(r.success).toBe(false);
  });

  it("rechaza el mismo alérgeno en los dos niveles a la vez", () => {
    const r = IngredientSchema.safeParse({
      ...VALID,
      allergens: ["sulfitos"],
      cookingAllergens: ["sulfitos"],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza que `name` se repita dentro de `aliases`", () => {
    const r = IngredientSchema.safeParse({ ...VALID, aliases: ["Tomate frito"] });
    expect(r.success).toBe(false);
  });

  it("rechaza campos desconocidos (el schema es estricto)", () => {
    const r = IngredientSchema.safeParse({ ...VALID, recipeCount: 12 });
    expect(r.success).toBe(false);
  });

  // `conflictsWith` son restricciones adaptables, jamás alérgenos: un producto
  // "sin lactosa" conserva la proteína láctea y no sirve para una alergia.
  it("solo acepta restricciones adaptables en conflictsWith", () => {
    expect(IngredientSchema.safeParse({ ...VALID, conflictsWith: ["lactosa_fina"] }).success).toBe(true);
    for (const bad of ["leche", "gluten", "vegano", "embarazo"]) {
      expect(IngredientSchema.safeParse({ ...VALID, conflictsWith: [bad] }).success).toBe(false);
    }
  });
});

describe("validateIngredients", () => {
  it("detecta ids duplicados", () => {
    const errors = validateIngredients([VALID, { ...VALID, name: "Otro" }]);
    expect(errors.some((e) => e.includes("Id de ingrediente duplicado"))).toBe(true);
  });

  // La invariante que sostiene al resolver: si un alias perteneciera a dos
  // ingredientes, resolveIngredientId devolvería uno u otro según el orden del
  // array — y con él, un alérgeno distinto.
  it("detecta un alias que pertenece a dos ingredientes", () => {
    const otro = { ...VALID, id: "tomate-triturado", name: "Tomate triturado" };
    const errors = validateIngredients([VALID, otro]);
    expect(errors.some((e) => e.includes("pertenece a dos ingredientes"))).toBe(true);
  });

  it("detecta la colisión aunque solo difiera en acentos o mayúsculas", () => {
    const otro = {
      ...VALID,
      id: "salsa-de-tomate",
      name: "SALSA DE TOMATE",
      aliases: [],
    };
    const errors = validateIngredients([VALID, otro]);
    expect(errors.some((e) => e.includes("pertenece a dos ingredientes"))).toBe(true);
  });

  // Regresión: el catálogo real tenía "Queso gruyère" y "Queso Gruyère" como
  // dos alias del MISMO ingrediente. validateIngredients solo miraba colisiones
  // entre ingredientes distintos, así que pasaba — y luego seed_ingredients.sql
  // fallaba con "ON CONFLICT DO UPDATE command cannot affect row a second time",
  // porque las dos producen la misma PK en ingredient_aliases.
  it("detecta dos alias del mismo ingrediente que normalizan igual", () => {
    const errors = validateIngredients([
      { ...VALID, aliases: ["Queso gruyère", "Queso Gruyère"] },
    ]);
    expect(errors.some((e) => e.includes("normalizan igual"))).toBe(true);
  });

  it("detecta un alias que normaliza igual que el propio nombre", () => {
    const errors = validateIngredients([{ ...VALID, aliases: ["TOMATE FRITO"] }]);
    expect(errors.some((e) => e.includes("normalizan igual"))).toBe(true);
  });

  it("no se queja de un catálogo sano", () => {
    const otro = {
      ...VALID,
      id: "tomate-triturado",
      name: "Tomate triturado",
      aliases: ["Tomate en conserva"],
    };
    expect(validateIngredients([VALID, otro])).toEqual([]);
  });
});
