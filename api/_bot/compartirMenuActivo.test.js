import { describe, it, expect, vi } from "vitest";

// La semana que se comparte sale del menú activo de la TABLA (cargarCasa lo lee
// de user_menus.is_active). La foto se tiene que guardar con ese menu_id, no con
// el data.activeMenuId del JSON, que puede ir por detrás (cambio de grupo).
const selects = [];
vi.mock("./db.js", () => ({
  select: vi.fn(async (tabla, filtro) => {
    selects.push([tabla, filtro]);
    if (tabla === "shared_menus") return [{ id: "sm1" }];
    if (tabla === "menu_share_links") return [{ token: "llave" }];
    return [];
  }),
  insert: vi.fn(async () => []),
  update: vi.fn(async () => []),
  rpc: vi.fn(async () => null),
  eq: (v) => `eq.${encodeURIComponent(v)}`,
}));
vi.mock("./casa.js", () => ({
  cargarCasa: vi.fn(async () => ({
    householdId: "h1",
    state: { data: { activeMenuId: "menu-del-json", members: [] } },
    menu: { id: "menu-de-la-tabla", userId: "u1" },
    semana: { menuId: "menu-de-la-tabla", weekStart: "2026-10-05", weekEnd: "2026-10-11", startDayIdx: 0, plan: { lunes: {} } },
  })),
  conCasa: vi.fn(),
}));
vi.mock("./menu.js", () => ({
  motor: vi.fn(),
  prepararRecetas: vi.fn(async () => ({ RECIPES_BY_ID: {}, buildSharedMenuPayload: () => ({}) })),
  grupos: () => [],
  DIAS: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
  recetasDeCasa: vi.fn(),
  deSerieDelMotor: vi.fn(),
}));
vi.mock("./embudo.js", () => ({ duenoDe: vi.fn(async () => "u1"), rastro: vi.fn() }));
vi.mock("./telegram.js", () => ({ nombreDelBot: vi.fn(async () => "lola_bot") }));

const { enlacesSemana } = await import("./compartir.js");

describe("compartir la semana: el menú activo es el de la tabla", () => {
  it("guarda la foto con el menu_id de user_menus, no con data.activeMenuId", async () => {
    const r = await enlacesSemana("h1", "https://app");
    expect(r?.web).toContain("/m/sm1");
    const [, filtro] = selects.find(([t]) => t === "shared_menus");
    expect(filtro).toContain("menu_id=eq.menu-de-la-tabla");
  });
});
