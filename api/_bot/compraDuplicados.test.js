/**
 * Un artículo repetido se tacha (#958, clase D). Las listas guardadas ya traen
 * duplicados con el mismo nombre (163 en 26 de 66 semanas, 29 oct 2026), y
 * antes «leche, leche» preguntaba «¿cuál?» para siempre. Y apuntar lo que ya
 * está no lo duplica.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(async () => []), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), borrar: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), rastro: vi.fn(), EMBUDO: {}, duenoDe: vi.fn() }));
let items = [];
let escrito = null;
vi.mock("./casa.js", async (original) => ({
  ...(await original()),
  conCasa: vi.fn(async (_h, cambiar) => {
    const casa = { householdId: "h1", botRev: 1, semana: null, state: { shopping: { items: structuredClone(items) } } };
    escrito = await cambiar(casa);
    return { ok: true, casa };
  }),
}));

const { marcarCompra, anadirCompra } = await import("./menu.js");

beforeEach(() => { escrito = null; });

describe("tachar con duplicados", () => {
  it("dos «Leche» son la misma: se tachan las dos, sin preguntar", async () => {
    items = [{ id: "a", name: "Leche", have: false }, { id: "b", name: "leche", have: false }, { id: "c", name: "Pan", have: false }];
    const out = {};
    const texto = await marcarCompra("h1", ["leche"], "comprado", out, { soloSiClaro: true });
    expect(out.dudosos).toEqual([]);
    expect(texto).not.toMatch(/dime cuál/);
    expect(escrito.state.shopping.items.filter((i) => i.have).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("dos leches distintas sí se preguntan", async () => {
    items = [{ id: "a", name: "Leche entera" }, { id: "b", name: "Leche semidesnatada" }];
    const out = {};
    await marcarCompra("h1", ["leche"], "comprado", out);
    expect(out.dudosos).toHaveLength(1);
  });
});

describe("apuntar lo que ya está", () => {
  it("no duplica y lo dice", async () => {
    items = [{ id: "a", name: "Leche", have: false }];
    const out = {};
    const texto = await anadirCompra("h1", ["leche"], out);
    expect(escrito).toBeNull();
    expect(out.yaEstaban).toEqual(["Leche"]);
    expect(texto).toMatch(/Ya estaba/);
  });

  it("lo tachado vuelve a la lista, sin otra fila", async () => {
    items = [{ id: "a", name: "Leche", have: true }];
    const out = {};
    await anadirCompra("h1", ["leche", "pan"], out);
    expect(escrito.state.shopping.items.map((i) => [i.name, !!i.have])).toEqual([["Leche", false], ["pan", false]]);
    expect(out.devueltos).toEqual(["Leche"]);
    expect(out.nuevos).toEqual(["pan"]);
  });
});
