import { describe, it, expect, afterEach } from "vitest";

import {
  ingredientCatalog,
  ingredientById,
  resolveIngredientId,
  resolveIngredient,
  resolveRecipeIngredients,
  deriveRecipeAllergens,
  computeRecipeNutrition,
  ingredientSubstitutions,
  substitutionFor,
  planIngredientSubstitutions,
  ingredientAisleFor,
  ingredientCategoryFor,
  ingredientAllergensFor,
  AMBIGUOUS_STEMS,
} from "./ingredients.js";
import { guessShoppingAisle, normalizeName } from "./ingredientCategories.js";
import { recipeCatalog } from "../data/recipeCatalog.js";

describe("catálogo de ingredientes", () => {
  // El import del módulo ya lanza si el JSON no valida, así que llegar aquí
  // significa que el catálogo bundleado está sano.
  it("carga y valida al importar", () => {
    expect(ingredientCatalog.length).toBeGreaterThan(300);
    expect(Object.keys(ingredientById)).toHaveLength(ingredientCatalog.length);
  });

  it("está ordenado por id, para que el diff de una regeneración sea legible", () => {
    const ids = ingredientCatalog.map((i) => i.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });
});

describe("resolveIngredientId", () => {
  it("resuelve por nombre exacto", () => {
    expect(resolveIngredientId("Aceite de oliva")).toBe("aceite-oliva");
    expect(resolveIngredientId("Tomate frito")).toBe("tomate-frito");
  });

  it("resuelve por alias", () => {
    // "Jamón serrano en tacos" no es un ingrediente propio: es una forma de
    // cortar el jamón serrano, y resuelve al mismo id que él.
    const id = resolveIngredientId("Jamón serrano en tacos");
    expect(id).toBe(resolveIngredientId("Jamón serrano"));
    expect(ingredientById[id].aliases).toContain("Jamón serrano en tacos");
  });

  it("ignora acentos y mayúsculas", () => {
    expect(resolveIngredientId("ACEITE DE OLIVA")).toBe("aceite-oliva");
    expect(resolveIngredientId("aceite de oliva")).toBe("aceite-oliva");
  });

  it("devuelve null para lo que no conoce, en vez de adivinar", () => {
    expect(resolveIngredientId("Ingrediente que no existe 12345")).toBeNull();
    expect(resolveIngredientId("")).toBeNull();
    expect(resolveIngredientId(null)).toBeNull();
    expect(resolveIngredientId(undefined)).toBeNull();
  });

  // Invariante que sostiene todo lo demás: cada etiqueta del catálogo tiene que
  // devolver su propio ingrediente. Si dos ingredientes compartieran etiqueta,
  // validateIngredients ya habría fallado, pero esto lo comprueba de verdad
  // sobre las 788 etiquetas reales.
  it("cada nombre y alias del catálogo resuelve a su propio ingrediente", () => {
    const rotos = [];
    for (const ing of ingredientCatalog) {
      for (const label of [ing.name, ...ing.aliases]) {
        const got = resolveIngredientId(label);
        if (got !== ing.id) rotos.push(`"${label}" → ${got ?? "null"} (esperado ${ing.id})`);
      }
    }
    expect(rotos).toEqual([]);
  });
});

describe("cobertura sobre el catálogo de recetas real", () => {
  // La razón de ser del catálogo: resolver el 100% de lo que las recetas usan.
  // Si esto baja, es que se ha añadido una receta con un ingrediente nuevo y
  // hay que regenerar (npm run build:ingredients).
  it("resuelve todos los ingredientes que usan las recetas", () => {
    const sinResolver = new Set();
    for (const recipe of recipeCatalog) {
      for (const line of recipe.ingredients ?? []) {
        if (!resolveIngredientId(line.name)) sinResolver.add(line.name);
      }
    }
    expect([...sinResolver]).toEqual([]);
  });
});

describe("stems ambiguos", () => {
  it("se descartan en vez de resolverse arbitrariamente", () => {
    // No se afirma cuáles son (cambian al cambiar el catálogo), sino que
    // ninguno resuelve: un acierto arbitrario aquí puede ser el alérgeno
    // equivocado, y es preferible que el llamante caiga a su heurística.
    for (const stem of AMBIGUOUS_STEMS) {
      const id = resolveIngredientId(stem);
      if (id) {
        // Solo puede resolver si el stem es además el nombre/alias exacto de
        // un ingrediente concreto ("Jamón" lo es, y desambigua el stem "jamon"
        // que comparte con el jamón cocido). Se compara con normalizeName en
        // los dos lados: el stem viene sin acentos y la etiqueta con ellos.
        const labels = [ingredientById[id].name, ...ingredientById[id].aliases];
        expect(labels.map(normalizeName)).toContain(normalizeName(stem));
      }
    }
  });
});

describe("helpers con fallback", () => {
  it("ingredientAisleFor usa el catálogo cuando lo conoce", () => {
    expect(ingredientAisleFor("Aceite de oliva")).toBe("Aceites y conservas");
  });

  it("ingredientAisleFor cae a la heurística para un nombre desconocido", () => {
    const desconocido = "Verdura rarísima de la huerta";
    expect(ingredientAisleFor(desconocido)).toBe(guessShoppingAisle(desconocido));
  });

  it("ingredientCategoryFor también cae a la heurística", () => {
    expect(ingredientCategoryFor("Chuleta de mamut")).toBeTruthy();
  });

  // Contrato de seguridad: un nombre desconocido NO significa "sin alérgenos".
  // `known` existe justamente para que el llamante no confunda las dos cosas y
  // siga aplicando las redes de lib/allergens.js y lib/intolerances.js.
  it("ingredientAllergensFor marca known:false en vez de afirmar que no hay alérgenos", () => {
    const r = ingredientAllergensFor("Producto desconocido 999");
    expect(r).toEqual({ allergens: [], cookingAllergens: [], known: false });
  });

  it("ingredientAllergensFor devuelve los dos niveles por separado", () => {
    const vino = ingredientAllergensFor("Vino blanco");
    expect(vino.known).toBe(true);
    expect(vino.allergens).toEqual([]);
    expect(vino.cookingAllergens).toContain("sulfitos");

    const aceitunas = ingredientAllergensFor("Aceitunas negras");
    expect(aceitunas.allergens).toContain("sulfitos");
    expect(aceitunas.cookingAllergens).toEqual([]);
  });
});

describe("resolveRecipeIngredients", () => {
  const receta = {
    ingredients: [
      { name: "Aceite de oliva", amount: 20, unit: "ml" },
      { name: "Ingrediente inventado 999", amount: 5, unit: "g" },
      { name: "Sal", unit: "g" },
    ],
  };

  it("conserva rawName, posición, cantidad y unidad", () => {
    const lines = resolveRecipeIngredients(receta);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      position: 0,
      rawName: "Aceite de oliva",
      amount: 20,
      unit: "ml",
      ingredientId: "aceite-oliva",
    });
    expect(lines[2].amount).toBeNull();
  });

  // El nombre canónico NO sustituye al de la receta: "Merluza o pescado
  // blanco" resuelve a `merluza` pero tiene que seguir leyéndose igual.
  it("nunca reemplaza el texto de la receta por el nombre canónico", () => {
    const [line] = resolveRecipeIngredients({
      ingredients: [{ name: "Merluza o pescado blanco", amount: 150, unit: "g" }],
    });
    expect(line.rawName).toBe("Merluza o pescado blanco");
    expect(line.ingredient.name).not.toBe(line.rawName);
  });

  it("deja ingredientId a null para lo desconocido, sin romperse", () => {
    const lines = resolveRecipeIngredients(receta);
    expect(lines[1].ingredientId).toBeNull();
    expect(lines[1].ingredient).toBeNull();
    expect(lines[1].rawName).toBe("Ingrediente inventado 999");
  });

  it("devuelve [] para una receta sin ingredientes o nula", () => {
    expect(resolveRecipeIngredients({})).toEqual([]);
    expect(resolveRecipeIngredients(null)).toEqual([]);
  });
});

