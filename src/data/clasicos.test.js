import { describe, it, expect } from "vitest";
import { recipeCatalogById } from "./recipeCatalog.js";
import { PAPELES_DE_HUECO } from "./recipeSchema.js";
import manifest from "../assets/dishes/dishImages.json";
import { CLASICOS, esClasico } from "./clasicos.js";

describe("los clásicos de casa (clasicos.json)", () => {
  it("hay una tanda que elegir", () => {
    // Suelo, no la cifra: añadir clásicos no debe romperlo.
    expect(CLASICOS.length).toBeGreaterThanOrEqual(40);
  });

  it("ninguno repetido", () => {
    expect(CLASICOS.filter((id, i) => CLASICOS.indexOf(id) !== i)).toEqual([]);
  });

  it("todos están en el catálogo que leen la pizarra y el recetario", () => {
    // Las de guarniciones.json no entran en recipeCatalog: un id de ahí
    // desaparecería del paso sin que nadie se entere.
    expect(CLASICOS.filter((id) => !recipeCatalogById[id])).toEqual([]);
  });

  it("todos tienen foto", () => {
    expect(CLASICOS.filter((id) => !manifest[id])).toEqual([]);
  });

  it("todos caben en una comida o una cena", () => {
    const fuera = CLASICOS.filter((id) => !(recipeCatalogById[id]?.mealRole ?? []).some((p) => PAPELES_DE_HUECO.includes(p)));
    expect(fuera).toEqual([]);
  });

  it("esClasico reconoce la receta por su id", () => {
    expect(esClasico(recipeCatalogById[CLASICOS[0]])).toBe(true);
    expect(esClasico({ id: "no_existe" })).toBe(false);
    expect(esClasico(null)).toBe(false);
  });
});
