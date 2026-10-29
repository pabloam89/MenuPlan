/**
 * anadir_despensa no corta callado (#958): seis tickets, ~66 cosas, se
 * guardaron 38 y Lola dijo «todo apuntado». Ahora se apunta todo lo que cabe
 * en una llamada y lo que no, sale en el recibo como sin hacer.
 */
import { describe, it, expect, vi } from "vitest";

const insertadas = [];
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  select: vi.fn(async () => []),
  insert: vi.fn(async (_t, filas) => { insertadas.push(...filas); return filas; }),
  update: vi.fn(async () => []),
}));
vi.mock("./embudo.js", () => ({ duenoDe: vi.fn(async () => "u1") }));
vi.mock("./menu.js", () => ({
  normal: (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim(),
  motor: async () => ({
    normalizePantryInput: (n) => [{ raw: n, normalized: n.toLowerCase(), matched: true, ambiguous: false }],
    convertStockAmount: () => null,
    resolveIngredientId: () => null,
  }),
}));

const { anadirDespensa, MAX_POR_VEZ } = await import("./despensa.js");

describe("anadir_despensa: todo, o lo que falta dicho", () => {
  it("66 cosas de seis tickets: las 66 apuntadas", async () => {
    insertadas.length = 0;
    const items = Array.from({ length: 66 }, (_, i) => ({ nombre: `cosa ${i + 1}` }));
    const r = await anadirDespensa("h1", items, "foto");
    expect(r.estado).toBe("hecho");
    expect(r.hecho).toHaveLength(66);
    expect(insertadas).toHaveLength(66);
  });

  it("lo que no cabe en una vez sale como sin hacer, con su porqué", async () => {
    insertadas.length = 0;
    const items = Array.from({ length: MAX_POR_VEZ + 5 }, (_, i) => ({ nombre: `cosa ${i + 1}` }));
    const r = await anadirDespensa("h1", items, "foto");
    expect(r.estado).toBe("parcial");
    expect(r.sinHacer).toHaveLength(5);
    expect(r.sinHacer[0].motivo).toMatch(/otro mensaje/);
  });
});
