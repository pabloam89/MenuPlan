import { describe, it, expect } from "vitest";
import { resolveRecipeAllergens, EU_ALLERGENS } from "./allergens.js";
import { resolveRecipeAllergens as delNucleo } from "./allergensCore.js";

/**
 * La UI pinta `<Icon>` de cada alérgeno. Del 3 al 7 oct 2026, allergens.js
 * reexportaba el resolvedor del núcleo (sin iconos) y la ficha de cualquier
 * plato con alérgenos se caía (React #130).
 */
describe("alérgenos con icono para la UI", () => {
  const TODOS = Object.keys(EU_ALLERGENS);

  it("los 14 de la tabla de la UI llevan icono", () => {
    expect(TODOS).toHaveLength(14);
    for (const id of TODOS) expect(typeof EU_ALLERGENS[id].Icon, id).toBe("function");
  });

  it("resolveRecipeAllergens (el de la UI) devuelve cada alérgeno con su icono", () => {
    const items = resolveRecipeAllergens(["pescado", "frutos_secos", "gluten", "huevo", "sulfitos", ...TODOS]);
    expect(items.length).toBe(14);
    for (const it of items) expect(it.Icon, it.id).toBeTruthy();
  });

  it("el del núcleo (el bot) sigue sin iconos: no arrastra .jsx a Node", () => {
    for (const it of delNucleo(TODOS)) expect(it.Icon).toBeUndefined();
  });
});
