/**
 * Un nombre que casa con varios alimentos no se suma a ciegas al primero
 * (#958): «patatas fritas onduladas» y «patatas fritas lisas» acabaron
 * sumadas al puré de patata, la primera candidata. Ahora se guardan tal cual
 * las escribieron, sin atarlas al catálogo, y el recibo dice la duda.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertadas = [];

vi.mock("./entradas.js", async (original) => ({ ...(await original()), yaVista: vi.fn(async () => false), primeraVez: vi.fn(async () => true) }));
vi.mock("./embudo.js", () => ({ duenoDe: vi.fn(async () => "u1") }));
// Las patatas fritas, ambiguas; «patata», ambigua pero con una candidata igual.
const CANDIDATAS = [{ normalized: "pure_de_patata", label: "Puré de patata" }, { normalized: "patata", label: "Patata" }];
vi.mock("./menu.js", () => ({
  motor: async () => ({
    normalizePantryInput: (n) => (/patata/i.test(n) ? [{ ambiguous: true, candidates: CANDIDATAS }] : [{ normalized: n.toLowerCase() }]),
    convertStockAmount: () => null,
    resolveIngredientId: () => "id-del-catalogo",
  }),
}));
vi.mock("./db.js", () => ({
  select: vi.fn(async () => []),
  insert: vi.fn(async (_t, f) => { insertadas.push(...f); return f; }),
  update: vi.fn(async (_t, _f, c) => [c]),
  eq: (x) => `eq.${x}`,
}));

const { anadirDespensa } = await import("./despensa.js");

beforeEach(() => { insertadas.length = 0; });

describe("anadir_despensa con un nombre ambiguo", () => {
  it("dos patatas de bolsa no se suman al puré: cada una tal cual, sin catálogo, y con la duda dicha", async () => {
    const r = await anadirDespensa("h", [{ nombre: "Patatas fritas onduladas" }, { nombre: "Patatas fritas lisas" }], "foto");
    expect(insertadas.map((f) => f.ingredient_normalized)).toEqual(["patatas fritas onduladas", "patatas fritas lisas"]);
    expect(insertadas.map((f) => f.ingredient_id)).toEqual([null, null]);
    expect(r.hecho).toEqual([
      "Patatas fritas onduladas (tal cual: podía ser Puré de patata o Patata)",
      "Patatas fritas lisas (tal cual: podía ser Puré de patata o Patata)",
    ]);
  });

  it("si una candidata es justo lo escrito, esa, sin duda", async () => {
    const r = await anadirDespensa("h", [{ nombre: "Patata" }], "texto");
    expect(insertadas.map((f) => [f.ingredient_normalized, f.ingredient_id])).toEqual([["patata", "id-del-catalogo"]]);
    expect(r.hecho).toEqual(["Patata"]);
  });
});
