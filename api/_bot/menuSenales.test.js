// cambiar_plato cuenta las señales del cambio (trozo 15): motor real, base y señales falsas. Lo que se prueba es el
// cableado: qué plato sale, cuál entra, con qué motivo, y que el plato cambia aunque contarlas falle.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(async () => []), insert: vi.fn(async () => {}), eq: (v) => `eq.${v}` }));
let casaDeHoy = null;
vi.mock("./casa.js", () => ({
  hoyISO: () => "2026-10-05",
  cargarCasa: vi.fn(async () => casaDeHoy),
  conCasa: vi.fn(async (_id, cambiar) => ((await cambiar(casaDeHoy)) ? { ok: true } : { ok: true, sinCambios: true })),
}));
vi.mock("./embudo.js", () => ({ rastro: vi.fn(), registrar: vi.fn(), EMBUDO: {} }));
const sumadas = vi.hoisted(() => ({ llamadas: [], falla: false }));
vi.mock("./aprender.js", () => ({
  sumarSenales: vi.fn(async (casa, senales) => {
    sumadas.llamadas.push({ casa, senales });
    if (sumadas.falla) throw new Error("sin base");
  }),
}));

const core = await import("../../src/server/botCore.js");
const { cambiarPlato, usarMotor } = await import("./menu.js");
const { senalesDeCambio } = await import("../../src/lib/senales.js");

const data = {
  members: [{ id: "m1", name: "Ana", age: 38 }, { id: "m2", name: "Luis", age: 40 }],
  groups: [{ id: "g1", label: "Familia", memberIds: ["m1", "m2"] }],
  schedule: {},
};
const casaCon = (recipeId) => {
  const plan = { g1: { "Vie-Cena": { recipeId, eaters: 2 } } };
  return {
    householdId: "h",
    state: { data, aiRecipes: [], menuPlan: plan },
    menu: { id: "menu1", userId: "u1" },
    semanaViva: "2026-10-05",
    semanas: [{ weekStart: "2026-10-05", weekEnd: "2026-10-11", plan, shopping: { items: [] } }],
  };
};
const SALE = "g1__sopas_cremas_046";
const pool = () => core.pickCatalogReplacement(data, casaCon(SALE).semanas[0].plan, { groupId: "g1", day: "Vie", meal: "Cena", course: "main", candidatos: 60 })?.candidatos ?? [];
const sinPrefijo = (id) => String(id).split("__").pop();

beforeAll(() => usarMotor(core));
beforeEach(() => { sumadas.llamadas = []; sumadas.falla = false; casaDeHoy = casaCon(SALE); vi.spyOn(Math, "random").mockReturnValue(0.5); });
afterEach(() => vi.restoreAllMocks());

describe("cambiar_plato cuenta lo que dice el cambio", () => {
  it("pedido por su nombre: baja lo del plato que sale y sube lo del que entra, una vez", async () => {
    const pedida = pool().find((r) => senalesDeCambio({ entra: r, motivo: "pedido" }).length);
    const out = {};
    await cambiarPlato("h", { dia: "viernes", franja: "Cena", receta: pedida.name }, null, out);
    expect(out.cambiado).toBe(true);
    const sale = core.recipeCatalogById[sinPrefijo(SALE)];
    const entra = core.RECIPES_BY_ID[out.recetaId];
    expect(sumadas.llamadas).toEqual([{ casa: "h", senales: senalesDeCambio({ sale, entra, motivo: "pedido" }) }]);
    expect(sumadas.llamadas[0].senales.some((s) => s.delta > 0)).toBe(true);
  });

  it("«cámbialo» sin más: el que entra lo elige el motor y solo cuenta lo que sale", async () => {
    await cambiarPlato("h", { dia: "viernes", franja: "Cena" }, null, {});
    expect(sumadas.llamadas).toHaveLength(1);
    expect(sumadas.llamadas[0].senales.every((s) => s.delta < 0)).toBe(true);
  });

  it("con quien viene de fuera, el cambio es por él y no cuenta", async () => {
    const out = {};
    await cambiarPlato("h", { dia: "viernes", franja: "Cena", deFuera: { alergias: ["gluten"] } }, null, out);
    expect(out.cambiado).toBe(true);
    expect(sumadas.llamadas).toEqual([]);
  });

  it("si contar falla, el plato ya está cambiado y queda en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    sumadas.falla = true;
    const out = {};
    await cambiarPlato("h", { dia: "viernes", franja: "Cena" }, null, out);
    expect(out.cambiado).toBe(true);
    expect(log.mock.calls.map((c) => JSON.parse(c[0])).find((l) => l.donde === "menu_senales")).toMatchObject({ evento: "bot_fallo", grave: true });
  });
});