describe("deriveRecipeAllergens", () => {
  it("deriva los alérgenos de los ingredientes", () => {
    const r = deriveRecipeAllergens({
      ingredients: [{ name: "Leche" }, { name: "Harina" }, { name: "Cebolla" }],
    });
    expect(r.allergens).toContain("leche");
    expect(r.allergens).toContain("gluten");
    expect(r.unknownNames).toEqual([]);
  });

  it("un alérgeno duro tapa el mismo alérgeno de cocinado", () => {
    // Las aceitunas llevan sulfitos duros; el vino los lleva de cocinado. Si
    // ya están de forma no evitable, el nivel de cocinado no aporta nada.
    const r = deriveRecipeAllergens({
      ingredients: [{ name: "Aceitunas negras" }, { name: "Vino blanco" }],
    });
    expect(r.allergens).toContain("sulfitos");
    expect(r.cookingAllergens).not.toContain("sulfitos");
  });

  // Contrato: mientras unknownNames no esté vacío, la lista es un MÍNIMO.
  it("reporta lo que no ha sabido identificar en vez de tragárselo", () => {
    const r = deriveRecipeAllergens({
      ingredients: [{ name: "Leche" }, { name: "Cosa rarísima 123" }],
    });
    expect(r.unknownNames).toEqual(["Cosa rarísima 123"]);
  });
});

