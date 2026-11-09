import { describe, it, expect } from "vitest";
import { PEDIDO_MINIMO_MERCADONA, enlaceDeLista, faltaParaMinimo, fichaMercadona, listaParaMercadona } from "./mercadonaList.js";

const merca = (id, packs, precio = 1) => ({
  storeProductId: id,
  storeProductName: `Producto ${id}`,
  storePacks: packs,
  storePrice: precio,
  storePriceSource: "mercadona",
});

describe("listaParaMercadona", () => {
  it("el total baja al quitar una línea", () => {
    const items = [
      { id: "a", name: "Cebolla" },
      { id: "b", name: "Huevo" },
    ];
    const map = new Map([
      ["a", merca("1", 1, 1.1)],
      ["b", merca("2", 2, 2.2)],
    ]);
    expect(listaParaMercadona(items, map, "x").total).toBe(3.3);
    expect(listaParaMercadona(items.slice(1), map, "x").total).toBe(2.2);
  });

  it("si el mayor va primero, un repetido menor no lo pisa", () => {
    const items = [
      { id: "a", name: "Pimentón dulce" },
      { id: "b", name: "Pimentón" },
    ];
    const map = new Map([
      ["a", merca("7", 2, 2)],
      ["b", merca("7", 1, 1)],
    ]);
    const { lista, total } = listaParaMercadona(items, map, "x");
    expect(lista.products).toEqual([{ merca_code: "7", quantity: 2 }]);
    expect(total).toBe(2);
  });

  it("en un producto repetido cuenta solo el precio de la línea que se queda", () => {
    const items = [
      { id: "a", name: "Pimentón" },
      { id: "b", name: "Pimentón dulce" },
    ];
    const map = new Map([
      ["a", merca("7", 1, 1)],
      ["b", merca("7", 2, 2)],
    ]);
    expect(listaParaMercadona(items, map, "x").total).toBe(2);
  });

  it("manda cada producto con sus paquetes y aparta lo que no tiene producto", () => {
    const items = [
      { id: "a", name: "Cebolla" },
      { id: "b", name: "Salvia fresca" },
      { id: "c", name: "Huevo" },
    ];
    const map = new Map([
      ["a", merca("69", 2)],
      ["c", merca("31", 3)],
    ]);
    expect(listaParaMercadona(items, map, "Semana")).toEqual({
      lista: {
        name: "Semana",
        products: [
          { merca_code: "69", quantity: 2 },
          { merca_code: "31", quantity: 3 },
        ],
      },
      lineas: [
        { id: "69", nombre: "Producto 69", paquetes: 2, precio: 1 },
        { id: "31", nombre: "Producto 31", paquetes: 3, precio: 1 },
      ],
      total: 2,
      sinProducto: ["Salvia fresca"],
    });
  });

  it("no manda un precio apuntado a mano como si fuera un producto", () => {
    const map = new Map([["a", { storePrice: 2, storePriceSource: "obs" }]]);
    const { lista, sinProducto } = listaParaMercadona([{ id: "a", name: "Queso" }], map, "x");
    expect(lista.products).toEqual([]);
    expect(sinProducto).toEqual(["Queso"]);
  });

  it("dos ingredientes en el mismo producto se quedan con el mayor", () => {
    const items = [
      { id: "a", name: "Pimentón" },
      { id: "b", name: "Pimentón dulce" },
    ];
    const map = new Map([
      ["a", merca("7", 1)],
      ["b", merca("7", 2)],
    ]);
    expect(listaParaMercadona(items, map, "x").lista.products).toEqual([{ merca_code: "7", quantity: 2 }]);
  });

  it("el agua del grifo no se compra, el aguacate sí", () => {
    const items = [
      { id: "a", name: "Agua" },
      { id: "b", name: "Agua fría" },
      { id: "c", name: "Aguacate" },
    ];
    const map = new Map([
      ["a", merca("1", 1)],
      ["b", merca("1", 1)],
      ["c", merca("2", 1)],
    ]);
    const { lista, sinProducto } = listaParaMercadona(items, map, "x");
    expect(lista.products).toEqual([{ merca_code: "2", quantity: 1 }]);
    expect(sinProducto).toEqual([]);
  });
});

describe("enlaceDeLista", () => {
  it("va a la lista", () => {
    expect(enlaceDeLista("7")).toBe("https://tienda.mercadona.es/shopping-lists/7");
  });
});

describe("fichaMercadona", () => {
  it("lleva a la ficha del producto, también con código con punto", () => {
    expect(fichaMercadona("82380.1")).toBe("https://tienda.mercadona.es/product/82380.1");
  });
});

describe("pedido mínimo de Mercadona", () => {
  it("son 60 € y dice cuánto falta, con céntimos", () => {
    expect(PEDIDO_MINIMO_MERCADONA).toBe(60);
    expect(faltaParaMinimo(47.6)).toBe(12.4);
    expect(faltaParaMinimo(59.99)).toBe(0.01);
  });

  it("con 60 € o más no falta nada; sin total, falta todo", () => {
    expect(faltaParaMinimo(60)).toBe(0);
    expect(faltaParaMinimo(109.14)).toBe(0);
    expect(faltaParaMinimo(undefined)).toBe(60);
  });
});
