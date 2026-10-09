import { describe, it, expect } from "vitest";
import {
  matchProductForIngredient,
  shouldSkipProduct,
  scoreProductName,
  MERCADONA_SEARCH_ALIASES,
} from "./productMatcher.js";
import { packsForLine, linePriceFromProduct, buyLineFromProduct, formatSkuSize } from "./listPricing.js";

const products = [
  { id: "1", name: "Batata", price: 1.2, unitSize: 1, unitFormat: "kg" },
  { id: "2", name: "Boniato", price: 1.5, unitSize: 1, unitFormat: "kg" },
  { id: "3", name: "Papilla merluza Hero +6 meses", price: 1.1, unitSize: 2, unitFormat: "ud" },
  { id: "4", name: "Merluza en lomos congelada", price: 4.5, unitSize: 500, unitFormat: "g" },
  { id: "5", name: "Fideos con gambas", price: 2.2, unitSize: 250, unitFormat: "g" },
  { id: "6", name: "Gamba pelada", price: 3.5, unitSize: 200, unitFormat: "g" },
  { id: "7", name: "Atún claro en aceite de oliva", price: 1.8, unitSize: 52, unitFormat: "g" },
  { id: "8", name: "Atún claro en tomate", price: 1.7, unitSize: 52, unitFormat: "g" },
  { id: "9", name: "Pan sin sal", price: 0.9, unitSize: 1, unitFormat: "ud" },
  { id: "10", name: "Caldo de pollo casero Hacendado", price: 0.65, unitSize: 1, unitFormat: "l" },
];

