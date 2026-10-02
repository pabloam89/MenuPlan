import { describe, it, expect } from "vitest";
import { MERCADONA_BOOKMARKLET, MERCADONA_PAYLOAD_TAG, mercadonaListPayload } from "./mercadonaList.js";

const merca = (id, packs) => ({ storeProductId: id, storePacks: packs, storePriceSource: "mercadona" });

describe("mercadonaListPayload", () => {
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
    const { payload, sinProducto } = mercadonaListPayload(items, map, "MenuPlan");
    expect(payload).toEqual({
      v: MERCADONA_PAYLOAD_TAG,
      name: "MenuPlan",
      products: [
        { merca_code: "69", quantity: 2 },
        { merca_code: "31", quantity: 3 },
      ],
    });
    expect(sinProducto).toEqual(["Salvia fresca"]);
  });

  it("no manda un precio apuntado a mano como si fuera un producto", () => {
    const map = new Map([["a", { storePrice: 2, storePriceSource: "obs" }]]);
    const { payload, sinProducto } = mercadonaListPayload([{ id: "a", name: "Queso" }], map, "x");
    expect(payload.products).toEqual([]);
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
    expect(mercadonaListPayload(items, map, "x").payload.products).toEqual([{ merca_code: "7", quantity: 2 }]);
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
    const { payload, sinProducto } = mercadonaListPayload(items, map, "x");
    expect(payload.products).toEqual([{ merca_code: "2", quantity: 1 }]);
    expect(sinProducto).toEqual([]);
  });
});

describe("MERCADONA_BOOKMARKLET", () => {
  it("es un javascript: que se puede ejecutar", () => {
    expect(MERCADONA_BOOKMARKLET.startsWith("javascript:")).toBe(true);
    const src = decodeURIComponent(MERCADONA_BOOKMARKLET.slice("javascript:".length));
    expect(() => new Function(src)).not.toThrow();
    expect(src).toContain(MERCADONA_PAYLOAD_TAG);
  });
});
