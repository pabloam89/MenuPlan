import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { costeReceta } from "./coste.js";
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

describe("la ficha del plato", () => {
  const menu = readFileSync(fileURLToPath(new URL("../screens/Menu.jsx", import.meta.url)), "utf8");

  // Decisión del 8 oct 2026: el €/ración de la ficha es el mismo número que ve
  // Lola. Los precios que apunta el usuario (data.priceObs) cuentan en el total
  // de la compra (listPricing), no aquí.
  it("no usa data.priceObs ni el precio a envases de listPricing", () => {
    expect(menu).not.toMatch(/priceObs/);
    expect(menu).not.toMatch(/from "\.\.\/lib\/listPricing\.js"/);
    expect(menu).toMatch(/costeReceta\(recipe, \{ modo: "granel"/);
  });
});

describe("coste.js", () => {
  it("sin modo explícito no hay número", () => {
    expect(() => costeReceta(conPrecio[0], {})).toThrow(/modo/);
    expect(() => costeReceta(conPrecio[0], { modo: "paquetes" })).toThrow(/priceShoppingList/);
  });

  // recipeCatalog llama a costeReceta mientras se evalúa: si coste.js llegara
  // a importar algo que importe recipeCatalog, habría un ciclo.
  it("no alcanza recipeCatalog por sus imports (sin ciclo)", () => {
    const vistos = new Set();
    const pendientes = [fileURLToPath(new URL("./coste.js", import.meta.url))];
    while (pendientes.length) {
      const f = pendientes.pop();
      if (vistos.has(f)) continue;
      vistos.add(f);
      const src = readFileSync(f, "utf8");
      for (const [, rel] of src.matchAll(/^import[^;]*?from\s+"(\.[^"]+\.js)"/gms)) {
        pendientes.push(fileURLToPath(new URL(rel, pathToFileURL(f))));
      }
    }
    const nombres = [...vistos].map((f) => pathToFileURL(f).href);
    expect(nombres.some((f) => f.endsWith("/data/recipeCatalog.js"))).toBe(false);
    expect(nombres.some((f) => f.endsWith("/lib/listPricing.js"))).toBe(false);
  });
});
