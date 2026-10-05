import { describe, it, expect, vi } from "vitest";

vi.mock("./db.js", async (original) => ({
  ...(await original()),
  select: vi.fn(async () => { throw new Error("sin red"); }),
}));

const { rehacerCompra, leerDespensa } = await import("./menu.js");

// Un motor falso que apunta qué despensa le llega y la usa como el de verdad:
// lo que hay en casa sale como «fromPantry» y no como algo que comprar.
function motorFalso() {
  const llamadas = [];
  return {
    llamadas,
    getDayMeals: () => ["Cena"],
    buildShoppingList: (_plan, _gs, _meals, despensa) => {
      llamadas.push(despensa);
      const enCasa = new Set((despensa ?? []).map((d) => d.name));
      const items = ["leche", "pollo"].map((n) => ({ id: n, name: n, fromPantry: enCasa.has(n) }));
      return { byCategory: [{ items: items.filter((i) => !i.fromPantry) }], pantryItems: items.filter((i) => i.fromPantry) };
    },
  };
}

describe("rehacer la compra tras cambiar un plato o una ausencia", () => {
  it("usa la despensa de la casa, como al generar", () => {
    const m = motorFalso();
    const compra = rehacerCompra(m, {}, {}, [], { items: [] }, [{ name: "leche" }]);
    expect(m.llamadas[0]).toEqual([{ name: "leche" }]);
    expect(compra.items.find((i) => i.id === "leche")?.fromPantry).toBe(true);
  });

  it("si la despensa no se pudo leer, lo que ya cubría sigue cubierto", () => {
    const m = motorFalso();
    const antes = { items: [{ id: "leche", name: "leche", fromPantry: true }, { id: "pollo", name: "pollo" }] };
    const compra = rehacerCompra(m, {}, {}, [], antes, null);
    expect(compra.items.find((i) => i.id === "leche")?.fromPantry).toBe(true);
    expect(compra.items.find((i) => i.id === "pollo")?.fromPantry).toBe(false);
  });

  it("conserva lo comprado y lo añadido a mano", () => {
    const m = motorFalso();
    const antes = { items: [{ id: "pollo", name: "pollo", have: true }, { id: "manual:pan", name: "pan", manual: true }] };
    const compra = rehacerCompra(m, {}, {}, [], antes, []);
    expect(compra.items.find((i) => i.id === "pollo")?.have).toBe(true);
    expect(compra.items.some((i) => i.id === "manual:pan")).toBe(true);
  });

  it("un fallo al leer la despensa devuelve null, no una despensa vacía", async () => {
    expect(await leerDespensa({ COLUMNAS_DESPENSA: "*", filaDeDespensa: (f) => f }, "casa-1")).toBeNull();
  });
});
