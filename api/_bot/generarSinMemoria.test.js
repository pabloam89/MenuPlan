/**
 * Si no se pueden leer las semanas anteriores, «no sé qué hubo» no es «no hubo
 * nada»: se genera sin memoria y aiRecipes no se poda (revisor de #966, C5).
 * Antes la lectura fallida daba [] y la poda borraba las recetas de esas semanas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(), insert: vi.fn(), borrar: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({ cargarCasa: vi.fn(), conCasa: vi.fn() }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), rastro: vi.fn(), EMBUDO: {} }));
vi.mock("./menu.js", () => ({
  motor: vi.fn(), describirMenu: vi.fn(async () => ""), masParecida: vi.fn(), normal: (s) => s, prepararRecetas: vi.fn(), DIA_LARGO: {},
}));

const { select, insert } = await import("./db.js");
const { cargarCasa, conCasa } = await import("./casa.js");
const { motor } = await import("./menu.js");
const { generarMenu, semanasAnteriores } = await import("./generar.js");
// Las cuentas del presupuesto, las de verdad (core.mjs las exporta, #958).
const { estimarSemana, frasePresupuesto } = await import("../../src/lib/presupuesto.js");

const plan = { g1: { "Lun-Cena": { recipeId: "r1" } } };
const m = {
  recipeCatalog: [], resolveModeData: (d) => d, membersOfGroup: (g, ms) => ms,
  groupsFromModel: () => [{ id: "g1", label: "Todos" }], explicitDaysForOffset: () => null,
  computeWeekRange: () => ({ startISO: "2026-10-05", endISO: "2026-10-11", activeDays: ["Lun"] }),
  prepararSemana: () => ({ weekData: {}, crossWeek: null, weekSchedule: {} }),
  generateMenuWithAI: async () => ({ plan, recipes: [{ id: "r1", name: "Tortilla" }] }),
  registerRecipes: () => {}, buildShoppingList: () => ({ byCategory: [], pantryItems: [] }),
  getDayMeals: () => ({}), createMenuId: () => "menu-nuevo", menuToRow: (menu) => ({ id: menu.id }),
  weekToRow: () => ({}), COLUMNAS_DESPENSA: "*", filaDeDespensa: (f) => f, tipoDeGrupo: () => "familia",
  estimarSemana, frasePresupuesto,
};
const casa = {
  householdId: "h1", botRev: 3, menu: { id: "menu-viejo" }, semanas: [], semana: null,
  state: { data: { members: [{ id: "p1", name: "Ana", alergiasRevisadas: true }], groups: [{ id: "g1", label: "Todos" }] }, shopping: { items: [] }, aiRecipes: [{ id: "de-la-semana-pasada" }] },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  motor.mockResolvedValue(m);
  cargarCasa.mockResolvedValue(structuredClone(casa));
  insert.mockResolvedValue([]);
});

describe("semanas anteriores que no se pueden leer", () => {
  it("semanasAnteriores da null, no una lista vacía", async () => {
    select.mockRejectedValue(new Error("500"));
    expect(await semanasAnteriores("h1", "2026-10-05")).toBeNull();
  });

  it("generar no poda aiRecipes si no sabe qué semanas hubo", async () => {
    select.mockImplementation(async (tabla, filtro) => {
      if (tabla === "households") return [{ owner_user_id: "u1" }];
      if (tabla === "user_menu_weeks" && /week_start=lte/.test(filtro)) throw new Error("500");
      return [];
    });
    let cambios;
    conCasa.mockImplementation(async (_h, cambiar) => { cambios = await cambiar(structuredClone(casa)); return { ok: true }; });
    await generarMenu("h1", "esta", [], {});
    expect(cambios.state.aiRecipes.map((r) => r.id)).toEqual(["de-la-semana-pasada", "r1"]);
  });

  it("si las lee, sí poda lo que ya no sale en ninguna", async () => {
    select.mockImplementation(async (tabla) => (tabla === "households" ? [{ owner_user_id: "u1" }] : []));
    let cambios;
    conCasa.mockImplementation(async (_h, cambiar) => { cambios = await cambiar(structuredClone(casa)); return { ok: true }; });
    await generarMenu("h1", "esta", [], {});
    expect(cambios.state.aiRecipes.map((r) => r.id)).toEqual(["r1"]);
  });
});

describe("semana ambigua en la app", () => {
  it("no guarda y lo deja dicho en la consola", async () => {
    const { semanaPorOffset } = await import("../../src/lib/menuArchive.js");
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(semanaPorOffset({ a: { offset: 0 }, b: { offset: 0 } }, 0)).toBeNull();
    expect(aviso).toHaveBeenCalledTimes(1);
    aviso.mockRestore();
  });
});
