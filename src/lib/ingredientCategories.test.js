import { describe, it, expect } from "vitest";
import { guessShoppingAisle, ingredientStem, normalizeIngredientKey } from "./ingredientCategories.js";

// Regression guard for a 2026-07-23 audit: several short fruit stems in the
// "Frutas" regex ("pera", "mora", "piña") were matched as bare substrings
// with no word boundary, so they silently fired on completely unrelated
// ingredients that happen to contain those same letters mid-word —
// "eMPERAdor" (swordfish), "cebolla moRAda" (red onion), "esPIñAcas"
// (spinach). Found while investigating why "Pitaya" (missing from the list
// entirely) fell back to "Verduras" instead of "Frutas".
describe("guessShoppingAisle", () => {
  it("classifies real fruit as Frutas, including ones missing before this pass", () => {
    expect(guessShoppingAisle("Pitaya")).toBe("Frutas");
    expect(guessShoppingAisle("Moras")).toBe("Frutas");
    expect(guessShoppingAisle("Cerezas")).toBe("Frutas");
    expect(guessShoppingAisle("Pera")).toBe("Frutas");
    expect(guessShoppingAisle("Piña")).toBe("Frutas");
  });

  it("does not let 'pera'/'mora'/'piña' hijack unrelated ingredients that merely contain those letters mid-word", () => {
    expect(guessShoppingAisle("Rodajas de emperador")).toBe("Pescado");
    expect(guessShoppingAisle("Cebolla morada")).not.toBe("Frutas");
    expect(guessShoppingAisle("Espinacas")).not.toBe("Frutas");
    expect(guessShoppingAisle("Espinacas frescas")).not.toBe("Frutas");
  });

  it("classifies pasta shapes as 'Pasta y arroz', including 'lasaña' (the accented regex never matched after accent-stripping normalization)", () => {
    expect(guessShoppingAisle("Placas de lasaña")).toBe("Pasta y arroz");
    expect(guessShoppingAisle("Fusilli")).toBe("Pasta y arroz");
    expect(guessShoppingAisle("Penne")).toBe("Pasta y arroz");
    expect(guessShoppingAisle("Tirabuzones")).toBe("Pasta y arroz");
    expect(guessShoppingAisle("Lacitos")).toBe("Pasta y arroz");
  });

  it("classifies dry beans as Legumbres, distinct from fresh green beans", () => {
    expect(guessShoppingAisle("Judiones")).toBe("Legumbres");
    expect(guessShoppingAisle("Judías pintas")).toBe("Legumbres");
    expect(guessShoppingAisle("Garrofón")).toBe("Legumbres");
    expect(guessShoppingAisle("Fabes")).toBe("Legumbres");
  });

  // 2026-08-11 shopping-aisle audit (from real menus):
  //  - "Romero" fell into Pescado because the fish token "mero" matched it as a
  //    bare substring (ro-MERO). Now `\bmero\b`-bounded.
  //  - "Pan de hamburguesa" landed in Carne (the "hamburgues" token) instead of
  //    Panadería. Buns are now caught by a dedicated bread rule that runs first.
  //  - "Ajo en polvo" fell through to the Verduras default; garlic/onion powder
  //    are spices, not fresh produce.
  it("shelves herbs as Especias even when they contain a fish token substring", () => {
    expect(guessShoppingAisle("Romero")).toBe("Especias");
    expect(guessShoppingAisle("Romero fresco")).toBe("Especias");
    expect(guessShoppingAisle("Mero")).toBe("Pescado"); // the real fish still works
  });

  it("shelves burger/hot-dog buns and breadcrumbs as Panadería, not Carne", () => {
    expect(guessShoppingAisle("Pan de hamburguesa")).toBe("Panadería");
    expect(guessShoppingAisle("Pan de perrito")).toBe("Panadería");
    expect(guessShoppingAisle("Pan rallado")).toBe("Panadería");
    expect(guessShoppingAisle("Hamburguesas")).toBe("Carne"); // the meat still works
  });

  it("shelves powdered garlic/onion as Especias, not fresh Verduras", () => {
    expect(guessShoppingAisle("Ajo en polvo")).toBe("Especias");
    expect(guessShoppingAisle("Cebolla en polvo")).toBe("Especias");
    expect(guessShoppingAisle("Ajo")).toBe("Verduras"); // fresh garlic stays produce
  });

  it("shelves named cheeses even when the word 'queso' is missing", () => {
    expect(guessShoppingAisle("Roquefort")).toBe("Lácteos");
    expect(guessShoppingAisle("Camembert")).toBe("Lácteos");
    expect(guessShoppingAisle("Brie")).toBe("Lácteos");
    expect(guessShoppingAisle("Halloumi")).toBe("Lácteos");
    expect(guessShoppingAisle("Queso fresco")).toBe("Lácteos");
    expect(guessShoppingAisle("Edamame")).not.toBe("Lácteos");
  });

  it("shelves named breads even when they are not 'pan de …'", () => {
    expect(guessShoppingAisle("Baguette")).toBe("Panadería");
    expect(guessShoppingAisle("Pan rústico")).toBe("Panadería");
    expect(guessShoppingAisle("Mollete")).toBe("Panadería");
    expect(guessShoppingAisle("Hogaza")).toBe("Panadería");
    expect(guessShoppingAisle("Focaccia")).toBe("Panadería");
  });
});

