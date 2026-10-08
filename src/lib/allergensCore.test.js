import { describe, it, expect } from "vitest";
import { recipeIngredientIdsHitFreeAllergy } from "./allergensCore.js";

const receta = (ingredientId) => [{ name: "x", ingredientId }];

// Resolutor de mentira: unitaria y rápida, sin cargar el catálogo real (eso
// se prueba de verdad en alergiasLibres.seguridad.test.js, a través de
// recipeViolatesHardSafety con el resolutor real).
const resolutorDePrueba = (texto) => {
  const t = texto.toLowerCase();
  if (t.includes("brocoli") || t.includes("brócoli")) return "brocoli";
  if (t.includes("judía") || t.includes("judia")) return t.includes("verde") ? "judia-verde" : null;
  return null;
};

describe("recipeIngredientIdsHitFreeAllergy (nivel 2 de alergias libres)", () => {
  it("una alergia con calificativo resuelve igual que resolveIngredientId: «Brócoli al vapor» encuentra «brocoli»", () => {
    expect(recipeIngredientIdsHitFreeAllergy(["Brócoli al vapor"], receta("brocoli"), resolutorDePrueba)).toBe(true);
    expect(recipeIngredientIdsHitFreeAllergy(["Brócoli al vapor"], receta("zanahoria"), resolutorDePrueba)).toBe(false);
  });

  it("«Judías verdes finas» resuelve a «judia-verde», no a cualquier judía", () => {
    expect(recipeIngredientIdsHitFreeAllergy(["Judías verdes finas"], receta("judia-verde"), resolutorDePrueba)).toBe(true);
    expect(recipeIngredientIdsHitFreeAllergy(["Judías verdes finas"], receta("alubias-secas"), resolutorDePrueba)).toBe(false);
  });

  it("una categoría sin ingrediente propio («Marisco») no resuelve nada: ni falso positivo ni falso negativo inventado", () => {
    expect(recipeIngredientIdsHitFreeAllergy(["Marisco"], receta("gambas"), resolutorDePrueba)).toBe(false);
  });

  it("un alérgeno de los 14 UE no pasa por aquí: lo cubre el campo declarado, no se resuelve dos veces", () => {
    expect(recipeIngredientIdsHitFreeAllergy(["Gluten"], receta("pan"), resolutorDePrueba)).toBe(false);
  });

  it("sin resolutor es un error de programación, no un «false» que deje pasar una alergia", () => {
    expect(() => recipeIngredientIdsHitFreeAllergy(["Brócoli"], receta("brocoli"), null)).toThrow(TypeError);
    expect(() => recipeIngredientIdsHitFreeAllergy(["Brócoli"], receta("brocoli"))).toThrow(TypeError);
  });

  it("sin receta o sin alergias, no hay nada que comprobar (nunca un falso positivo por falta de datos)", () => {
    expect(recipeIngredientIdsHitFreeAllergy([], receta("brocoli"), resolutorDePrueba)).toBe(false);
    expect(recipeIngredientIdsHitFreeAllergy(["Brócoli"], [], resolutorDePrueba)).toBe(false);
    expect(recipeIngredientIdsHitFreeAllergy(["Brócoli"], undefined, resolutorDePrueba)).toBe(false);
  });
});
