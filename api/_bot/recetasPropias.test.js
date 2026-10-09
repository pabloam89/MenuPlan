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

const filaDeCotitular = { ...filaDeApp, id: "user_app2", owner_id: "u2", name: "Pisto de Marta", created_at: "2026-10-02T10:00:00Z" };
const filaDeLectora = { ...filaDeApp, id: "user_app3", owner_id: "u3", name: "Bizcocho de la invitada", created_at: "2026-10-03T10:00:00Z" };

beforeEach(() => {
  pedidas.length = 0;
  tablas.household_state = [{ state: { data: { members: [PABLO], userRecipes: [{ id: "user_viejo", name: "Lentejas de antes", source: "user" }] } }, bot_rev: 1 }];
  tablas.households = [{ owner_user_id: "u1" }];
  tablas.user_menus = [];
  tablas.household_members = [];
  tablas.user_recipe_deletions = [];
  // Como PostgREST: owner_id=in.(…) devuelve las de esos autores.
  tablas.user_recipes = (filtro) => [filaDeApp, filaDeCotitular, filaDeLectora].filter((f) => filtro.includes(f.owner_id));
});

describe("las recetas propias de la casa", () => {
  it("una receta creada en la app (solo en user_recipes) sale en la ficha de Lola", async () => {
    const ficha = montarFicha(await cargarCasa("casa-a"), {}, "2026-10-07");
    expect(ficha.estable).toMatch(/Tortilla de la abuela/);
    // Lo que aún queda en el JSON de antes no se pierde.
    expect(ficha.estable).toMatch(/Lentejas de antes/);
    expect(ficha.estable).toMatch(/2 recetas propias/);
  });

  it("son las del dueño de la casa, en una sola consulta con tope", async () => {
    await cargarCasa("casa-b");
    const deRecetas = pedidas.filter((p) => p.tabla === "user_recipes");
    expect(deRecetas).toHaveLength(1);
    expect(deRecetas[0].filtro).toMatch(/owner_id=in\.\(u1\)/);
    expect(deRecetas[0].filtro).toMatch(/limit=\d+/);
  });

  it("también las de la cotitular (editor), y no las de quien solo mira", async () => {
    tablas.household_members = (filtro) => (filtro.includes("role=in.(owner,editor)") ? [{ user_id: "u1" }, { user_id: "u2" }] : [{ user_id: "u3" }]);
    const ficha = montarFicha(await cargarCasa("casa-d"), {}, "2026-10-07");
    expect(ficha.estable).toMatch(/Tortilla de la abuela/);
    expect(ficha.estable).toMatch(/Pisto de Marta/);
    expect(ficha.estable).not.toMatch(/Bizcocho de la invitada/);
  });

  it("pide columnas, no select *", async () => {
    const { select } = await import("./db.js");
    await cargarCasa("casa-e");
    const llamada = select.mock.calls.find(([tabla]) => tabla === "user_recipes");
    expect(llamada[2]).toBeTruthy();
    expect(llamada[2]).not.toBe("*");
    expect(llamada[2].split(",")).toContain("ingredients");
  });

  it("si household_members falla, quedan las del dueño (y se dice en el log)", async () => {
    tablas.household_members = new Error("500");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const ficha = montarFicha(await cargarCasa("casa-f"), {}, "2026-10-07");
    expect(ficha.estable).toMatch(/Tortilla de la abuela/);
    expect(log).toHaveBeenCalledWith("[propias] household_members", expect.anything());
    log.mockRestore();
  });

  it("si households falla, se dice en el log", async () => {
    tablas.households = new Error("500");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await cargarCasa("casa-g");
    expect(log).toHaveBeenCalledWith("[casa] households", expect.anything());
    log.mockRestore();
  });

  // #355: borrar una receta quita su fila de user_recipes y deja su lápida en
  // user_recipe_deletions (0094). Lo que quedaba en el JSON de la casa con ese
  // id volvía a salir para Lola, porque «no está en la tabla» se leía como
  // «es de antes».
  it("no ve las borradas: ni lo que queda en el JSON ni una fila con lápida", async () => {
    tablas.user_recipe_deletions = (filtro) =>
      [{ recipe_id: "user_viejo", owner_id: "u1" }, { recipe_id: "user_app1", owner_id: "u1" }]
        .filter((f) => filtro.includes(f.owner_id));
    const ficha = montarFicha(await cargarCasa("casa-h"), {}, "2026-10-07");
    expect(ficha.estable).not.toMatch(/Lentejas de antes/);
    expect(ficha.estable).not.toMatch(/Tortilla de la abuela/);
    const lapidas = pedidas.filter((p) => p.tabla === "user_recipe_deletions");
    expect(lapidas).toHaveLength(1);
    expect(lapidas[0].filtro).toMatch(/owner_id=in\.\(u1\)/);
    expect(lapidas[0].filtro).toMatch(/limit=\d+/);
  });

  it("plan B: sin la tabla de lápidas (0094 sin aplicar), todo como antes", async () => {
    tablas.user_recipe_deletions = new Error("404 PGRST205");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const ficha = montarFicha(await cargarCasa("casa-i"), {}, "2026-10-07");
    expect(ficha.estable).toMatch(/Tortilla de la abuela/);
    expect(ficha.estable).toMatch(/Lentejas de antes/);
    log.mockRestore();
  });

  it("si user_recipes falla, queda lo del JSON", async () => {
    tablas.user_recipes = new Error("500");
    const ficha = montarFicha(await cargarCasa("casa-c"), {}, "2026-10-07");
    expect(ficha.estable).toMatch(/1 recetas propias/);
    expect(ficha.estable).toMatch(/Lentejas de antes/);
  });
});
