import { describe, it, expect } from "vitest";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { CLASICOS } from "../data/clasicos.js";
import { PESTANAS_CLASICOS, clasicosPorPestana, plazasLibres, repartirClasicos } from "./clasicos.js";

// Lo que leen el paso de la hoja y el tablero (PizarraControles.jsx, App.jsx).
// Que cada marcado llegue aquí, con foto y papel de menú, lo vigila
// src/data/clasicos.test.js; este mira solo las pestañas.
const clasicos = CLASICOS.map((id) => recipeCatalogById[id]);

describe("las pestañas de los clásicos", () => {
  it("cada uno cae en una pestaña", () => {
    const enPestana = new Set(clasicosPorPestana(recipeCatalogById).flatMap((p) => p.recetas.map((r) => r.id)));
    expect(clasicos.filter((r) => !enPestana.has(r.id)).map((r) => r.id)).toEqual([]);
  });

  it("ninguna pestaña sale vacía", () => {
    for (const p of clasicosPorPestana(recipeCatalogById)) expect(p.recetas.length, p.id).toBeGreaterThan(0);
  });

  it("ninguna categoría de una pestaña se queda sin clásicos", () => {
    // Una categoría que no aporta nada es una puerta muerta (pasó con
    // «guarniciones», que ni siquiera entra en recipeCatalog).
    const usadas = new Set(clasicos.map((r) => r.category));
    expect(PESTANAS_CLASICOS.flatMap((p) => p.categorias).filter((c) => !usadas.has(c))).toEqual([]);
  });

  it("dentro de cada pestaña, el orden es el de la lista", () => {
    for (const p of clasicosPorPestana(recipeCatalogById)) {
      const posiciones = p.recetas.map((r) => CLASICOS.indexOf(r.id));
      expect(posiciones, p.id).toEqual([...posiciones].sort((x, y) => x - y));
    }
  });

  it("las pestañas no se pisan", () => {
    const cats = PESTANAS_CLASICOS.flatMap((p) => p.categorias);
    expect(new Set(cats).size).toBe(cats.length);
  });
});

describe("plazasLibres", () => {
  const dias = ["lunes", "martes"];
  const comidas = ["Comida", "Cena"];

  it("una comida partida da primero y segundo; una cena, cena o plato único", () => {
    const huecos = { "lunes-Comida": { dosPlatos: true }, "lunes-Cena": {} };
    expect(plazasLibres(huecos, dias, comidas)).toEqual([
      { day: "lunes", meal: "Comida", course: "first", papeles: ["primero"] },
      { day: "lunes", meal: "Comida", course: "main", papeles: ["segundo"] },
      { day: "lunes", meal: "Cena", course: "main", papeles: ["cena", "plato_unico"] },
    ]);
  });

  it("una comida de un plato pide plato único", () => {
    expect(plazasLibres({ "martes-Comida": {} }, dias, comidas)).toEqual([
      { day: "martes", meal: "Comida", course: "main", papeles: ["plato_unico"] },
    ]);
  });

  it("lo que ya tiene plato no es plaza", () => {
    const huecos = { "lunes-Comida": { dosPlatos: true, firstRecipeId: "x" }, "lunes-Cena": { recipeId: "y" } };
    expect(plazasLibres(huecos, dias, comidas).map((p) => p.course)).toEqual(["main"]);
  });
});

describe("repartirClasicos", () => {
  const plaza = (day, meal, course, papeles) => ({ day, meal, course, papeles });

  it("reparte por días: el segundo clásico va a otro día aunque quepa en el mismo", () => {
    const plazas = [
      plaza("lunes", "Comida", "main", ["plato_unico"]),
      plaza("lunes", "Cena", "main", ["cena", "plato_unico"]),
      plaza("martes", "Comida", "main", ["plato_unico"]),
    ];
    const { colocados } = repartirClasicos([
      { id: "a", mealRole: ["plato_unico"] },
      { id: "b", mealRole: ["plato_unico"] },
    ], plazas);
    expect(colocados.map((c) => c.day)).toEqual(["lunes", "martes"]);
  });

  it("el que cabe en menos sitios elige antes", () => {
    const plazas = [
      plaza("lunes", "Comida", "first", ["primero"]),
      plaza("lunes", "Comida", "main", ["segundo"]),
    ];
    // Los filetes van primero en la lista, pero la ensaladilla solo cabe de primero.
    const { colocados, sinSitio } = repartirClasicos([
      { id: "filetes", mealRole: ["segundo", "primero"] },
      { id: "ensaladilla", mealRole: ["primero"] },
    ], plazas);
    expect(sinSitio).toEqual([]);
    expect(colocados.find((c) => c.recetaId === "ensaladilla").course).toBe("first");
  });

  it("si su papel no cabe, va a un plato principal libre", () => {
    // Los filetes son `segundo`; en una casa de plato único se cenan igual.
    const { colocados, sinSitio } = repartirClasicos(
      [{ id: "filetes", mealRole: ["segundo"] }],
      [plaza("lunes", "Cena", "main", ["cena", "plato_unico"])],
    );
    expect(sinSitio).toEqual([]);
    expect(colocados).toEqual([{ recetaId: "filetes", day: "lunes", meal: "Cena", course: "main" }]);
  });

  it("pero nunca de primero si no lo es", () => {
    const { colocados, sinSitio } = repartirClasicos(
      [{ id: "filetes", mealRole: ["segundo"] }],
      [plaza("lunes", "Comida", "first", ["primero"])],
    );
    expect(colocados).toEqual([]);
    expect(sinSitio).toEqual(["filetes"]);
  });

  it("los que caben por su papel eligen antes que los de la segunda vuelta", () => {
    const { colocados } = repartirClasicos(
      [{ id: "filetes", mealRole: ["segundo"] }, { id: "croquetas", mealRole: ["cena"] }],
      [plaza("lunes", "Cena", "main", ["cena", "plato_unico"]), plaza("martes", "Comida", "main", ["plato_unico"])],
    );
    expect(colocados.find((c) => c.recetaId === "croquetas").day).toBe("lunes");
    expect(colocados.find((c) => c.recetaId === "filetes").day).toBe("martes");
  });

  it("cada plaza se usa una vez", () => {
    const { colocados, sinSitio } = repartirClasicos(
      [{ id: "a", mealRole: ["plato_unico"] }, { id: "b", mealRole: ["plato_unico"] }],
      [plaza("lunes", "Comida", "main", ["plato_unico"])],
    );
    expect(colocados).toHaveLength(1);
    expect(sinSitio).toEqual(["b"]);
  });
});