// Fase 9: computeRecipeNutrition. El catálogo real no tiene nutrición BEDCA
// todavía (scripts/bedca-nutrition.mjs propone, no aplica solo), así que estos
// tests inyectan `nutrition` a mano sobre una fila real del catálogo
// compartido (ingredientById devuelve la MISMA referencia que usa el
// resolver) y la restauran a `null` después — nunca se deja septica para el
// resto de la suite.
describe("computeRecipeNutrition", () => {
  afterEach(() => {
    ingredientById.ajo.nutrition = null;
    ingredientById.perejil.nutrition = null;
  });

  it("devuelve null si servings no es válido", () => {
    ingredientById.ajo.nutrition = { kcal100g: 100, protein100g: 5, carbs100g: 10, fat100g: 1, fiber100g: null, sugar100g: null, saturatedFat100g: null, sodium100g: null };
    const recipe = { ingredients: [{ name: "Ajo", amount: 2, unit: "diente" }] };
    expect(computeRecipeNutrition(recipe, 0)).toBeNull();
    expect(computeRecipeNutrition(recipe, null)).toBeNull();
  });

  it("devuelve null cuando ningún ingrediente aporta nutrición (sin inventar nada)", () => {
    const recipe = { ingredients: [{ name: "Perejil", amount: 10, unit: "g" }] };
    expect(computeRecipeNutrition(recipe, 4)).toBeNull();
  });

  it("suma correctamente con cobertura total (un solo ingrediente, con nutrición)", () => {
    // 5g/diente (PIECE_WEIGHTS) × 4 dientes = 20g de un ingrediente a 100
    // kcal/100g → 20 kcal totales, entre 2 raciones = 10 kcal/ración.
    ingredientById.ajo.nutrition = {
      kcal100g: 100, protein100g: 20, carbs100g: 10, fat100g: 5,
      fiber100g: 2, sugar100g: 1, saturatedFat100g: 0.5, sodium100g: 50,
    };
    const recipe = { ingredients: [{ name: "Ajo", amount: 4, unit: "diente" }] };
    const r = computeRecipeNutrition(recipe, 2);
    expect(r.kcal).toBeCloseTo(10, 0);
    expect(r.protein_g).toBeCloseTo(2, 1);
    expect(r.fiber_g).toBeCloseTo(0.2, 1);
    expect(r.coverage).toBe(1);
  });

  it("cobertura parcial: un ingrediente sin nutrición cuenta en el peso total pero no en el cubierto", () => {
    ingredientById.ajo.nutrition = {
      kcal100g: 100, protein100g: 20, carbs100g: 10, fat100g: 5,
      fiber100g: null, sugar100g: null, saturatedFat100g: null, sodium100g: null,
    };
    // Ajo: 4 dientes × 5g = 20g (con nutrición). Perejil: 20g (sin nutrición).
    const recipe = {
      ingredients: [
        { name: "Ajo", amount: 4, unit: "diente" },
        { name: "Perejil", amount: 20, unit: "g" },
      ],
    };
    const r = computeRecipeNutrition(recipe, 1);
    expect(r).not.toBeNull();
    expect(r.coverage).toBeCloseTo(0.5, 2); // 20g cubiertos de 40g totales
  });

  it("un ingrediente en unidad cualitativa (al gusto/pizca) no cuenta ni en el peso total ni en el cubierto", () => {
    ingredientById.ajo.nutrition = {
      kcal100g: 100, protein100g: 20, carbs100g: 10, fat100g: 5,
      fiber100g: null, sugar100g: null, saturatedFat100g: null, sodium100g: null,
    };
    const recipe = {
      ingredients: [
        { name: "Ajo", amount: 4, unit: "diente" },
        { name: "Sal", unit: "al gusto" },
      ],
    };
    const r = computeRecipeNutrition(recipe, 1);
    // La sal queda totalmente fuera de la cuenta -> cobertura sigue siendo 1
    // (100% de lo que SÍ se pudo pesar tenía nutrición), no una fracción rara.
    expect(r.coverage).toBe(1);
  });
});

