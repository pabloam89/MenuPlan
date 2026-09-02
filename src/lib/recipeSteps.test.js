import { describe, it, expect } from "vitest";
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
