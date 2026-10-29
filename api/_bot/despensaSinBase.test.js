/**
 * Sin poder mirar si la misma lista ya se apuntó, la despensa no suma a
 * ciegas: un doble «Sí» con la base a medias duplicaría el stock (#958).
 */
import { describe, it, expect, vi } from "vitest";

const escritas = [];

vi.mock("./entradas.js", async (original) => {
  const { SIN_LEER } = await import("./avisar.js");
  return { ...(await original()), yaVista: vi.fn(async () => SIN_LEER), primeraVez: vi.fn(async () => true) };
});
vi.mock("./embudo.js", () => ({ duenoDe: vi.fn(async () => "u1") }));
vi.mock("./menu.js", () => ({
  motor: async () => ({ normalizePantryInput: (n) => [{ normalized: n.toLowerCase() }], convertStockAmount: () => null, resolveIngredientId: () => null }),
}));
vi.mock("./db.js", () => ({
  select: vi.fn(async () => []),
  insert: vi.fn(async (_t, f) => { escritas.push(f); return f; }),
  update: vi.fn(async (_t, _f, c) => { escritas.push(c); return [c]; }),
  eq: (x) => `eq.${x}`,
}));

const { anadirDespensa } = await import("./despensa.js");

describe("la despensa sin base", () => {
  it("si no se puede mirar si ya estaba, no suma a ciegas y lo dice", async () => {
    const r = await anadirDespensa("h", [{ nombre: "Arroz", cantidad: 1, unidad: "kg" }], "foto");
    expect(r).toMatch(/NO GUARDADO/);
    expect(escritas).toEqual([]);
  });
});
