import { describe, it, expect } from "vitest";
import { guessShoppingAisle } from "./ingredientCategories.js";

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
});
