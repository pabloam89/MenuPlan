import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  availablePartsOf,
  stepsByPart,
  ingredientsByPart,
  findIngredientForMarker,
  STEP_PARTS,
} from "./recipeSteps.js";

// carnes_045 "Entraña a la brasa con chimichurri" es el caso real que motivó
// este desglose: salsa (chimichurri) hecha aparte, principal (la carne) y un
// paso de combinado (emplatar). No usa "guarnicion" — availablePartsOf no debe
// inventarla.
const CHIMICHURRI_STEPS = [
  { text: "Picar {{Ajo}} y {{Perejil}} muy finos.", minutes: 3, kind: "prep", part: "salsa" },
  { text: "Mezclar con {{Aceite de oliva}} y vinagre para el chimichurri.", minutes: 2, kind: "prep", part: "salsa" },
  { text: "Hacer la {{Entraña}} a la brasa hasta el punto deseado.", minutes: 6, kind: "activo", part: "principal" },
  { text: "Servir la entraña con el chimichurri por encima.", minutes: 1, kind: "emplatado", part: "combinado" },
];

const CHIMICHURRI_INGREDIENTS = [
  { id: "ing_ajo", name: "Ajo" },
  { id: "ing_perejil", name: "Perejil" },
  { id: "ing_aceite", name: "Aceite de oliva" },
  { id: "ing_entrana", name: "Entraña" },
];

describe("availablePartsOf", () => {
  it("devuelve vacío cuando ningún paso usa `part` (la inmensa mayoría de recetas)", () => {
    const steps = [
      { text: "Cortar la cebolla.", minutes: 5, kind: "prep" },
      { text: "Sofreír a fuego medio.", minutes: 10, kind: "activo" },
    ];
    expect(availablePartsOf(steps)).toEqual([]);
  });

  it("recoge los valores de `part` en el orden en que aparecen, sin duplicados", () => {
    expect(availablePartsOf(CHIMICHURRI_STEPS)).toEqual(["salsa", "principal", "combinado"]);
  });

  it("nunca inventa una `part` que ningún paso declaró", () => {
    expect(availablePartsOf(CHIMICHURRI_STEPS)).not.toContain("guarnicion");
  });

  it("ignora valores de `part` fuera de STEP_PARTS", () => {
    const steps = [{ text: "Paso raro.", minutes: 1, kind: "prep", part: "postre" }];
    expect(availablePartsOf(steps)).toEqual([]);
  });
});

describe("stepsByPart", () => {
  it("devuelve {} cuando la receta no usa `part`", () => {
    const steps = [{ text: "Cortar la cebolla.", minutes: 5, kind: "prep" }];
    expect(stepsByPart(steps)).toEqual({});
  });

  it("agrupa cada paso bajo su `part`", () => {
    const grouped = stepsByPart(CHIMICHURRI_STEPS);
    expect(grouped.salsa).toHaveLength(2);
    expect(grouped.principal).toHaveLength(1);
    expect(grouped.combinado).toHaveLength(1);
    expect(grouped.guarnicion).toBeUndefined();
  });

  it("un paso sin `part`, en una receta que sí usa el eje, cae en principal y no se pierde", () => {
    const steps = [
      ...CHIMICHURRI_STEPS,
      { text: "Precalentar la brasa.", minutes: 10, kind: "espera" },
    ];
    const grouped = stepsByPart(steps);
    expect(grouped.principal).toHaveLength(2);
    expect(grouped.principal.some((s) => s.text === "Precalentar la brasa.")).toBe(true);
  });
});

