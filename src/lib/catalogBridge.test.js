import { describe, expect, it } from "vitest";

import { RecipeSchema } from "../data/recipeSchema.js";
import { catalogToFrontendRecipe } from "./aiPlanner.js";
import { recipeCatalog } from "../data/recipeCatalog.js";

/**
 * EL SEGUNDO FUSIBLE: el puente del CATÁLOGO a la APP.
 *
 * `recipeRow.test.js` vigila el puente de Supabase (`rowToRecipe`). Este vigila
 * el otro, que nadie miraba: `catalogToFrontendRecipe` convierte una receta del
 * catálogo en el objeto que pinta la app, y por ahí pasa TODO lo que el
 * planificador coloca en un menú.
 *
 * El patrón de fallo es idéntico y ya ha ocurrido seis veces: alguien añade un
 * campo al catálogo, nadie toca el puente, y el campo se pierde EN SILENCIO
 * para todo plato que llegue por el menú. No hay excepción, ni log, ni test
 * rojo. Le pasó a `apetecible`, `montaje`, `estrella`, `occasion`,
 * `extraProteins` y —la última— al eje de las bases: `stepsRich` sí viajaba,
 * así que los pasos llegaban etiquetados con su base y nadie podía leerlos,
 * porque `mainBase` y `basesAparte` llegaban undefined. La vista Tanda salía
 * siempre vacía y nadie sabía por qué.
 */

const shapeOf = (schema) => schema.shape ?? schema._def?.schema?.shape;
const CAMPOS_DEL_SCHEMA = Object.keys(shapeOf(RecipeSchema));

/**
 * Lo que NO cruza el puente a propósito, cada uno con su razón. Añadir algo
 * aquí es una decisión que se toma a mano y se justifica, que es exactamente
 * lo que no pasó las seis veces anteriores.
 */
const NO_CRUZAN = {
  // El puente los TRADUCE a otro nombre o a otra forma, así que el campo del
  // catálogo no aparece tal cual pero su información sí llega.
  description: "se traduce a prepSummary",
  protein_g: "va dentro de macros.protein",
  carbs_g: "va dentro de macros.carbs",
  fat_g: "va dentro de macros.fat",
  mainProtein: "se traduce a iconType y entra en tags",
  mealRole: "se traduce a mealTypes",
  baseServings: "se traduce a servings (ya escalado a los comensales)",
  fiber_g: "va dentro de macros.fiber",
  sugar_g: "va dentro de macros.sugar",
  saturated_fat_g: "va dentro de macros.saturatedFat",
  sodium_mg: "va dentro de macros.sodium",
  // `type` del catálogo (completo/guarnicion/salsa/base) no es el `type` que
  // usa la app, que lo fabrica userRecipes para las recetas propias. Cruzarlo
  // pisaría ese otro significado.
  type: "otro `type` distinto del de userRecipes",
  // Ejes que solo usa el generador ANTES de elegir el plato: cuando la receta
  // llega a la app la decisión ya está tomada y nadie vuelve a preguntarlos.
  season: "filtro del generador, no se pinta",
  occasion: "filtro del generador, no se pinta",
  estrella: "filtro del generador (pool principal), no se pinta",
  apetecible: "sesgo del generador, no se pinta",
  kidFavourite: "sesgo del generador, no se pinta",
  sauceCompat: "del emparejamiento, que está apagado",
  canBeGarnish: "del emparejamiento, que está apagado",
  scalesWithEaters: "solo recetas propias, otro mapeador",
  baseDishId: "solo lo usa el catálogo para reclasificar",
  extraProteins: "lo lee validateMenu sobre el catálogo, no sobre el plato pintado",
  mainIngredients: "filtro del generador, no se pinta",
  tecnica: "filtro del generador, no se pinta",
  cocina: "filtro del generador, no se pinta",
  etapaBebe: "filtro del generador, no se pinta",
  effort: "filtro del generador, no se pinta",
  dessertKind: "filtro del generador, no se pinta",
  llevaSalsa: "sesgo del generador, no se pinta",
  montaje: "filtro del generador, no se pinta",
  sauceId: "del emparejamiento, que está apagado",
  productAliases: "solo para casar con productos de supermercado",
  // Solo en recetas `type: "base"`, que no pasan por el planificador: se leen
  // directas del catálogo en lib/bases.js.
  baseKey: "solo type:base, se lee del catálogo",
  rinde: "solo type:base",
  minutosFijos: "solo type:base",
  minutosPorRacion: "solo type:base",
  capacidadMax: "solo type:base",
  reactivacion: "solo type:base",
};

const UNA_RECETA = {
  ...recipeCatalog.find((r) => (r.basesAparte ?? []).length > 0 && r.stepsRich?.length),
};

describe("catalogToFrontendRecipe · el fusible del puente", () => {
  it("hay una receta del catálogo con la que probar", () => {
    expect(UNA_RECETA.id).toBeTruthy();
  });

  it("no pierde ningún campo del schema que no esté declarado como que no cruza", () => {
    // Se prueba sobre una receta REAL del catálogo y solo con los campos que
    // trae: un campo ausente en el origen no distingue "no mapeado" de "venía
    // vacío", así que reclamarlo daría un rojo que no significa nada.
    const completa = UNA_RECETA;
    const pintada = catalogToFrontendRecipe(completa, 4);
    const perdidos = CAMPOS_DEL_SCHEMA
      .filter((campo) => completa[campo] !== undefined)
      .filter((campo) => pintada[campo] === undefined)
      .filter((campo) => !(campo in NO_CRUZAN));

    expect(
      perdidos,
      `Estos campos existen en la receta del catálogo y NO llegan a la app: ${perdidos.join(", ")}.\n`
      + "Se pierden en silencio para todo plato que entre por el menú.\n"
      + "Mapéalos en catalogToFrontendRecipe, o declara por qué no cruzan en NO_CRUZAN.",
    ).toEqual([]);
  });

  it("la lista de excepciones no se pudre: todo lo que declara sigue en el schema", () => {
    const fantasmas = Object.keys(NO_CRUZAN).filter((c) => !CAMPOS_DEL_SCHEMA.includes(c));
    expect(
      fantasmas,
      `NO_CRUZAN nombra campos que ya no están en RecipeSchema: ${fantasmas.join(", ")}. Bórralos.`,
    ).toEqual([]);
  });

  // El caso concreto que se rompió, con nombre y apellidos: sin esto la vista
  // Tanda sale vacía siempre y la ficha nunca ofrece cocinar con la base hecha.
  it("el eje de las bases cruza entero", () => {
    const pintada = catalogToFrontendRecipe(UNA_RECETA, 4);
    expect(pintada.basesAparte).toEqual(UNA_RECETA.basesAparte);
    if (UNA_RECETA.mainBase) {
      expect(pintada.mainBase).toBe(UNA_RECETA.mainBase);
      expect(pintada.baseMode).toBe(UNA_RECETA.baseMode);
    }
    // Y los pasos siguen trayendo su etiqueta, que es la otra mitad.
    expect(pintada.stepsRich.some((p) => p.base)).toBe(true);
  });
});
