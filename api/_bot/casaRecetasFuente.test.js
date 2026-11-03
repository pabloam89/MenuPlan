import { describe, it, expect, vi } from "vitest";
import { familiaDeFilas, RPC_FAMILIA, RPC_FICHA, fichaDePrueba, RPC_PREFERENCIAS_DE_CASA, preferenciasDeFilas } from "./familiaDePrueba.js";

// Trozo 21: lo que guarda Lola no lleva las colecciones, carpetas, votos ni descartes de la copia vieja del documento
// ni las propias (viven en sus tablas).
const viejo = {
  members: [], userRecipes: [{ id: "de-antes" }], recipeFolders: [{ id: "f1", name: "Cenas" }],
  recipeCollections: { favoritas: ["de-antes"] }, recipeVotes: { x: 1 }, discards: { forever: [] },
};
const llamadas = [];
vi.mock("./db.js", () => ({
  select: vi.fn(async (tabla) => {
    if (tabla === "household_state") return [{ state: { data: viejo }, bot_rev: 1, updated_at: "2026-11-03T10:00:00Z" }];
    if (tabla === "households") return [{ owner_user_id: "u1" }];
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

const { cargarCasa, guardarCasa } = await import("./casa.js");

describe("Lola no vuelve a escribir en el documento las recetas que viven en tablas", () => {
  it("al guardar, el documento va sin recetas propias, carpetas, colecciones, votos ni descartes, y con lo demás", async () => {
    const casa = await cargarCasa("h1", { fresca: true });
    llamadas.length = 0;
    expect((await guardarCasa(casa, { state: { ...casa.state, data: { ...casa.state.data, cookedDishes: { a: 1 } } } })).ok).toBe(true);
    const [, args] = llamadas.find(([fn]) => fn === "bot_save_casa");
    const data = args.p_state.data;
    for (const k of ["userRecipes", "recipeFolders", "recipeCollections", "recipeVotes", "discards"]) expect(data).not.toHaveProperty(k);
    expect(data.cookedDishes).toEqual({ a: 1 });
  });
});
