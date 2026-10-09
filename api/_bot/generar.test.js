/**
 * Generar un menú: o queda activo y la casa lo sabe, o no queda nada y se dice.
 * Antes se activaba con dos PATCH sueltos y, si la foto de la casa no entraba,
 * se respondía igual «generado y activado».
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(), insert: vi.fn(), borrar: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({ cargarCasa: vi.fn(), conCasa: vi.fn() }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), rastro: vi.fn(), EMBUDO: {} }));
vi.mock("./menu.js", () => ({
  motor: vi.fn(), describirMenu: vi.fn(async () => ""), masParecida: vi.fn(), normal: (s) => s, prepararRecetas: vi.fn(), DIA_LARGO: {},
}));

const { select, insert, borrar } = await import("./db.js");
const { cargarCasa, conCasa } = await import("./casa.js");
const { motor } = await import("./menu.js");
const { generarMenu } = await import("./generar.js");

const plan = { Lun: { Cena: { recipeId: "r1" } } };
const m = {
  recipeCatalog: [],
  resolveModeData: (d) => d,
  membersOfGroup: (g, ms) => ms,
  groupsFromModel: () => [{ id: "g1", label: "Todos" }],
  explicitDaysForOffset: () => null,
  computeWeekRange: () => ({ startISO: "2026-10-05", endISO: "2026-10-11", activeDays: ["Lun"] }),
  prepararSemana: () => ({ weekData: {}, crossWeek: null, weekSchedule: {} }),
  generateMenuWithAI: async () => ({ plan, recipes: [{ id: "r1", name: "Tortilla" }] }),
  registerRecipes: () => {},
  buildShoppingList: () => ({ byCategory: [{ items: [{ name: "huevos" }] }], pantryItems: [] }),
  getDayMeals: () => ({}),
  createMenuId: () => "menu-nuevo",
  menuToRow: (menu) => ({ id: menu.id }),
  weekToRow: () => ({}),
  COLUMNAS_DESPENSA: "*",
  filaDeDespensa: (f) => f,
};

const casaVieja = {
  householdId: "h1", botRev: 3,
  state: { data: { members: [{ id: "p1" }], groups: [{ id: "g1", label: "Todos" }] }, shopping: { items: [] } },
  menu: { id: "menu-viejo" }, semanas: [], semana: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  motor.mockResolvedValue(m);
  cargarCasa.mockResolvedValue(structuredClone(casaVieja));
  select.mockImplementation(async (tabla) => (tabla === "households" ? [{ owner_user_id: "u1" }] : []));
  insert.mockResolvedValue([]);
  borrar.mockResolvedValue(null);
});

describe("generar menú: todo o nada", () => {
  it("activa el menú en la misma escritura que la casa, con lo apuntado a mano MIENTRAS generaba", async () => {
    // Mientras el motor pensaba alguien dijo «apunta pan»: la casa fresca lo tiene.
    const fresca = { ...structuredClone(casaVieja), botRev: 4, state: { ...casaVieja.state, shopping: { items: [{ name: "pan", manual: true }] } } };
    let cambios;
    conCasa.mockImplementation(async (_h, cambiar) => { cambios = await cambiar(fresca); return { ok: true }; });
    const out = {};
    const texto = await generarMenu("h1", "esta", [], out);
    expect(cambios.activar).toBe("menu-nuevo");
    expect(cambios.state.data.activeMenuId).toBe("menu-nuevo");
    expect(cambios.state.shopping.items.map((i) => i.name)).toEqual(["huevos", "pan"]);
    expect(cambios.semana.shopping.items.map((i) => i.name)).toEqual(["huevos", "pan"]);
    expect(out.ok).toBe(true);
    expect(texto).toMatch(/generado y activado/);
    expect(borrar).not.toHaveBeenCalled();
  });

  it("si la casa no se guarda, no dice «activado»: borra el menú a medias y lo dice", async () => {
    conCasa.mockResolvedValue({ ok: false, error: "conflicto persistente" });
    const out = {};
    const texto = await generarMenu("h1", "esta", [], out);
    expect(texto).toMatch(/^NO GUARDADO/);
    expect(texto).not.toMatch(/activado/);
    expect(out.ok).toBe(false);
    expect(borrar.mock.calls.map(([t]) => t)).toEqual(["user_menu_recipes", "user_menu_weeks", "user_menus"]);
    // Solo se borra si sigue inactivo.
    expect(borrar.mock.calls[2][1]).toMatch(/is_active=eq\.false/);
  });

  it("si falla al meter las semanas, no deja el menú a medias en el historial", async () => {
    insert.mockImplementation(async (tabla) => { if (tabla === "user_menu_weeks") throw new Error("500"); return []; });
    await expect(generarMenu("h1", "esta", [], {})).rejects.toThrow("500");
    expect(borrar).toHaveBeenCalled();
    expect(conCasa).not.toHaveBeenCalled();
  });

  it("las semanas que se quedan pasan al dueño del menú nuevo, aunque las guardara un cotitular", async () => {
    // La FK (user_id, menu_id) → user_menus: una semana copiada con el user_id
    // del menú viejo (de un cotitular) no entra en el menú nuevo, que es del titular.
    cargarCasa.mockResolvedValue({ ...structuredClone(casaVieja), semanas: [{ weekStart: "2099-01-05", weekEnd: "2099-01-11" }] });
    select.mockImplementation(async (tabla) => {
      if (tabla === "households") return [{ owner_user_id: "u1" }];
      if (tabla === "user_menu_weeks") return [{ user_id: "u2", household_id: "h1", week_start: "2099-01-05", plan: {} }];
      return [];
    });
    conCasa.mockResolvedValue({ ok: true });
    await generarMenu("h1", "esta", [], {});
    const semanas = insert.mock.calls.find(([t]) => t === "user_menu_weeks")[1];
    const copiada = semanas.find((w) => w.week_start === "2099-01-05");
    expect(copiada).toMatchObject({ user_id: "u1", menu_id: "menu-nuevo" });
  });
});

describe("(d) el recordatorio de alergias por silencio (#229)", () => {
  const porSilencio = (extra = {}) => ({
    ...structuredClone(casaVieja),
    state: {
      ...casaVieja.state,
      data: { ...casaVieja.state.data, members: [{ id: "p1", allergies: [], alergiasRevisadas: true, alergiasOrigen: "por_silencio" }], ...extra },
    },
  });

  it("el primer menú lo pide, y la marca va en la MISMA escritura que el menú", async () => {
    let cambios;
    conCasa.mockImplementation(async (_h, cambiar) => { cambios = await cambiar(porSilencio()); return { ok: true }; });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const out = {};
    await generarMenu("h1", "esta", [], out);
    expect(out.recordarSilencio).toBe(true);
    expect(cambios.state.data.alergiasSilencioRecordado).toBe(true);
    expect(info.mock.calls.map(([l]) => JSON.parse(l))).toEqual([{ evento: "bot_alergias", accion: "recordada", origen: "por_silencio", canal: "telegram" }]);
    info.mockRestore();
  });

  it("el segundo, no: sale una vez y no dos", async () => {
    conCasa.mockImplementation(async (_h, cambiar) => { await cambiar(porSilencio({ alergiasSilencioRecordado: true })); return { ok: true }; });
    const out = {};
    await generarMenu("h1", "esta", [], out);
    expect(out.recordarSilencio).toBe(false);
  });

  it("sin nadie por silencio, tampoco", async () => {
    conCasa.mockImplementation(async (_h, cambiar) => { await cambiar(structuredClone(casaVieja)); return { ok: true }; });
    const out = {};
    await generarMenu("h1", "esta", [], out);
    expect(out.recordarSilencio).toBe(false);
  });
});

describe("generar menú con las recetas propias", () => {
  it("el motor recibe las de user_recipes (las de la app), no solo las del JSON", async () => {
    const propia = { id: "user_app1", name: "Tortilla de la abuela", source: "user" };
    cargarCasa.mockResolvedValue({ ...structuredClone(casaVieja), recetasPropias: [propia] });
    conCasa.mockResolvedValue({ ok: true });
    const prepararSemana = vi.spyOn(m, "prepararSemana");
    await generarMenu("h1", "esta", [], {});
    expect(prepararSemana.mock.calls[0][0].userRecipes).toEqual([propia]);
    prepararSemana.mockRestore();
  });
});

describe("colocarPedidos", () => {
  it("pasa el `hoy` de la casa a pickCatalogReplacement (la vigencia no puede ir por el reloj del servidor)", async () => {
    const { colocarPedidos } = await import("./generar.js");
    const { isoDeCasa } = await import("../../src/lib/dias.js");
    const receta = { id: "lentejas", name: "Lentejas", time: 30, mealRole: ["main"] };
    const pick = vi.fn(() => ({ recipeId: "lentejas", frontendRecipe: receta }));
    const motorFalso = { recipeCatalogById: { lentejas: receta }, pickCatalogReplacement: pick, registerRecipes: () => {} };
    const planDeSemana = { g1: { "Lun-Comida": { recipeId: "otra" } } };
    const pedidos = [{ pedido: "lentejas", fijo: { catalogId: "lentejas", meals: ["Comida"] } }];
    expect(colocarPedidos(motorFalso, {}, planDeSemana, [], pedidos, ["Lun"])).toEqual(["lentejas"]);
    expect(pick.mock.calls[0][2].hoy).toBe(isoDeCasa());
  });
});
