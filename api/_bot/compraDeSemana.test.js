import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { familiaDeFilas, RPC_FAMILIA, RPC_FICHA, fichaDePrueba, RPC_PREFERENCIAS_DE_CASA, preferenciasDeFilas } from "./familiaDePrueba.js";
import { MARCA_COMPRA } from "../../src/lib/vocabularios.js";

const leche = { id: "leche|ml", name: "Leche", unit: "ml", have: false, atHome: false, manual: false, sources: [] };
const pan = { id: "pan|ud", name: "Pan", unit: "ud", have: false, atHome: false, manual: false, sources: [] };
const huevos = { id: "huevo|ud", name: "Huevos", unit: "ud", have: false, atHome: false, manual: false, sources: [] };

let semanaGuardada;
let despensaRota = false;
const llamadas = [];
vi.mock("./db.js", () => ({
  select: vi.fn(async (tabla) => {
    if (tabla === "household_state") return [{ state: { data: {} }, bot_rev: 1, updated_at: "2026-11-02T10:00:00Z" }];
    if (tabla === "households") return [{ owner_user_id: "u1" }];
    if (tabla === "user_pantry" && despensaRota) throw new Error("caída");
    if (tabla === "user_menus") return [{ id: "m1", user_id: "u1", is_active: true, updated_at: "2026-11-01T10:00:00Z" }];
    if (tabla === "user_menu_weeks") {
      return [{ menu_id: "m1", week_start: "2026-11-02", week_end: "2026-11-08", week_offset: 0, start_day_idx: 0, active_days: null, plan: { g1: {} }, shopping: semanaGuardada }];
    }
    return [];
  }),
  insert: vi.fn(async () => []),
  update: vi.fn(async () => []),
  rpc: vi.fn(async (fn, args) => {
    llamadas.push([fn, args]);
    if (fn === RPC_FAMILIA) return familiaDeFilas();
    if (fn === RPC_FICHA) return fichaDePrueba();
    if (fn === RPC_PREFERENCIAS_DE_CASA) return preferenciasDeFilas();
    if (fn === "bot_save_casa") return { ok: true, bot_rev: 2 };
    return null;
  }),
  eq: (v) => `eq.${encodeURIComponent(v)}`,
}));
vi.mock("./propias.js", () => ({ recetasPropiasDeCasa: vi.fn(async () => []) }));

// Un motor de juguete: la lista del menú son siempre leche, pan y huevos.
const motorDePrueba = {
  RECIPES_BY_ID: {},
  buildShoppingList: vi.fn(() => ({ byCategory: [{ cat: "Todo", items: [leche, pan] }], pantryItems: [huevos] })),
  getDayMeals: () => ["Comida", "Cena"],
  COLUMNAS_DESPENSA: "id",
  filaDeDespensa: (f) => f,
};

const { cargarCasa, guardarCasa } = await import("./casa.js");
const { usarMotor } = await import("./menu.js");
beforeAll(() => usarMotor(motorDePrueba));

// Cada test pone su semana: ninguno depende de lo que deja otro.
const conMarcas = () => ({ marcas: [
  { id: "leche|ml", nombre: "Leche", unidad: "ml", marcas: [MARCA_COMPRA.COMPRADO] },
  { id: "pan|ud", nombre: "Pan", unidad: "ud", marcas: [MARCA_COMPRA.QUITADO] },
  { id: "manual:cafe:x", nombre: "Café", unidad: "", marcas: [MARCA_COMPRA.ANADIDO] },
] });

describe("la compra de la semana en Lola: derivada más marcas", () => {
  beforeEach(() => { despensaRota = false; });

  it("una semana con marcas se lee como la lista que se ve", async () => {
    semanaGuardada = conMarcas();
    const casa = await cargarCasa("h1", { fresca: true });
    expect(casa.semana.shopping.items.map((it) => [it.name, it.have, Boolean(it.manual)])).toEqual([
      ["Leche", true, false],
      ["Huevos", false, false],
      ["Café", false, true],
    ]);
    expect(casa.semana.compraGuardada).toEqual(semanaGuardada);
  });

  it("al guardar, vuelven a ser marcas: lo tachado ahora se suma, lo quitado sigue quitado", async () => {
    semanaGuardada = conMarcas();
    const casa = await cargarCasa("h1", { fresca: true });
    const items = casa.semana.shopping.items.map((it) => (it.name === "Huevos" ? { ...it, have: true } : it));
    llamadas.length = 0;
    const r = await guardarCasa(casa, { state: casa.state, semana: { shopping: { items } } });
    expect(r.ok).toBe(true);
    const [, args] = llamadas.find(([fn]) => fn === "bot_save_casa");
    expect(args.p_week.shopping.items).toBeUndefined();
    expect(args.p_week.shopping.marcas.map((m) => [m.id, m.marcas])).toEqual([
      ["leche|ml", [MARCA_COMPRA.COMPRADO]],
      ["huevo|ud", [MARCA_COMPRA.COMPRADO]],
      ["manual:cafe:x", [MARCA_COMPRA.ANADIDO]],
      ["pan|ud", [MARCA_COMPRA.QUITADO]],
    ]);
  });

  it("sin poder leer la despensa, la casa no se lee: lo que hay en casa saldría por comprar", async () => {
    semanaGuardada = conMarcas();
    despensaRota = true;
    await expect(cargarCasa("h1", { fresca: true })).rejects.toThrow(/despensa/);
  });

  it("una semana con la lista de antes se lee y se guarda tal cual, sin cargar el motor", async () => {
    semanaGuardada = { items: [{ ...leche, have: true }] };
    motorDePrueba.buildShoppingList.mockClear();
    const casa = await cargarCasa("h1", { fresca: true });
    expect(casa.semana.shopping).toEqual(semanaGuardada);
    expect(casa.semana.compraGuardada).toBeUndefined();
    llamadas.length = 0;
    await guardarCasa(casa, { state: casa.state, semana: { shopping: casa.semana.shopping } });
    const [, args] = llamadas.find(([fn]) => fn === "bot_save_casa");
    expect(args.p_week.shopping).toEqual(semanaGuardada);
    expect(motorDePrueba.buildShoppingList).not.toHaveBeenCalled();
  });
});