// Vocabulario UE (catálogo de ingredientes) → histórico (recipes.allergens).
const A_SCHEMA = {
  crustaceos: "marisco",
  huevos: "huevo",
  leche: "lactosa",
  frutos_cascara: "frutos_secos",
};

describe("coherencia entre los ingredientes y lo que declara cada receta", () => {
  // LA invariante de seguridad del proyecto: si un ingrediente delata un
  // alérgeno, la receta tiene que declararlo. Es lo que arreglaron los 63
  // hallazgos aplicados con scripts/apply-allergen-findings.mjs, y esto impide
  // que vuelva a abrirse el hueco al añadir recetas.
  //
  // Solo mira el nivel DURO: los de cocinado (vino, vinagre) son un segundo
  // nivel deliberado que a propósito no se declara.
  it("todo alérgeno duro derivado de los ingredientes está declarado", () => {
    const fallos = [];
    for (const recipe of recipeCatalog) {
      const declared = new Set(recipe.allergens ?? []);
      for (const id of deriveRecipeAllergens(recipe).allergens) {
        const schemaId = A_SCHEMA[id] ?? id;
        if (!declared.has(schemaId)) {
          fallos.push(`${recipe.id} "${recipe.name}" no declara ${schemaId}`);
        }
      }
    }
    expect(fallos).toEqual([]);
  });
});