describe("ingredientStem", () => {
  it("collapses vowel-stem plurals (add -s)", () => {
    expect(ingredientStem("Tomate")).toBe(ingredientStem("Tomates"));
    expect(ingredientStem("Huevo")).toBe(ingredientStem("Huevos"));
    expect(ingredientStem("Judía verde")).toBe(ingredientStem("Judías verdes"));
    expect(ingredientStem("Espinaca")).toBe(ingredientStem("Espinacas"));
    expect(ingredientStem("Alcachofa")).toBe(ingredientStem("Alcachofas"));
    expect(ingredientStem("Guisante")).toBe(ingredientStem("Guisantes"));
    expect(ingredientStem("Fideo")).toBe(ingredientStem("Fideos"));
    expect(ingredientStem("Pimientos rojos")).toBe(ingredientStem("Pimiento rojo"));
    expect(ingredientStem("Alubia blanca")).toBe(ingredientStem("Alubias blancas"));
  });

  it("collapses consonant-stem plurals (add -es), including ones the first pass missed", () => {
    expect(ingredientStem("Limón")).toBe(ingredientStem("Limones"));
    expect(ingredientStem("Calamar")).toBe(ingredientStem("Calamares"));
    expect(ingredientStem("Yogur")).toBe(ingredientStem("Yogures"));
    expect(ingredientStem("Laurel")).toBe(ingredientStem("Laureles"));
    expect(ingredientStem("Perejil")).toBe(ingredientStem("Perejiles"));
    expect(ingredientStem("Azúcar")).toBe(ingredientStem("Azúcares"));
    expect(ingredientStem("Pan")).toBe(ingredientStem("Panes"));
    expect(ingredientStem("Champiñón")).toBe(ingredientStem("Champiñones"));
    expect(ingredientStem("Mejillón")).toBe(ingredientStem("Mejillones"));
    expect(ingredientStem("Piñón")).toBe(ingredientStem("Piñones"));
  });

  it("collapses -z plurals (nuez→nueces, arroz→arroces)", () => {
    expect(ingredientStem("Nueces")).toBe(ingredientStem("Nuez"));
    expect(ingredientStem("Arroz")).toBe(ingredientStem("Arroces"));
  });

  it("does not treat 'coles de Bruselas' as the same product as 'col'", () => {
    expect(ingredientStem("Coles de Bruselas")).not.toBe(ingredientStem("Col"));
    expect(ingredientStem("Coles de Bruselas")).toBe(ingredientStem("Col de Bruselas"));
  });

  it("strips freshness, cut and size words that do not change the product", () => {
    expect(ingredientStem("Espinacas")).toBe(ingredientStem("Espinacas frescas"));
    expect(ingredientStem("Espinacas")).toBe(ingredientStem("Espinacas baby"));
    expect(ingredientStem("Albahaca")).toBe(ingredientStem("Albahaca fresca"));
    expect(ingredientStem("Cilantro")).toBe(ingredientStem("Cilantro fresco"));
    expect(ingredientStem("Tomate")).toBe(ingredientStem("Tomate maduro"));
    expect(ingredientStem("Tomate")).toBe(ingredientStem("Tomate natural"));
    expect(ingredientStem("Dorada")).toBe(ingredientStem("Dorada entera"));
    expect(ingredientStem("Trucha")).toBe(ingredientStem("Truchas enteras"));
    expect(ingredientStem("Gambas")).toBe(ingredientStem("Gambas peladas"));
    expect(ingredientStem("Pollo")).toBe(ingredientStem("Pollo troceado"));
    expect(ingredientStem("Patata")).toBe(ingredientStem("Patata grande"));
    expect(ingredientStem("Setas")).toBe(ingredientStem("Setas variadas"));
    expect(ingredientStem("Almendras")).toBe(ingredientStem("Almendras crudas"));
    expect(ingredientStem("Bacalao")).toBe(ingredientStem("Bacalao desalado"));
    expect(ingredientStem("Huevo")).toBe(ingredientStem("Huevo cocido"));
    expect(ingredientStem("Garbanzos")).toBe(ingredientStem("Garbanzos cocidos"));
    expect(ingredientStem("Espárrago")).toBe(ingredientStem("Espárragos trigueros"));
    expect(ingredientStem("Merluza")).toBe(ingredientStem("Merluza en rodajas"));
    expect(ingredientStem("Merluza")).toBe(ingredientStem("Merluza en lomos"));
    expect(ingredientStem("Aceite de oliva")).toBe(ingredientStem("Aceite de oliva virgen extra"));
    expect(ingredientStem("Salchicha")).toBe(ingredientStem("Salchichas frescas"));
    expect(ingredientStem("Pan")).toBe(ingredientStem("Pan del día anterior"));
  });

  it("treats nº / n° as the same mark so fideo numbers collapse", () => {
    expect(ingredientStem("Fideo nº2")).toBe(ingredientStem("Fideos n°2"));
  });

  it("keeps distinct products that only look like variants", () => {
    expect(ingredientStem("Ajo")).not.toBe(ingredientStem("Ajo en polvo"));
    expect(ingredientStem("Cilantro")).not.toBe(ingredientStem("Cilantro en grano"));
    expect(ingredientStem("Tomate")).not.toBe(ingredientStem("Tomate cherry"));
    expect(ingredientStem("Tomate")).not.toBe(ingredientStem("Tomate triturado"));
    expect(ingredientStem("Atún")).not.toBe(ingredientStem("Atún en conserva"));
    expect(ingredientStem("Salmón")).not.toBe(ingredientStem("Salmón ahumado"));
    expect(ingredientStem("Queso fresco")).not.toBe(ingredientStem("Queso rallado"));
    expect(ingredientStem("Queso fresco")).not.toBe(ingredientStem("Queso"));
    expect(ingredientStem("Roquefort")).not.toBe(ingredientStem("Camembert"));
    expect(ingredientStem("Roquefort")).not.toBe(ingredientStem("Queso fresco"));
    expect(ingredientStem("Queso tierno")).not.toBe(ingredientStem("Queso fresco"));
    expect(ingredientStem("Baguette")).not.toBe(ingredientStem("Pan rústico"));
    expect(ingredientStem("Baguette")).not.toBe(ingredientStem("Pan"));
    expect(ingredientStem("Pan rústico")).not.toBe(ingredientStem("Hogaza"));
    expect(ingredientStem("Judías")).not.toBe(ingredientStem("Judía verde"));
    expect(ingredientStem("Lentejas")).not.toBe(ingredientStem("Lentejas rojas"));
    expect(ingredientStem("Cuscús")).toBe("cuscus");
  });

  it("keeps short words like sal and pan intact", () => {
    expect(ingredientStem("Sal")).toBe("sal");
    expect(ingredientStem("Pan")).toBe("pan");
  });

  it("merges shopping rows of singular/plural of the same product", () => {
    expect(normalizeIngredientKey("Tomates", "ud")).toBe(normalizeIngredientKey("Tomate", "ud"));
    expect(normalizeIngredientKey("Limones", "ud")).toBe(normalizeIngredientKey("Limón", "ud"));
    expect(normalizeIngredientKey("Calamares", "ud")).toBe(normalizeIngredientKey("Calamar", "ud"));
    expect(normalizeIngredientKey("Judías verdes", "g")).toBe(normalizeIngredientKey("Judía verde", "g"));
  });
});
