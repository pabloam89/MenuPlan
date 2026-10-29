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

describe("generar: la semana pedida (#905)", () => {
  it("una semana que ya tiene menú no se rehace sin rehacer: avisa y no escribe nada", async () => {
    cargarCasa.mockResolvedValue({ ...structuredClone(casaVieja), semanas: [{ weekStart: "2000-01-01", weekEnd: "2099-01-01", startDayIdx: 0, plan: {} }] });
    const out = {};
    const texto = await generarMenu("h1", "esta", [], out);
    expect(texto).toMatch(/YA HAY MENÚ/);
    expect(out.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("generar: rehacer la semana en curso (#907)", () => {
  it("la compra sale solo de lo rehecho: hoy y lo pasado vuelven al plan pero no a la compra", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z")); // jueves
    try {
      const viejo = { g1: { "Lun-Comida": { recipeId: "viejo-lunes" }, "Jue-Cena": { recipeId: "viejo-hoy" }, "Vie-Cena": { recipeId: "viejo-vie" } } };
      cargarCasa.mockResolvedValue({ ...structuredClone(casaVieja), semanas: [{ weekStart: "2026-10-19", weekEnd: "2026-10-25", startDayIdx: 0, plan: viejo }] });
      const nuevo = { g1: { "Vie-Cena": { recipeId: "nuevo-vie" } } };
      let enLaCompra = null;
      motor.mockResolvedValue({
        ...m,
        generateMenuWithAI: async () => ({ plan: nuevo, recipes: [] }),
        buildShoppingList: (p) => { enLaCompra = Object.keys(p.g1); return { byCategory: [], pantryItems: [] }; },
      });
      conCasa.mockResolvedValue({ ok: true });
      const out = {};
      await generarMenu("h1", "esta", [], out, { rehacer: true });
      expect(out.ok).toBe(true);
      expect(enLaCompra).toEqual(["Vie-Cena"]);
      expect(nuevo.g1).toMatchObject({ "Lun-Comida": { recipeId: "viejo-lunes" }, "Jue-Cena": { recipeId: "viejo-hoy" }, "Vie-Cena": { recipeId: "nuevo-vie" } });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("generar: la respuesta dice qué semana es (#915)", () => {
  // Sábado 24 oct 2026: la del 26 ya tiene menú, «la siguiente» es la del 2 nov.
  const conSemanaDel26 = () => cargarCasa.mockResolvedValue({ ...structuredClone(casaVieja), semanas: [{ weekStart: "2026-10-26", weekEnd: "2026-11-01", startDayIdx: 0, plan: {} }] });
  const motorConSemanas = () => motor.mockResolvedValue({
    ...m,
    computeWeekRange: (offset) => (offset === 2
      ? { startISO: "2026-11-02", endISO: "2026-11-08", activeDays: ["Lun"] }
      : { startISO: "2026-10-26", endISO: "2026-11-01", activeDays: ["Lun"] }),
  });

  it("«la siguiente» elegida por el código (la primera libre) nombra la semana en palabras", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T10:00:00Z"));
    try {
      conSemanaDel26();
      motorConSemanas();
      conCasa.mockResolvedValue({ ok: true });
      const texto = await generarMenu("h1", "siguiente", [], {});
      expect(texto).toContain("semana del 2 al 8 de noviembre");
      expect(texto).toContain("la primera semana sin menú");
    } finally {
      vi.useRealTimers();
    }
  });

  it("una semana pedida por fecha también la nombra, sin decir «la primera libre»", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T10:00:00Z"));
    try {
      conSemanaDel26();
      motorConSemanas();
      conCasa.mockResolvedValue({ ok: true });
      const texto = await generarMenu("h1", "siguiente", [], {}, { desde: "2026-11-04" });
      expect(texto).toContain("semana del 2 al 8 de noviembre");
      expect(texto).not.toContain("primera semana sin menú");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("la compra de la semana nueva: cada artículo en una sola lista (#958)", () => {
  it("pidiendo la siguiente, lo apuntado a mano se queda solo en la de hoy", async () => {
    const { compraDeLaSemanaNueva } = await import("./generar.js");
    const casa = { menu: { id: "m" }, semanas: [], semana: { shopping: { items: [{ name: "pan", manual: true }] } } };
    const r = compraDeLaSemanaNueva([{ name: "huevos" }], casa, { startISO: "2026-11-02", endISO: "2026-11-08", ponerSemanaNueva: false });
    expect(r.map((i) => i.name)).toEqual(["huevos"]);
  });

  it("si la nueva es la que se ve, lo apuntado a mano pasa, sin repetir lo que ya pide el motor", async () => {
    const { compraDeLaSemanaNueva } = await import("./generar.js");
    const casa = { menu: null, semanas: [], state: { shopping: { items: [{ name: "pan", manual: true }, { name: "Huevo", manual: true }, { name: "sal", manual: true, have: true }] } } };
    const r = compraDeLaSemanaNueva([{ name: "huevos" }], casa, { startISO: "2026-10-26", endISO: "2026-11-01", ponerSemanaNueva: true });
    expect(r.map((i) => i.name)).toEqual(["huevos", "pan"]);
  });

  it("rehaciendo una semana, lo comprado y lo de casa siguen marcados", async () => {
    const { compraDeLaSemanaNueva } = await import("./generar.js");
    const casa = {
      menu: { id: "m" },
      semanas: [{ weekStart: "2026-10-26", weekEnd: "2026-11-01", shopping: { items: [{ name: "Huevos", unit: "ud", have: true }, { name: "Arroz", unit: "g", atHome: true }] } }],
      semana: null,
    };
    const r = compraDeLaSemanaNueva([{ name: "huevos", unit: "ud" }, { name: "arroz", unit: "g" }, { name: "pan", unit: "ud" }], casa, { startISO: "2026-10-29", endISO: "2026-11-01", ponerSemanaNueva: true });
    expect(r.map((i) => [i.name, !!i.have, !!i.atHome])).toEqual([["huevos", true, false], ["arroz", false, true], ["pan", false, false]]);
  });
});