describe("sustituciones (Fase 3)", () => {
  // LA comprobación que no se puede romper. Un producto "sin lactosa" conserva
  // la proteína láctea: vale para la INTOLERANCIA y no vale para la ALERGIA a
  // la leche. Si algún día se colara un id de alérgeno en `restriction`, la app
  // ofrecería a un alérgico un plato que le sienta mal, y sin ningún error
  // visible por el camino.
  it("ninguna sustitución está asociada a un alérgeno, solo a intolerancias", () => {
    const ALERGENOS = new Set([
      "gluten", "crustaceos", "huevos", "pescado", "cacahuetes", "soja", "leche",
      "frutos_cascara", "apio", "mostaza", "sesamo", "sulfitos", "altramuces", "moluscos",
    ]);
    const malas = ingredientSubstitutions.filter((s) => ALERGENOS.has(s.restriction));
    expect(malas).toEqual([]);
  });

  it("solo usa restricciones adaptables conocidas", () => {
    for (const s of ingredientSubstitutions) {
      expect(["lactosa_fina", "alcohol_cocina"]).toContain(s.restriction);
    }
  });

  it("toda sustitución apunta a un ingrediente que existe", () => {
    for (const s of ingredientSubstitutions) {
      expect(ingredientById[s.ingredientId]).toBeTruthy();
    }
  });

  it("substitutionFor resuelve desde texto libre", () => {
    const s = substitutionFor("Nata líquida", "lactosa_fina");
    expect(s.replacementLabel).toBe("Nata para cocinar sin lactosa");
    expect(substitutionFor("Nata líquida", "alcohol_cocina")).toBeNull();
    expect(substitutionFor("Cosa inexistente", "lactosa_fina")).toBeNull();
  });

  // Los casos que las reglas por palabras clave de substitutions.js adaptan hoy
  // y que la curación deja fuera a propósito. Son bugs actuales, no omisiones.
  it("no inventa sustituciones que no existen en el súper", () => {
    // La leche de coco no lleva lactosa: no hay nada que sustituir.
    expect(substitutionFor("Leche de coco", "lactosa_fina")).toBeNull();
    // El alcohol del vinagre ya fermentó en ácido acético.
    expect(substitutionFor("Vinagre", "alcohol_cocina")).toBeNull();
    // No hay ron ni whisky sin alcohol equivalentes: la receta debe excluirse.
    expect(substitutionFor("Ron", "alcohol_cocina")).toBeNull();
    expect(substitutionFor("Whisky", "alcohol_cocina")).toBeNull();
  });

  it("sí cubre lo que sí es un producto real", () => {
    expect(substitutionFor("Leche", "lactosa_fina").replacementLabel).toBe("Leche sin lactosa");
    expect(substitutionFor("Vino blanco", "alcohol_cocina").replacementLabel)
      .toBe("Vino blanco sin alcohol");
    expect(substitutionFor("Cerveza", "alcohol_cocina").replacementLabel)
      .toBe("Cerveza sin alcohol");
  });
});

describe("planIngredientSubstitutions", () => {
  it("propone el cambio de las líneas que chocan", () => {
    const plan = planIngredientSubstitutions(
      { ingredients: [{ name: "Nata para cocinar" }, { name: "Cebolla" }] },
      "lactosa_fina",
    );
    expect(plan.swaps).toHaveLength(1);
    expect(plan.swaps[0]).toMatchObject({
      from: "Nata para cocinar",
      to: "Nata para cocinar sin lactosa",
      position: 0,
    });
    expect(plan.unsubstitutable).toEqual([]);
    expect(plan.blocked).toBe(false);
  });

  // Un solo ingrediente sin recambio invalida la adaptación entera, por muchos
  // otros que sí se puedan cambiar.
  //
  // El ejemplo era Mascarpone, hasta que el mascarpone tuvo recambio: hoy los
  // 11 ingredientes de `lactosa_fina` lo tienen, así que el caso hay que
  // buscarlo en alcohol_cocina. Y ahí no es un hueco pendiente, es la línea del
  // catálogo: los FERMENTADOS tienen versión sin alcohol de supermercado
  // (cava, cerveza, sidra, vino) y los DESTILADOS no. Un brandy 0,0 que
  // flambee y sepa a brandy no existe, así que la receta se excluye en vez de
  // adaptarse mintiendo.
  it("reporta los ingredientes sin recambio en vez de ignorarlos", () => {
    const plan = planIngredientSubstitutions(
      { ingredients: [{ name: "Vino blanco" }, { name: "Brandy" }] },
      "alcohol_cocina",
    );
    expect(plan.swaps.map((s) => s.from)).toEqual(["Vino blanco"]);
    expect(plan.unsubstitutable).toEqual(["Brandy"]);
  });

  // Misma regla que substitutions.js: si el conflicto solo vive en el nombre
  // del plato, no hay línea que renombrar y mantenerlo sería engañar.
  it("marca blocked cuando ningún ingrediente choca", () => {
    const plan = planIngredientSubstitutions(
      { name: "Batido de leche", ingredients: [{ name: "Cebolla" }] },
      "lactosa_fina",
    );
    expect(plan.blocked).toBe(true);
    expect(plan.swaps).toEqual([]);
  });
});

