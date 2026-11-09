import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ESTADO_PRODUCTO_LINEA, ESTADOS_PRODUCTO_LINEA, dineroDeMas, envaseDesproporcionado, filaDeLinea, gramosDeReferencia, productoDeLinea } from "./productoDeLinea.js";
import { ENCAJES_SIN_PRODUCTO } from "../data/productoSchema.js";

const productos = [
  { id: "10", name: "Perejil Hacendado", price: 0.9, unitSize: 1, unitFormat: "ud" },
  { id: "20", name: "Pimentón dulce Hacendado", price: 1.2, unitSize: 75, unitFormat: "g" },
  { id: "21", name: "Pimentón picante Hacendado", price: 1.2, unitSize: 75, unitFormat: "g" },
];
const fila = (o) => ({ supermercado: "Mercadona", alias: null, encaje: "exacto", decididoPor: "modelo", motivo: null, revisado: "2026-11-08", ...o });
const filas = [
  fila({ ingredientId: "perejil", productId: "10" }),
  fila({ ingredientId: "pimenton", productId: "20" }),
  fila({ ingredientId: "pimenton", alias: "Pimentón picante", productId: "21" }),
  fila({ ingredientId: "parmesano", productId: null, encaje: "no_lo_vende", motivo: "No hay parmigiano en el catálogo" }),
  fila({ ingredientId: "agua", productId: null, encaje: "no_se_compra", motivo: "El agua del grifo no se compra" }),
  fila({ ingredientId: "sandia", productId: "99" }),
];
const IDS = { "perejil fresco": "perejil", perejil: "perejil", pimenton: "pimenton", "pimenton picante": "pimenton", parmesano: "parmesano", agua: "agua", sandia: "sandia" };
const resolver = (n) => IDS[n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()] ?? null;
const nunca = () => { throw new Error("no debía llamar al emparejador"); };
const op = { filas, resolver, candidatos: nunca };

describe("productoDeLinea", () => {
  it("«Perejil fresco» sale con el perejil decidido aunque el nombre no case (el fallo del 8 nov: 0,50 y sin producto)", () => {
    const r = productoDeLinea("Perejil fresco", productos, op);
    expect(r.estado).toBe(ESTADO_PRODUCTO_LINEA.DECIDIDO);
    expect(r.product.id).toBe("10");
  });

  it("la fila del alias gana a la del ingrediente: el picante es otro bote", () => {
    expect(productoDeLinea("Pimentón picante", productos, op).product.id).toBe("21");
    expect(productoDeLinea("Pimentón", productos, op).product.id).toBe("20");
  });

  it("lo que el súper no vende o no se compra sale con su motivo y sin producto", () => {
    expect(productoDeLinea("Parmesano", productos, op)).toMatchObject({ estado: "no_lo_vende", product: null });
    expect(productoDeLinea("Agua", productos, op)).toMatchObject({ estado: "no_se_compra", product: null });
  });

  it("un producto decidido que no está esta semana es «falta_esta_semana», no otro producto", () => {
    expect(productoDeLinea("Sandía", productos, op)).toMatchObject({ estado: ESTADO_PRODUCTO_LINEA.FALTA_ESTA_SEMANA, product: null });
  });

  it("sin fila cae al emparejador, y lo cuenta", () => {
    const candidatos = () => [{ product: productos[0], confidence: 0.8 }];
    expect(productoDeLinea("Cosa rara", productos, { ...op, candidatos }).estado).toBe(ESTADO_PRODUCTO_LINEA.EMPAREJADO);
    expect(productoDeLinea("Cosa rara", productos, { ...op, candidatos: () => [] })).toMatchObject({ estado: "sin_producto", product: null });
  });

  // El fallo del 8 nov: «Jamón serrano» acabó en la pieza entera de 6,8 kg a
  // 58 € para 100 g, porque el emparejador elige por nombre y no mira el envase.
  it("sin fila, el emparejador salta el envase desproporcionado para lo pedido", () => {
    const pieza = { id: "30", name: "Jamón serrano Incarlopsa", price: 58, unitSize: 6.8, unitFormat: "kg", bulkPrice: 8.53 };
    const lonchas = { id: "31", name: "Jamón serrano lonchas", price: 3.95, unitSize: 0.24, unitFormat: "kg", bulkPrice: 16.46 };
    const candidatos = () => [{ product: pieza, confidence: 0.75 }, { product: lonchas, confidence: 0.7 }];
    const r = productoDeLinea("Jamón ibérico de bellota", [pieza, lonchas], { ...op, candidatos, gramos: 100 });
    expect(r.product.id).toBe("31");
    // y si solo hay el grande, sin producto antes que 57 € de más
    const solo = () => [{ product: pieza, confidence: 0.75 }];
    expect(productoDeLinea("Jamón ibérico de bellota", [pieza], { ...op, candidatos: solo, gramos: 100 }).estado).toBe("sin_producto");
  });

  it("gramosDeReferencia: lo de la línea escalado a 4 raciones; sin raciones se toma 4; sin gramos, null", () => {
    expect(gramosDeReferencia(30, 1)).toBe(120);
    expect(gramosDeReferencia(200, 8)).toBe(100);
    expect(gramosDeReferencia(100, null)).toBe(100);
    expect(gramosDeReferencia(null, 2)).toBeNull();
  });

  it("dineroDeMas: el envase menos lo pedido a granel; sin granel o por pieza, no se sabe", () => {
    expect(dineroDeMas({ price: 58, bulkPrice: 8.53, unitFormat: "kg" }, 100)).toBeCloseTo(57.15, 2);
    expect(envaseDesproporcionado({ price: 5, bulkPrice: 5, unitFormat: "l" }, 30)).toBe(false);
    expect(dineroDeMas({ price: 2, bulkPrice: null, unitFormat: "kg" }, 100)).toBeNull();
    expect(dineroDeMas({ price: 2, bulkPrice: 2, unitFormat: "ud" }, 100)).toBeNull();
  });

  it("otro súper no ve las filas de Mercadona", () => {
    expect(filaDeLinea("Perejil", { ...op, supermercado: "Lidl" })).toBeNull();
  });

  it("los encajes sin producto son también estados de la línea (la misma palabra)", () => {
    for (const e of ENCAJES_SIN_PRODUCTO) expect(ESTADOS_PRODUCTO_LINEA).toContain(e);
  });
});

