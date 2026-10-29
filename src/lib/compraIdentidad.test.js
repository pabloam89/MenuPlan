import { describe, it, expect } from "vitest";
import { claveArticulo, sonElMismo, anadirArticulos, conMarcas } from "./compraIdentidad.js";

describe("identidad de un artículo de la compra (#958)", () => {
  it("el mismo nombre con otra forma es el mismo artículo", () => {
    expect(claveArticulo("Leche")).toBe(claveArticulo(" leche "));
    expect(claveArticulo("Judías verdes")).toBe(claveArticulo("judía verde"));
    expect(claveArticulo("Leche entera")).not.toBe(claveArticulo("Leche semidesnatada"));
  });

  it("sonElMismo solo con una identidad y no vacía", () => {
    expect(sonElMismo([{ name: "leche" }, { name: "Leche" }])).toBe(true);
    expect(sonElMismo([{ name: "Leche entera" }, { name: "Leche semidesnatada" }])).toBe(false);
    expect(sonElMismo([])).toBe(false);
  });
});

describe("anadirArticulos: nunca dos veces lo mismo", () => {
  it("lo que ya está pendiente no se duplica, ni dentro del mismo mensaje", () => {
    const r = anadirArticulos([{ id: "a", name: "Leche", have: false }], ["leche", "pan", "Pan"], () => "x");
    expect(r.items.map((i) => i.name)).toEqual(["Leche", "pan"]);
    expect(r.yaEstaban).toEqual(["Leche", "pan"]);
    expect(r.anadidos).toEqual(["pan"]);
  });

  it("lo tachado o «en casa» vuelve a pedirse en vez de duplicarse", () => {
    const r = anadirArticulos([{ id: "a", name: "Leche", have: true }, { id: "b", name: "Pan", atHome: true }], ["leche", "pan"]);
    expect(r.items).toHaveLength(2);
    expect(r.items.every((i) => !i.have && !i.atHome)).toBe(true);
    expect(r.devueltos).toEqual(["Leche", "Pan"]);
  });

  it("no muta la lista que recibe", () => {
    const items = [{ id: "a", name: "Leche", have: true }];
    anadirArticulos(items, ["leche"]);
    expect(items[0].have).toBe(true);
  });
});

describe("conMarcas: rehacer no desmarca lo comprado", () => {
  it("pasa «comprado» y «en casa» por ingrediente y unidad", () => {
    const viejos = [{ name: "Tomate", unit: "ud", have: true }, { name: "Arroz", unit: "g", atHome: true }, { name: "Pan", unit: "ud" }];
    const nuevos = [{ name: "tomates", unit: "ud" }, { name: "Arroz", unit: "g" }, { name: "Pan", unit: "ud" }, { name: "Arroz", unit: "kg" }];
    const r = conMarcas(nuevos, viejos);
    expect(r[0].have).toBe(true);
    expect(r[1].atHome).toBe(true);
    expect(r[2].have).toBeFalsy();
    // Otra unidad es otro artículo de la lista: no hereda.
    expect(r[3].atHome).toBeFalsy();
  });
});
