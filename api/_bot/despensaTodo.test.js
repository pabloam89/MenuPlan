/**
 * anadir_despensa no corta callado (#958): de seis tickets, ~66 cosas, se
 * guardaron 38 y Lola dijo «todo apuntado». Ahora se apunta todo lo que cabe
 * en una llamada, y lo que no (por tope o por unidad), sale en el recibo como
 * sin hacer, con su porqué.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let filas = [];
const insertadas = [];
const consultas = [];

vi.mock("./entradas.js", async (original) => ({ ...(await original()), yaVista: vi.fn(async () => false), primeraVez: vi.fn(async () => true) }));
vi.mock("./embudo.js", () => ({ duenoDe: vi.fn(async () => "u1") }));
vi.mock("./menu.js", () => ({
  motor: async () => ({ normalizePantryInput: (n) => [{ normalized: n.toLowerCase() }], convertStockAmount: () => null, resolveIngredientId: () => null }),
}));
vi.mock("./db.js", () => ({
  select: vi.fn(async (_t, filtro) => { consultas.push(filtro); return filas.map((f) => ({ ...f })); }),
  insert: vi.fn(async (_t, f) => { insertadas.push(...f); return f; }),
  update: vi.fn(async (_t, _f, c) => [c]),
  eq: (x) => `eq.${x}`,
}));

const { anadirDespensa, MAX_POR_VEZ, TANDA_CONSULTA } = await import("./despensa.js");
const { ESTADO } = await import("./resultado.js");
const cosas = (n) => Array.from({ length: n }, (_, i) => ({ nombre: `cosa ${i + 1}` }));

beforeEach(() => { filas = []; insertadas.length = 0; consultas.length = 0; });

describe("anadir_despensa: todo, o lo que falta dicho", () => {
  it("66 cosas de seis tickets: las 66 apuntadas, y lo que hay se mira por tandas", async () => {
    const r = await anadirDespensa("h", cosas(66), "foto");
    expect(r.estado).toBe(ESTADO.HECHO);
    expect(r.hecho).toHaveLength(66);
    expect(insertadas).toHaveLength(66);
    expect(consultas).toHaveLength(Math.ceil(66 / TANDA_CONSULTA));
  });

  it("lo que no cabe en una vez sale como sin hacer, con su porqué", async () => {
    const r = await anadirDespensa("h", cosas(MAX_POR_VEZ + 5), "foto");
    expect(r.estado).toBe(ESTADO.PARCIAL);
    expect(r.hecho).toHaveLength(MAX_POR_VEZ);
    expect(r.sinHacer.map((s) => s.que)).toEqual(["cosa 151", "cosa 152", "cosa 153", "cosa 154", "cosa 155"]);
    expect(r.sinHacer[0].motivo).toMatch(/otro mensaje/);
  });

  it("lo que ya estaba en otra unidad no sale como apuntado: va a sin hacer, con la unidad que tiene", async () => {
    filas = [{ id: 1, ingredient_normalized: "leche", qty: 1000, unit: "ml", frozen: false }];
    const r = await anadirDespensa("h", [{ nombre: "Leche", cantidad: 2, unidad: "ud" }, { nombre: "Pan" }], "texto");
    expect(r.estado).toBe(ESTADO.PARCIAL);
    expect(r.hecho).toEqual(["Pan"]);
    expect(r.sinHacer).toEqual([{ que: "Leche", motivo: "ya estaba en mililitros y viene en unidades: dime cuánto en mililitros" }]);
  });
});
