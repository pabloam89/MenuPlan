import { describe, expect, it } from "vitest";

import tabla from "../data/fondoDeArmario.json";
import ingredients from "../data/ingredients.json";
import { TablaFondoSchema, TIPO_DE_COMPRA } from "../data/fondoDeArmarioSchema.js";
import { separarFondo, tipoDeCompra } from "./tipoDeCompra.js";

const FONDO = TIPO_DE_COMPRA.FONDO_DE_ARMARIO;
const RECETA = TIPO_DE_COMPRA.RECETA;

describe("fondoDeArmario.json", () => {
  it("cumple el esquema (campos cerrados, motivo de verdad si lo hay)", () => {
    const r = TablaFondoSchema.safeParse(tabla);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues.slice(0, 5), null, 1)).toBe(true);
  });

  it("cada ingredientId es un ingrediente del catálogo, y ninguno se repite", () => {
    const ids = new Set(ingredients.map((i) => i.id));
    const filas = tabla.filas.map((f) => f.ingredientId);
    expect(filas.filter((id) => !ids.has(id))).toEqual([]);
    expect(filas.length).toBe(new Set(filas).size);
  });

  // Lo que aguanta meses pero se gasta entero en una receta va por cantidad:
  // si entrara aquí, la compra lo daría por hecho y faltaría el paquete.
  it("arroz, pasta, legumbres, caldos y hierbas frescas no son de fondo de armario", () => {
    const porCantidad = ["arroz", "espaguetis", "macarrones", "lentejas", "garbanzos", "caldo-de-pollo", "perejil", "albahaca", "vino-blanco"];
    const fondo = new Set(tabla.filas.map((f) => f.ingredientId));
    expect(porCantidad.filter((id) => fondo.has(id))).toEqual([]);
  });
});

describe("tipoDeCompra", () => {
  it("lo de fondo de armario, por cualquiera de sus nombres", () => {
    expect(tipoDeCompra("Sal")).toBe(FONDO);
    expect(tipoDeCompra("Aceite de oliva virgen extra")).toBe(FONDO);
    expect(tipoDeCompra("Pimentón")).toBe(FONDO);
    expect(tipoDeCompra("Ajo")).toBe(FONDO);
  });

  it("lo de la receta, y lo que no resuelve a ningún ingrediente", () => {
    expect(tipoDeCompra("Limón")).toBe(RECETA);
    expect(tipoDeCompra("Pechuga de pollo")).toBe(RECETA);
    expect(tipoDeCompra("Arroz bomba")).toBe(RECETA);
    expect(tipoDeCompra("Algo que no está en el catálogo")).toBe(RECETA);
    expect(tipoDeCompra("")).toBe(RECETA);
  });
});

describe("separarFondo", () => {
  it("lo de receta queda en su orden; el fondo de armario, aparte y por nombre", () => {
    const items = [{ name: "Sal" }, { name: "Limón" }, { name: "Aceite de oliva" }, { name: "Pollo" }, { name: "Comino" }];
    const { receta, fondo } = separarFondo(items);
    expect(receta.map((i) => i.name)).toEqual(["Limón", "Pollo"]);
    expect(fondo.map((i) => i.name)).toEqual(["Aceite de oliva", "Comino", "Sal"]);
  });
  it("sin líneas, dos listas vacías", () => {
    expect(separarFondo(undefined)).toEqual({ receta: [], fondo: [] });
  });
});

// Pablo, 9 nov: ninguna especia fuera del fondo de armario. El pasillo
// «Especias» es solo de especias secas (las hierbas frescas van a Verduras),
// y todas son de fondo de armario.
describe("las especias, todas en el fondo de armario", () => {
  it("cada ingrediente del pasillo Especias está en fondoDeArmario.json", () => {
    const fondo = new Set(tabla.filas.map((f) => f.ingredientId));
    const fuera = ingredients.filter((i) => i.aisle === "Especias" && !fondo.has(i.id)).map((i) => i.id);
    expect(fuera).toEqual([]);
  });
});
