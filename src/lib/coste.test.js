import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { costeReceta, costeMenu } from "./coste.js";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { catalogToFrontendRecipe } from "./aiPlanner.js";
import { conRasgos } from "../../api/_bot/menu.js";

// Los precios de verdad: el mismo fichero del que sale derived/recipeCoste.json
// y el que carga la ficha del plato en el navegador.
const MERCADONA = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../public/store/mercadona.json", import.meta.url)), "utf8"),
).products;

// Una botella de litro a 5 € y lomos de merluza a 4,50 € el medio kilo.
const ACEITE = { id: "1", name: "Aceite de oliva virgen extra", price: 5, unitSize: 1, unitFormat: "l", bulkPrice: 5 };
const MERLUZA = { id: "2", name: "Merluza en lomos congelada", price: 4.5, unitSize: 500, unitFormat: "g", bulkPrice: 9 };
const PRECIOS = [ACEITE, MERLUZA];

const conPrecio = recipeCatalog.filter((r) => r.estrella && r.costeRacion != null);

describe("costeReceta: un número por receta y modo, lo lea quien lo lea", () => {
  it("planner, ficha del plato y bot dan el mismo € por ración en modo granel", () => {
    expect(conPrecio.length).toBeGreaterThan(100);
    for (const r of conPrecio.slice(0, 60)) {
      const planner = catalogToFrontendRecipe(r, 3).costeRacion;
      // La ficha (Menu.jsx) recibe la receta del puente y sus raciones.
      const ficha = costeReceta(catalogToFrontendRecipe(r, 3), { modo: "granel", raciones: 3 });
      // El bot lee la receta del catálogo tal cual.
      const bot = costeReceta(r, { modo: "granel" });
      expect(ficha.porRacion, r.id).toBe(planner);
      expect(bot.porRacion, r.id).toBe(planner);
      expect(bot.nivel ?? undefined, r.id).toBe(r.costeNivel);
    }
  });

  it("la tabla es el cálculo a granel sobre los precios de Mercadona, no otro número", () => {
    for (const r of conPrecio.slice(0, 60)) {
      const vivo = costeReceta({ ingredients: r.ingredients, baseServings: r.baseServings }, { modo: "granel", precios: MERCADONA });
      expect(vivo.porRacion, r.id).toBe(r.costeRacion);
    }
  });

  it("una receta fuera de la tabla, a granel, da lo mismo por ración sea cual sea el número de comensales", () => {
    const receta = { ingredients: [{ name: "Merluza", unit: "g", amount: 500 }, { name: "Aceite de oliva", unit: "ml", amount: 30 }], baseServings: 4 };
    const a4 = costeReceta(receta, { modo: "granel", raciones: 4, precios: PRECIOS });
    const a1 = costeReceta(receta, { modo: "granel", raciones: 1, precios: PRECIOS });
    expect(a4.porRacion).not.toBeNull();
    expect(a1.porRacion).toBe(a4.porRacion);
  });

  it("el bot filtra «barato» con el nivel del modo granel", () => {
    const baratas = conRasgos(conPrecio, { coste: "economico" }).lista;
    expect(baratas.length).toBeGreaterThan(0);
    for (const r of baratas) expect(costeReceta(r, { modo: "granel" }).porRacion).toBeLessThan(1);
  });
});

describe("redondeo a envase entero: solo en modo paquetes", () => {
  const receta = { ingredients: [{ id: "a", name: "Aceite de oliva", unit: "ml", amount: 30 }], baseServings: 4 };

  it("30 ml de aceite cuestan céntimos a granel y una botella en paquetes", () => {
    const granel = costeReceta(receta, { modo: "granel", raciones: 4, precios: PRECIOS });
    const paquetes = costeReceta(receta, { modo: "paquetes", raciones: 4, precios: PRECIOS });
    expect(granel.total).toBeLessThan(0.5);
    expect(paquetes.total).toBe(5);
    expect(paquetes.porRacion).toBe(1.25);
  });

  it("paquetes: precio por ración de la compra real (envases enteros entre raciones)", () => {
    const r = costeReceta(
      { ingredients: [{ id: "a", name: "Merluza", unit: "g", qtyScaled: 500 }, { id: "b", name: "Aceite de oliva", unit: "ml", qtyScaled: 1000 }] },
      { modo: "paquetes", raciones: 4, precios: PRECIOS },
    );
    expect(r.cobertura).toBe(1);
    expect(r.porRacion).toBeCloseTo(2.38, 2); // (4,5 + 5) / 4
  });

  it("paquetes sin nada emparejado: null, nunca un coste inventado", () => {
    const r = costeReceta({ ingredients: [{ id: "a", name: "Ingrediente inventado xyz", unit: "g", qtyScaled: 100 }] }, { modo: "paquetes", raciones: 2, precios: PRECIOS });
    expect(r).toBeNull();
  });

  it("paquetes con «al gusto» (qtyScaled null) no rompe ni da NaN", () => {
    const r = costeReceta({ ingredients: [{ id: "a", name: "Merluza", unit: "g", qty: 500, qtyScaled: null }] }, { modo: "paquetes", raciones: 4, precios: PRECIOS });
    expect(Number.isFinite(r.porRacion)).toBe(true);
  });

  it("sin modo explícito no hay número", () => {
    expect(() => costeReceta(receta, { raciones: 4, precios: PRECIOS })).toThrow(/modo/);
  });
});

describe("costeMenu", () => {
  const plato = { ingredients: [{ id: "a", name: "Aceite de oliva", unit: "ml", amount: 30 }], baseServings: 4 };
  const menu = [{ receta: plato, raciones: 4 }, { receta: plato, raciones: 4 }];

  it("paquetes compra una botella para toda la semana; granel suma lo que se gasta", () => {
    expect(costeMenu(menu, { modo: "paquetes", precios: PRECIOS }).total).toBe(5);
    const granel = costeMenu(menu, { modo: "granel", precios: PRECIOS });
    expect(granel.total).toBeCloseTo(2 * costeReceta(plato, { modo: "granel", raciones: 4, precios: PRECIOS }).total, 2);
  });

  it("granel del menú = suma de los platos del catálogo con la tabla", () => {
    const [a, b] = conPrecio;
    const t = costeMenu([{ receta: a, raciones: 2 }, { receta: b, raciones: 3 }], { modo: "granel" });
    expect(t.total).toBeCloseTo(a.costeRacion * 2 + b.costeRacion * 3, 2);
  });
});
