import { describe, it, expect, beforeEach } from "vitest";
import { loadLocalPantry, addLocalPantryItems } from "./pantry.js";

// addLocalPantryItems is the synchronous, localStorage-backed twin of
// addPantryItems (used signed-out) — same resolveIngredientId() call on
// write, but testable without mocking the Supabase query builder chain.
function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

describe("addLocalPantryItems resolves ingredientId on write (Fase 8)", () => {
  beforeEach(() => {
    globalThis.localStorage = makeMemoryStorage();
  });

  it("stores the canonical id for a name the catalog resolves", () => {
    addLocalPantryItems([{ name: "Ajo", normalized: "ajo", qty: 3, unit: "ud" }]);
    const [row] = loadLocalPantry();
    expect(row.ingredientId).toBe("ajo");
  });

  it("stores the same id for a real alias with different words (Fabes / Judiones)", () => {
    addLocalPantryItems([{ name: "Judiones", normalized: "judiones", qty: 500, unit: "g" }]);
    const [row] = loadLocalPantry();
    expect(row.ingredientId).toBe("alubia-grande");
  });

  it("stores null (never throws or invents an id) for a name outside the catalog", () => {
    addLocalPantryItems([{ name: "Ingrediente inventado xyz123", normalized: "ingrediente_inventado_xyz123", qty: 1, unit: "ud" }]);
    const [row] = loadLocalPantry();
    expect(row.ingredientId).toBeNull();
  });
});