describe("productMatcher", () => {
  it("resolves boniato via batata alias", () => {
    const m = matchProductForIngredient("Boniato", products);
    expect(m?.product.id).toBe("1");
    expect(m?.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("skips baby food for merluza", () => {
    const m = matchProductForIngredient("Merluza en lomos", products);
    expect(m?.product.id).toBe("4");
    expect(m?.product.name).not.toMatch(/papilla/i);
  });

  it("skips pasta-with-shrimp for gambas ingredient", () => {
    const m = matchProductForIngredient("Gambas", products);
    expect(m?.product.id).toBe("6");
  });

  it("prefers plain tuna over tomato for atún en conserva", () => {
    const m = matchProductForIngredient("Atún en conserva", products);
    expect(m?.product.id).toBe("7");
  });

  it("shouldSkipProduct blocks pan for caldo", () => {
    expect(shouldSkipProduct("caldo de pollo", { name: "Pan sin sal" })).toBe(true);
    expect(shouldSkipProduct("caldo de pollo", { name: "Caldo de pollo casero" })).toBe(false);
  });

  it("scoreProductName handles whole-phrase match", () => {
    expect(scoreProductName("Batata", "batata")).toBeGreaterThanOrEqual(0.75);
  });

  it("exports search aliases for known gaps", () => {
    expect(MERCADONA_SEARCH_ALIASES.boniato).toContain("batata");
    expect(MERCADONA_SEARCH_ALIASES.tirabuzones).toContain("fusilli");
    expect(MERCADONA_SEARCH_ALIASES["pan de hamburguesa"]).toContain("pan de burger");
  });

  it("matches burger buns not barra de pan", () => {
    const catalog = [
      { id: "1", name: "Barra de pan", price: 0.5, unitSize: 0.25, unitFormat: "kg" },
      { id: "2", name: "Pan de burger Hacendado Rústico", price: 1.2, unitSize: 4, unitFormat: "ud" },
    ];
    const m = matchProductForIngredient("Pan de hamburguesa", catalog);
    expect(m?.product.id).toBe("2");
  });

  it("matches egg cartons not sandwiches", () => {
    const catalog = [
      { id: "1", name: "Mini sándwich de pavo y huevo revuelto", price: 1, unitSize: 0.07, unitFormat: "kg" },
      { id: "2", name: "Huevos grandes L", price: 3.05, unitSize: 12, unitFormat: "ud" },
    ];
    const m = matchProductForIngredient("Huevo", catalog);
    expect(m?.product.id).toBe("2");
  });

  it("skips prepared rice dishes for raw meat", () => {
    const catalog = [
      { id: "1", name: "Arroz de secreto ibérico con setas Hacendado", price: 9, unitSize: 0.28, unitFormat: "kg" },
      { id: "2", name: "Secreto ibérico", price: 9, unitSize: 0.28, unitFormat: "kg" },
    ];
    const m = matchProductForIngredient("Secreto ibérico", catalog);
    expect(m?.product.id).toBe("2");
  });
});

describe("listPricing pack math", () => {
  it("rounds up packs for weight", () => {
    const product = { price: 0.95, unitSize: 500, unitFormat: "g" };
    expect(packsForLine({ qty: 400, unit: "g" }, product)).toBe(1);
    expect(packsForLine({ qty: 600, unit: "g" }, product)).toBe(2);
    expect(linePriceFromProduct({ qty: 600, unit: "g" }, product)).toBe(1.9);
  });

  it("defaults to one pack when units differ", () => {
    const product = { price: 2.5, unitSize: 1, unitFormat: "ud" };
    expect(packsForLine({ qty: 300, unit: "g" }, product)).toBe(1);
  });

  it("builds a buy line for pricing (packs × SKU price)", () => {
    const product = { name: "Garbanzos cocidos Hacendado", price: 1.15, unitSize: 1, unitFormat: "kg" };
    const buy = buyLineFromProduct({ name: "Garbanzos cocidos", qty: 800, unit: "g" }, product);
    expect(buy.packs).toBe(1);
    expect(buy.linePrice).toBe(1.15);
    expect(buy.packLabel).toMatch(/1 bote/i);
    expect(buy.totalQtyText).toMatch(/1 kg/i);
  });

  it("does not label fresh produce as bote", () => {
    const product = { name: "Aguacate", price: 1.65, unitSize: 0.33, unitFormat: "kg" };
    const buy = buyLineFromProduct({ name: "Aguacate", qty: 2, unit: "ud" }, product);
    expect(buy.packs).toBe(2);
    expect(buy.linePrice).toBe(3.3);
    expect(buy.packLabel).toBe("2 uds");
    expect(buy.totalQtyText).toMatch(/400 g|0[,.][47] kg/i);
  });

  it("formats weights with at most one decimal", () => {
    expect(formatSkuSize(0.8400000000000001, "kg")).toBe("0,8 kg");
    expect(formatSkuSize(1.11, "kg")).toBe("1,1 kg");
    expect(formatSkuSize(600, "g")).toBe("600 g");
  });

  it("uses list weight when SKU has no size", () => {
    const product = { name: "Rodaja de emperador", price: 4.47, unitSize: 1, unitFormat: "ud" };
    const buy = buyLineFromProduct({ name: "Rodajas de emperador", qty: 600, unit: "g" }, product);
    expect(buy.totalQtyText).toMatch(/600 g|0,6 kg/i);
  });

  it("uses piece weight for onions not sack kg", () => {
    const product = { name: "Cebollas", price: 2, unitSize: 1, unitFormat: "kg" };
    const buy = buyLineFromProduct({ name: "Cebolla", qty: 4, unit: "ud" }, product);
    expect(buy.packLabel).toBe("4 uds");
    expect(buy.totalQtyText).toMatch(/0,6 kg|600 g/i);
  });

  it("counts egg cartons by units", () => {
    const product = { name: "Huevos grandes L", price: 3.05, unitSize: 12, unitFormat: "ud" };
    expect(packsForLine({ name: "Huevo", qty: 42, unit: "ud" }, product)).toBe(4);
    const buy = buyLineFromProduct({ name: "Huevo", qty: 42, unit: "ud" }, product);
    expect(buy.linePrice).toBe(12.2);
    expect(buy.buyDisplay).toBeNull();
  });
});

describe("el ingrediente tiene que ir en cabeza del producto", () => {
  // Los cinco salían con confianza alta en la lista de la compra: el nombre
  // del ingrediente estaba entero en el del producto, pero de complemento.
  it.each([
    ["mantequilla", "Croissant de mantequilla"],
    ["leche", "Café con leche cappuccino Hacendado"],
    ["azucar", "Refresco cola Hacendado zero azúcar"],
    ["vino blanco", "Vinagre de vino blanco Hacendado"],
    ["miel", "Caramelos miel sabor limón Pifarré"],
  ])("«%s» no es «%s»", (ingrediente, producto) => {
    expect(scoreProductName(producto, ingrediente)).toBeLessThan(0.7);
  });

  it("pero sí cuando va delante", () => {
    expect(scoreProductName("Mantequilla sin sal añadida Hacendado", "mantequilla")).toBeGreaterThanOrEqual(0.7);
  });
});

describe("el ingrediente es el núcleo aunque no vaya en cabeza tal cual", () => {
  // Pérdidas que trajo la primera versión de la regla (exigir que el nombre del
  // producto EMPEZARA por el ingrediente): emparejamientos buenos de staging que
  // se quedaron sin producto. Medidas con scripts/medir-emparejador.mjs.
  it.each([
    // una clase delante, sin «de»
    ["penne", "Pasta penne rigate Hacendado"],
    ["fusilli", "Pasta fusilli Armando"],
    ["tagliatelle", "Pasta fresca tagliatelle al huevo Hacendado"],
    ["ricotta", "Queso ricotta mezcla Hacendado"],
    ["mascarpone", "Queso fresco mascarpone de vaca Hacendado"],
    ["kefir", "Bebida Kéfir natural Hacendado 0% MG"],
    // una parte o un corte delante, con «de»
    ["rape", "Cola de rape del Cabo sin piel Hacendado ultracongelada"],
    ["rodaballo", "Filete de rodaballo"],
    ["pimiento choricero", "Carne de pimiento choricero Hacendado"],
    ["anchoas", "Filetes de anchoa en aceite de oliva Hacendado"],
    // semillas delante, con o sin «de» (la lista de la compra, nombre crudo)
    ["sesamo tostado", "Semillas sésamo tostado Hacendado"],
    ["chia", "Semillas de chía Hacendado"],
    ["lino", "Semillas lino dorado Hacendado"],
    ["semillas de lino", "Semillas lino dorado Hacendado"],
    // el número
    ["almejas", "Almeja Hacendado congelada"],
    ["alcachofas", "Alcachofa troceada Hacendado ultracongelada"],
    ["langostinos", "Langostino crudo y pelado Hacendado ultracongelado"],
  ])("«%s» es «%s»", (ingrediente, producto) => {
    expect(scoreProductName(producto, ingrediente)).toBeGreaterThanOrEqual(0.7);
  });

  // Y las holguras no reabren la puerta a los complementos.
  it.each([
    ["almendras", "Bebida de almendras 0% azúcar Hacendado"], // clase + «de»: materia, no especie
    ["lentejas rojas", "Pasta fusilli 100% lentejas rojas Felicia"],
    ["queso azul", "Queso untar con queso azul de vaca Hacendado"],
    ["yogur", "Salsa Yogur Hacendado"], // «salsa» no es clase
    ["pollo", "Patas de pollo"], // «patas» no es parte
    ["maiz", "Tiras de maíz frito sabor barbacoa Hacendado"],
    ["leche", "Dulce de leche"], // un adjetivo con «de» no es una parte
    ["menta", "Infusión Menta Poleo Hacendado"],
  ])("«%s» no es «%s»", (ingrediente, producto) => {
    expect(scoreProductName(producto, ingrediente)).toBeLessThan(0.7);
  });

  it("en un empate gana el nombre exacto sobre el plural", () => {
    expect(scoreProductName("Espinacas baby lavadas", "espinacas")).toBeGreaterThan(
      scoreProductName("Espinaca en porciones Hacendado ultracongelada", "espinacas"),
    );
  });

  it("los platos hechos de legumbre o pasta no son el ingrediente", () => {
    expect(shouldSkipProduct("garbanzos", { name: "Garbanzos a la jardinera Hacendado" })).toBe(true);
    expect(shouldSkipProduct("macarrones", { name: "Macarrones Mac & Cheese Bacon Hacendado gratinados" })).toBe(true);
    expect(shouldSkipProduct("langostinos", { name: "Langostino caballitos rebozados Hacendado ultracongelados" })).toBe(true);
    // pero la masa de empanada sí es «empanada»
    expect(shouldSkipProduct("masa de empanada", { name: "Masa fresca empanada Hacendado" })).toBe(false);
  });

  // La lista de la compra empareja el nombre tal cual, sin la cadena de nombres
  // del coste: estos dos se quedaban por debajo de la confianza alta.
  it.each([
    ["Carne picada", "Preparado de carne picada vacuno y cerdo", ["Preparado de carne picada pollo", "Tocino de cerdo"]],
    ["Pollo", "Pollo entero", ["Pollo teriyaki", "Pollo asado Hacendado"]],
  ])("la lista lleva «%s» a «%s»", (ingrediente, bueno, otros) => {
    const catalogo = [bueno, ...otros].map((name, i) => ({ id: String(i), name, price: 10 - i }));
    const m = matchProductForIngredient(ingrediente, catalogo);
    expect(m.product.name).toBe(bueno);
    expect(m.confidence).toBeGreaterThanOrEqual(0.7);
  });
});