describe("ingredientsByPart", () => {
  it("devuelve {} cuando la receta no usa `part`", () => {
    const steps = [{ text: "Cortar {{Ajo}}.", minutes: 5, kind: "prep" }];
    expect(ingredientsByPart(steps, CHIMICHURRI_INGREDIENTS)).toEqual({});
  });

  it("reparte cada ingrediente según la `part` del paso donde lleva su marcador", () => {
    const grouped = ingredientsByPart(CHIMICHURRI_STEPS, CHIMICHURRI_INGREDIENTS);
    expect(grouped.salsa.map((i) => i.id).sort()).toEqual(["ing_ajo", "ing_aceite", "ing_perejil"].sort());
    expect(grouped.principal.map((i) => i.id)).toEqual(["ing_entrana"]);
    expect(grouped.combinado).toBeUndefined();
  });

  it("un ingrediente sin marcador en ningún paso cae en principal, nunca desaparece", () => {
    const ingredients = [...CHIMICHURRI_INGREDIENTS, { id: "ing_sal", name: "Sal" }];
    const grouped = ingredientsByPart(CHIMICHURRI_STEPS, ingredients);
    const allIds = STEP_PARTS.flatMap((p) => (grouped[p] ?? []).map((i) => i.id));
    expect(allIds).toContain("ing_sal");
    expect(grouped.principal.some((i) => i.id === "ing_sal")).toBe(true);
  });

  // El JSON del catálogo no trae `id` en los ingredientes (lo fabrica
  // catalogToFrontendRecipe como slug del nombre). Agrupando por `id`, todos
  // valían `undefined`, colisionaban en la misma clave y la lista entera caía
  // en una sola parte sin que nada fallara. Se agrupa por el propio objeto.
  it("reparte igual aunque los ingredientes vengan crudos del JSON, sin `id`", () => {
    const ingredients = CHIMICHURRI_INGREDIENTS.map(({ name }) => ({ name }));
    const grouped = ingredientsByPart(CHIMICHURRI_STEPS, ingredients);
    expect(grouped.salsa.map((i) => i.name).sort()).toEqual(
      CHIMICHURRI_INGREDIENTS.filter((i) => i.id !== "ing_entrana").map((i) => i.name).sort(),
    );
    expect(grouped.principal.map((i) => i.name)).toEqual(["Entraña"]);
  });

  it("no cuenta dos veces un ingrediente cuyo nombre aparece en texto plano tras su primer marcador", () => {
    const steps = [
      { text: "Picar {{Ajo}} fino.", minutes: 2, kind: "prep", part: "salsa" },
      { text: "Añadir el ajo picado a la sartén.", minutes: 1, kind: "activo", part: "principal" },
    ];
    const ingredients = [{ id: "ing_ajo", name: "Ajo" }];
    const grouped = ingredientsByPart(steps, ingredients);
    expect(grouped.salsa).toEqual([{ id: "ing_ajo", name: "Ajo" }]);
    expect(grouped.principal).toBeUndefined();
  });
});

// ── El catálogo real ────────────────────────────────────────────────────────
// Las dos suites de abajo miran los JSON de receta, no fixtures: son la red de
// seguridad de la pasada de `part` (scripts/enrich-recipe-steps.mjs --parts),
// que reparte los pasos YA escritos entre componentes. Lo que pinta la ficha no
// es `part` a secas, es lo que `ingredientsByPart` hace con ella, así que eso es
// lo que se pin-ea.
const RECIPES_DIR = fileURLToPath(new URL("../data/recipes/", import.meta.url));
const CATALOG = readdirSync(RECIPES_DIR)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(`${RECIPES_DIR}${f}`, "utf8")));
const LABELLED = CATALOG.filter((r) => (r.stepsRich ?? []).some((s) => s?.part));

// Los ingredientes del JSON traen `ingredientId` (la clave del catálogo de
// ingredientes); los que llegan a la ficha traen `id`, un slug del nombre que
// arma catalogToFrontendRecipe (lib/aiPlanner.js). ingredientsByPart agrupa por
// `id`, así que hay que darle la forma de la UI: pasarle el JSON crudo haría que
// todos los ingredientes compartieran `id: undefined` y cayeran en la misma
// parte, y el test pasaría sin probar nada.
const asFrontendIngredients = (r) => (r.ingredients ?? []).map((i) => ({
  id: i.name.toLowerCase().replace(/\s+/g, "-"),
  name: i.name,
}));

