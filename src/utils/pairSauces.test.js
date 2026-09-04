import { describe, it, expect } from "vitest";
import { pairSauces, sauceForRecipe, sauceOptionsForRecipe } from "./pairSauces.js";

function sauce(overrides) {
  return {
    id: "salsa1",
    name: "Salsa rápida",
    time: 10,
    sauceCompat: ["carne_blanca"],
    ingredients: [{ name: "Aceite de oliva" }],
    ...overrides,
  };
}

function principal(overrides) {
  return {
    id: "p1",
    type: "principal",
    name: "Plato principal",
    category: "carnes",
    mainProtein: "pollo",
    ingredients: [{ name: "Pollo" }],
    ...overrides,
  };
}

describe("pairSauces", () => {
  // El emparejado AUTOMÁTICO se retiró: el catálogo no combina piezas. Cada
  // plato viene escrito entero, y añadirle una salsa producía cosas como
  // "Lenguado meunière con mantequilla y limón con alcachofas confitadas".
  // Lo que queda es respetar lo que se ha elegido a mano.
  it("no pone ninguna salsa por su cuenta, aunque haya una compatible", () => {
    const pool = { p1: principal() };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairSauces(slots, pool, {}, { sauceCatalog: [sauce()] });
    expect(result[0].sauceId).toBeUndefined();
  });

  it("respeta la salsa fijada a mano para ese plato", () => {
    const pool = { p1: principal() };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairSauces(slots, pool, { p1: "salsa1" }, { sauceCatalog: [sauce({ id: "salsa1" })] });
    expect(result[0].sauceId).toBe("salsa1");
  });

  it("respeta la salsa que la propia receta declara suya (recipe.sauceId)", () => {
    const pool = { p1: principal({ sauceId: "salsa1" }) };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairSauces(slots, pool, {}, { sauceCatalog: [sauce({ id: "salsa1" })] });
    expect(result[0].sauceId).toBe("salsa1");
  });

  it("y el pin del usuario gana sobre la que trae la receta", () => {
    const pool = { p1: principal({ sauceId: "salsa1" }) };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairSauces(slots, pool, { p1: "salsa2" }, {
      sauceCatalog: [sauce({ id: "salsa1" }), sauce({ id: "salsa2" })],
    });
    expect(result[0].sauceId).toBe("salsa2");
  });

  it("ignora una salsa fijada que no existe en el catálogo", () => {
    const pool = { p1: principal({ sauceId: "no_existe" }) };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairSauces(slots, pool, {}, { sauceCatalog: [sauce()] });
    expect(result[0].sauceId).toBeUndefined();
  });

  it("no toca los huecos cuya receta no está en el pool", () => {
    const slots = [{ slotId: "lun_cena", recipeId: "fantasma" }];
    const result = pairSauces(slots, {}, { fantasma: "salsa1" }, { sauceCatalog: [sauce()] });
    expect(result[0].sauceId).toBeUndefined();
  });
});

describe("sauceForRecipe / sauceOptionsForRecipe", () => {
  // Siguen existiendo para el selector de "cambiar salsa" de la ficha: ahí es
  // el usuario quien elige, que es justo lo que sí se respeta.
  it("devuelve la salsa que la receta declara suya", () => {
    const r = principal({ sauceId: "salsa1" });
    expect(sauceForRecipe(r, [sauce({ id: "salsa1" })])?.id).toBe("salsa1");
  });

  it("propone una compatible y siempre la misma para el mismo plato", () => {
    const r = principal();
    const catalog = [sauce({ id: "a" }), sauce({ id: "b" })];
    const first = sauceForRecipe(r, catalog);
    expect(first).not.toBeNull();
    expect(sauceForRecipe(r, catalog)?.id).toBe(first.id);
  });

  it("no propone nada cuando ninguna salsa encaja con el plato", () => {
    const r = principal();
    expect(sauceForRecipe(r, [sauce({ sauceCompat: ["marisco"] })])).toBeNull();
  });

  it("lista todas las compatibles para el selector", () => {
    const r = principal();
    const catalog = [sauce({ id: "a" }), sauce({ id: "b", sauceCompat: ["marisco"] })];
    expect(sauceOptionsForRecipe(r, catalog).map((s) => s.id)).toEqual(["a"]);
  });

  it("aguanta una receta ausente sin reventar", () => {
    expect(sauceForRecipe(null)).toBeNull();
    expect(sauceOptionsForRecipe(null)).toEqual([]);
  });
});
