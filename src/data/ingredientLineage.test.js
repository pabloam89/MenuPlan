import { describe, it, expect } from "vitest";
import ingredients from "./ingredients.json" with { type: "json" };
import lineage from "./ingredientLineage.json" with { type: "json" };
import {
  IngredientLineageSchema,
  FUENTE_BIOLOGICA_IDS,
  alergenosHeredados,
} from "./ingredientLineageSchema.js";

const idsCatalogo = new Set((Array.isArray(ingredients) ? ingredients : Object.values(ingredients).flat()).map((i) => i.id));

describe("ingredientLineage", () => {
  it("cumple el esquema", () => {
    expect(() => IngredientLineageSchema.parse(lineage)).not.toThrow();
  });

  it("tiene exactamente un id por ingrediente del catálogo, sin huecos ni inventados", () => {
    const idsLineage = new Set(lineage.items.map((i) => i.id));
    expect(idsLineage.size).toBe(lineage.items.length);
    expect([...idsLineage].sort()).toEqual([...idsCatalogo].sort());
  });

  it("todo origen de tipo «ingrediente» existe en el catálogo", () => {
    const rotos = lineage.items
      .flatMap((i) => i.origenes ?? [])
      .filter((o) => o.tipo === "ingrediente" && !idsCatalogo.has(o.id));
    expect(rotos).toEqual([]);
  });

  it("todo origen de tipo «fuente» está en el vocabulario cerrado", () => {
    const rotos = lineage.items
      .flatMap((i) => i.origenes ?? [])
      .filter((o) => o.tipo === "fuente" && !FUENTE_BIOLOGICA_IDS.includes(o.id));
    expect(rotos).toEqual([]);
  });

  it("un «simple» o «compuesto» no lleva origenes ni alérgenos heredados", () => {
    for (const i of lineage.items.filter((i) => i.clase !== "derivado")) {
      expect(i.origenes).toBeUndefined();
      expect(i.heredaAlergenos).toBeUndefined();
    }
  });

  it("alergenosHeredados sigue la cadena (aceite de sésamo hereda sésamo)", () => {
    const porId = new Map(lineage.items.map((i) => [i.id, i]));
    expect(alergenosHeredados("aceite-de-sesamo", porId)).toContain("sesamo");
  });

  it("un «simple» no hereda nada (no tiene de dónde)", () => {
    const porId = new Map(lineage.items.map((i) => [i.id, i]));
    const simple = lineage.items.find((i) => i.clase === "simple");
    expect(alergenosHeredados(simple.id, porId)).toEqual([]);
  });
});