// Fase 4: variantes regionales/calificadas de un ingrediente que SÍ está en el
// catálogo. Probado contra 88 ingredientes de cocina casera real (offal,
// pescados regionales, quesos DOP, especias, cocina asiática): un 23% de ellos
// eran exactamente este caso — la base ya existe, solo faltaba reconocer el
// calificativo. Los 20 casos de abajo son los que se identificaron en esa
// medición.
describe("resolución de variantes regionales/calificadas (Fase 4)", () => {
  const casos = [
    ["Pimentón de la Vera agridulce", "pimenton"],
    ["Azafrán de la Mancha", "azafran"],
    ["Nata montada", "nata"],
    ["Nata montada en spray", "nata"],
    ["Chocolate negro 70%", "chocolate"],
    ["Aceite de oliva picual", "aceite-oliva"],
    ["Alcachofa de Tudela", "alcachofa"],
    ["Vinagre de Módena reserva", "vinagre-balsamico"],
    ["Miel de romero", "miel"],
    ["Sal de Ibiza", "sal"],
    ["Repollo lombardo", "repollo"],
    ["Granada mollar", "granada"],
    ["Higo chumbo", "higo"],
    ["Conejo de monte", "conejo"],
    ["Bacalao skrei", "bacalao"],
    ["Queso crema light", "queso-crema"],
    ["Garbanzo pedrosillano", "garbanzos"],
    ["Espárrago blanco de Navarra", "esparragos"],
    ["Pasta de curry rojo", "pasta"],
    ["Leche de coco light", "leche-coco"],
  ];

  it.each(casos)("%s → %s", (nombre, esperado) => {
    expect(resolveIngredientId(nombre)).toBe(esperado);
  });

  // La razón de ser del recorte por el final y no por el principio: en
  // español el calificativo va detrás del nombre base. Si se recortara por
  // delante, "Leche de coco" perdería "coco" (la palabra que la distingue de
  // la leche normal) antes de perder "light" (el calificativo real).
  it("nunca recorta más de lo necesario — no confunde un ingrediente con otro parecido", () => {
    expect(resolveIngredientId("Leche de coco")).toBe("leche-coco");
    expect(resolveIngredientId("Leche de coco light")).toBe("leche-coco");
    expect(resolveIngredientId("Leche")).toBe("leche");
  });

  // Huecos reales del catálogo (no están, ni con alias): el recorte no debe
  // inventarse una resolución solo porque la primera palabra coincide con
  // algo genérico.
  it("no inventa una resolución para un hueco real del catálogo", () => {
    expect(resolveIngredientId("Queso de Cabrales")).toBeNull();
    expect(resolveIngredientId("Callos")).toBeNull();
    expect(resolveIngredientId("Za'atar")).toBeNull();
  });
});

describe("señales de dieta", () => {
  it("marca correctamente carne, lácteo y verdura", () => {
    expect(resolveIngredient("Pechuga de pollo").isVegetarian).toBe(false);
    const leche = resolveIngredient("Leche");
    expect(leche.isVegetarian).toBe(true);
    expect(leche.isVegan).toBe(false);
    const cebolla = resolveIngredient("Cebolla");
    expect(cebolla.isVegetarian).toBe(true);
    expect(cebolla.isVegan).toBe(true);
  });

  it("nunca marca vegano sin vegetariano", () => {
    const malos = ingredientCatalog.filter((i) => i.isVegan && !i.isVegetarian);
    expect(malos).toEqual([]);
  });
});
