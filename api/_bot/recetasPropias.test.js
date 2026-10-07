/**
 * Las recetas propias que Lola ve son las de `user_recipes`, como en la app.
 * La app quita `userRecipes` del JSON de la casa en cada guardado: si el bot
 * solo miraba ahí, una receta creada en la app no existía para Lola.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tablas = {};
const pedidas = [];
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${encodeURIComponent(v)}`,
  insert: vi.fn(), update: vi.fn(), rpc: vi.fn(),
  select: vi.fn(async (tabla, filtro) => {
    pedidas.push({ tabla, filtro });
    const t = tablas[tabla];
    if (t instanceof Error) throw t;
    return typeof t === "function" ? t(filtro) : t ?? [];
  }),
}));

const { cargarCasa } = await import("./casa.js");
const { montarFicha } = await import("./ficha.js");

const PABLO = { id: "p", name: "Pablo", age: 39, allergies: [], alergiasRevisadas: true };
const filaDeApp = {
  id: "user_app1", owner_id: "u1", name: "Tortilla de la abuela", category: "huevos", main_protein: "huevo",
  meal_roles: ["main"], ingredients: [{ name: "huevo", qty: 4, unit: "ud" }], steps: [], created_at: "2026-10-01T10:00:00Z",
};

beforeEach(() => {
  pedidas.length = 0;
  tablas.household_state = [{ state: { data: { members: [PABLO], userRecipes: [{ id: "user_viejo", name: "Lentejas de antes", source: "user" }] } }, bot_rev: 1 }];
  tablas.households = [{ owner_user_id: "u1" }];
  tablas.user_menus = [];
  tablas.user_recipes = (filtro) => (filtro.includes("owner_id=eq.u1") ? [filaDeApp] : []);
});

describe("las recetas propias de la casa", () => {
  it("una receta creada en la app (solo en user_recipes) sale en la ficha de Lola", async () => {
    const ficha = montarFicha(await cargarCasa("casa-a"), {}, "2026-10-07");
    expect(ficha.estable).toMatch(/Tortilla de la abuela/);
    // Lo que aún queda en el JSON de antes no se pierde.
    expect(ficha.estable).toMatch(/Lentejas de antes/);
    expect(ficha.estable).toMatch(/2 recetas propias/);
  });

  it("son las del dueño de la casa, en una sola consulta", async () => {
    await cargarCasa("casa-b");
    const deRecetas = pedidas.filter((p) => p.tabla === "user_recipes");
    expect(deRecetas).toHaveLength(1);
    expect(deRecetas[0].filtro).toMatch(/owner_id=eq\.u1/);
  });

  it("si user_recipes falla, queda lo del JSON", async () => {
    tablas.user_recipes = new Error("500");
    const ficha = montarFicha(await cargarCasa("casa-c"), {}, "2026-10-07");
    expect(ficha.estable).toMatch(/1 recetas propias/);
    expect(ficha.estable).toMatch(/Lentejas de antes/);
  });
});