describe("regla mecánica: kind 'emplatado' → part 'combinado'", () => {
  it("hay recetas etiquetadas que mirar (si no, el resto de esta suite no prueba nada)", () => {
    expect(LABELLED.length).toBeGreaterThan(100);
  });

  it("ningún paso de emplatado lleva una `part` distinta de 'combinado'", () => {
    // Es la única parte del reparto que NO es un juicio: el emplatado junta lo
    // ya hecho, por definición. El script la aplica antes de llamar al modelo
    // (mechanicalParts) y vuelve a imponerla al escribir, para que una respuesta
    // que la contradiga no llegue al disco.
    const rebeldes = LABELLED.flatMap((r) => (r.stepsRich ?? [])
      .filter((s) => s.kind === "emplatado" && s.part && s.part !== "combinado")
      .map((s) => `${r.id}: ${s.part}`));
    expect(rebeldes).toEqual([]);
  });

  it("'combinado' solo aparece en pasos de emplatado o de junta, nunca suelto al principio", () => {
    // Un 'combinado' en el paso 0 querría decir que se junta antes de cocinar:
    // señal de que el modelo etiquetó al tuntún.
    const raros = LABELLED
      .filter((r) => r.stepsRich[0]?.part === "combinado")
      .map((r) => r.id);
    expect(raros).toEqual([]);
  });
});

describe("no regresión: el desglose de las recetas ya etiquetadas", () => {
  it("atribuye el 100 % de los ingredientes, sin perder ni duplicar ninguno", () => {
    const rotas = [];
    for (const r of LABELLED) {
      const ingredients = asFrontendIngredients(r);
      const grouped = ingredientsByPart(r.stepsRich, ingredients);
      const ids = STEP_PARTS.flatMap((p) => (grouped[p] ?? []).map((i) => i.id));
      const esperados = new Set(ingredients.map((i) => i.id));
      if (ids.length !== ingredients.length || new Set(ids).size !== esperados.size) {
        rotas.push(`${r.id}: ${ids.length} atribuidos de ${ingredients.length}`);
      }
    }
    expect(rotas).toEqual([]);
  });

  it("no pierde ningún paso al agrupar por componente", () => {
    const rotas = [];
    for (const r of LABELLED) {
      const grouped = stepsByPart(r.stepsRich);
      const total = STEP_PARTS.reduce((a, p) => a + (grouped[p]?.length ?? 0), 0);
      if (total !== r.stepsRich.length) rotas.push(`${r.id}: ${total} de ${r.stepsRich.length}`);
    }
    expect(rotas).toEqual([]);
  });

  it("toda receta con `part` declara al menos un componente y la ficha lo ve", () => {
    // NOTA: cinco recetas (carnes_115, carnes_122, legumbres_024,
    // pasta_arroces_080, pescados_026) declaran hoy UN SOLO valor de `part`.
    // Eso no es un desglose: la ficha saca una pestaña única. Es una de las
    // cosas que viene a arreglar la pasada --parts, que quita el `part` entero
    // cuando no hay ni 'salsa' ni 'guarnicion' (applyParts → isMono). Por eso
    // aquí se exige >= 1 y no >= 2: lo que se pin-ea es que availablePartsOf
    // nunca se quede vacío en una receta que sí tiene el campo escrito.
    const ciegas = LABELLED
      .filter((r) => availablePartsOf(r.stepsRich).length === 0)
      .map((r) => r.id);
    expect(ciegas).toEqual([]);
  });
});

describe("findIngredientForMarker", () => {
  it("resuelve por coincidencia exacta", () => {
    const found = findIngredientForMarker("Ajo", CHIMICHURRI_INGREDIENTS);
    expect(found?.id).toBe("ing_ajo");
  });

  it("resuelve variantes cortas por inclusión (aceite vs Aceite de oliva)", () => {
    const found = findIngredientForMarker("aceite", CHIMICHURRI_INGREDIENTS);
    expect(found?.id).toBe("ing_aceite");
  });

  it("devuelve null si no hay ingredientes o no hay coincidencia", () => {
    expect(findIngredientForMarker("Ajo", [])).toBeNull();
    expect(findIngredientForMarker("Zanahoria", CHIMICHURRI_INGREDIENTS)).toBeUndefined();
  });
});
