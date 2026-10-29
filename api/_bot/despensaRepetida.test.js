/**
 * La misma lista dos veces seguidas (un doble «Sí») no suma dos veces en la
 * despensa (#958). Y si la cantidad cambió entre leer y escribir, se relee.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const vistas = new Set();
const escritas = [];
let filas = [];
let choques = 0;

// esDuplicado, el de verdad: despensa.js ya no lleva su copia (#958).
vi.mock("./entradas.js", async (original) => ({
  esDuplicado: (await original()).esDuplicado,
  yaVista: vi.fn(async (_p, x) => vistas.has(x)),
  primeraVez: vi.fn(async (_p, x) => { const nueva = !vistas.has(x); vistas.add(x); return nueva; }),
}));
vi.mock("./embudo.js", () => ({ duenoDe: vi.fn(async () => "u1") }));
vi.mock("./menu.js", () => ({
  motor: async () => ({
    normalizePantryInput: (n) => [{ normalized: n.toLowerCase() }],
    convertStockAmount: () => null,
    resolveIngredientId: () => null,
  }),
}));
vi.mock("./db.js", () => ({
  select: vi.fn(async () => filas.map((f) => ({ ...f }))),
  insert: vi.fn(async (_t, f) => { escritas.push(["insert", f]); filas.push(...f.map((x, i) => ({ id: 100 + i, ...x }))); return f; }),
  update: vi.fn(async (_t, filtro, cambios) => {
    // Otra escritura se cruza la primera vez: la cantidad ya no es la leída.
    if (choques-- > 0) { filas[0].qty = Number(filas[0].qty) + 1; return []; }
    escritas.push(["update", filtro, cambios]);
    filas[0].qty = cambios.qty;
    return [filas[0]];
  }),
  eq: (x) => `eq.${x}`,
}));

const { anadirDespensa } = await import("./despensa.js");

beforeEach(() => { vistas.clear(); escritas.length = 0; filas = []; choques = 0; });

describe("la despensa con identidad", () => {
  it("un doble «Sí» no duplica el stock", async () => {
    await anadirDespensa("h", [{ nombre: "Arroz", cantidad: 1, unidad: "kg" }], "foto");
    const r = await anadirDespensa("h", [{ nombre: "Arroz", cantidad: 1, unidad: "kg" }], "foto");
    expect(r).toMatch(/NO lo he sumado otra vez/);
    expect(escritas).toHaveLength(1);
  });

  it("con «otra vez» dicho, sí suma", async () => {
    await anadirDespensa("h", [{ nombre: "Arroz", cantidad: 1, unidad: "kg" }], "foto");
    await anadirDespensa("h", [{ nombre: "Arroz", cantidad: 1, unidad: "kg" }], "foto", { otraVez: true });
    expect(filas[0].qty).toBe(2000);
  });

  it("si otra escritura cambió la cantidad entre medias, se relee y no se pisa", async () => {
    filas = [{ id: 1, ingredient_normalized: "arroz", qty: 500, unit: "g", frozen: false }];
    choques = 1;
    await anadirDespensa("h", [{ nombre: "Arroz", cantidad: 100, unidad: "g" }], "texto");
    // 500 + 1 (la otra) + 100 (la nuestra): nada se pierde.
    expect(filas[0].qty).toBe(601);
  });
});