// Lo que sabían los alias del emparejador y productoBuscado.json, ahora con la
// tabla y el catálogo de verdad: estos nombres no casan con su producto por
// parecido, y la decisión guardada sí los lleva.
describe("productoDeLinea con la tabla y el catálogo de verdad", () => {
  const catalogo = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../public/store/mercadona.json", import.meta.url)), "utf8"),
  ).products;
  it.each([
    ["Boniato", /^Batata/],
    ["Carne picada", /^Preparado de carne picada/],
    ["Morcillo de ternera", /^Trozo de vacuno para cocido/],
    ["Maicena", /harina fina de ma[ií]z/i],
    ["Perejil fresco", /^Perejil/],
  ])("«%s» sale con su producto decidido", (nombre, producto) => {
    const r = productoDeLinea(nombre, catalogo);
    expect(r.estado).toBe(ESTADO_PRODUCTO_LINEA.DECIDIDO);
    expect(r.product.name).toMatch(producto);
  });
  it("«Pollo» no acaba en un pollo cocinado (teriyaki, asado)", () => {
    expect(productoDeLinea("Pollo", catalogo).product.name).not.toMatch(/teriyaki|asado/i);
  });
});

// Un dato, un sitio: el producto de un ingrediente lo decide la tabla, y el
// emparejador por nombre solo se llama desde aquí, para lo que no tiene fila.
// Si otro módulo vuelve a emparejar por su cuenta, dos sitios pueden elegir dos
// productos para el mismo ingrediente (pasó con la compra y el coste por ración).
describe("nadie empareja productos fuera de productoDeLinea", () => {
  const PERMITIDOS = new Set([
    "src/lib/productMatcher.js",
    "src/lib/productoDeLinea.js",
  ]);
  const raiz = fileURLToPath(new URL("../../", import.meta.url));
  const ficheros = (dir) =>
    readdirSync(raiz + dir, { withFileTypes: true }).flatMap((d) => {
      const ruta = `${dir}/${d.name}`;
      if (d.isDirectory()) return ficheros(ruta);
      return /\.(m?js|jsx)$/.test(d.name) && !/\.test\./.test(d.name) && !d.name.endsWith("core.mjs") ? [ruta] : [];
    });
  it("ningún otro fichero de src ni api llama a matchProductForIngredient o matchProductsForIngredient", () => {
    const fuera = [...ficheros("src"), ...ficheros("api")]
      .filter((f) => !PERMITIDOS.has(f))
      .filter((f) => /\bmatchProducts?ForIngredient\b/.test(readFileSync(raiz + f, "utf8")));
    expect(fuera).toEqual([]);
  });
});
