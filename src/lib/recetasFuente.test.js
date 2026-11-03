import { describe, it, expect } from "vitest";
import { CLAVES_EN_TABLAS_DE_RECETAS, sinRecetasDeTabla } from "./recetasFuente.js";
import { DATOS_CASA } from "./registroFicha.js";
import { datosDelMotor } from "./recetasDeLaCasa.js";

describe("las recetas de la casa viven en sus tablas (trozo 21)", () => {
  it("la lista sale del registro: las cinco de recetas con tabla, y ninguna otra", () => {
    expect([...CLAVES_EN_TABLAS_DE_RECETAS].sort()).toEqual(["discards", "recipeCollections", "recipeFolders", "recipeVotes", "userRecipes"]);
    for (const k of CLAVES_EN_TABLAS_DE_RECETAS) expect(DATOS_CASA[k].vive).toMatch(/^tabla:/);
  });

  it("el documento que se guarda no las lleva; lo demás, igual", () => {
    const data = { members: [{ id: "a" }], userRecipes: [{ id: "r" }], recipeFolders: [{ id: "f" }], recipeCollections: { favoritas: ["r"] }, recipeVotes: {}, discards: {} };
    expect(sinRecetasDeTabla(data)).toEqual({ members: [{ id: "a" }] });
    const sinNada = { members: [] };
    expect(sinRecetasDeTabla(sinNada)).toBe(sinNada);
  });

  it("el motor de Lola toma las propias de su tabla: una borrada que sigue en la copia del documento no vuelve (#958 G)", () => {
    const casa = { state: { data: { userRecipes: [{ id: "borrada" }, { id: "viva" }] } }, recetasPropias: [{ id: "viva" }], deLaCasa: null };
    expect(datosDelMotor(casa).userRecipes.map((r) => r.id)).toEqual(["viva"]);
    // Sin recetasPropias (casa de prueba o lectura vieja), como antes.
    expect(datosDelMotor({ state: { data: { userRecipes: [{ id: "x" }] } } }).userRecipes).toEqual([{ id: "x" }]);
  });
});
