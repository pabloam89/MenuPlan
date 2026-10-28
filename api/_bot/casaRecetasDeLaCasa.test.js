import { describe, it, expect, vi } from "vitest";

// Las favoritas y los «No me gusta» de la casa viven en sus tablas, no en
// household_state: Lola tiene que cargarlos para que sus menús los respeten
// igual que los de la app (#939).
const filas = {
  household_state: [{ state: { data: { members: [] } }, bot_rev: 1, updated_at: "2026-10-28T10:00:00Z" }],
  households: [{ owner_user_id: "u1" }],
  household_favorites: [{ recipe_id: "lentejas", scope: null }, { recipe_id: "pisto", scope: "Peques,Adultos" }],
  household_recipe_discards: [
    { recipe_id: "callos", is_permanent: true, cooldown_until: null },
    { recipe_id: "pasta", is_permanent: false, cooldown_until: "2999-01-01T00:00:00Z" },
    { recipe_id: "sopa", is_permanent: false, cooldown_until: "2000-01-01T00:00:00Z" },
  ],
};
let falla = false;
vi.mock("./db.js", () => ({
  select: vi.fn(async (tabla) => {
    if (falla && tabla.startsWith("household_") && tabla !== "household_state") throw new Error("caída");
    return filas[tabla] ?? [];
  }),
  insert: vi.fn(async () => []),
  update: vi.fn(async () => []),
  rpc: vi.fn(async () => null),
  eq: (v) => `eq.${encodeURIComponent(v)}`,
}));
vi.mock("./propias.js", () => ({ recetasPropiasDeCasa: vi.fn(async () => []) }));

const { cargarCasa } = await import("./casa.js");
const { datosDelMotor } = await import("../../src/lib/recetasDeLaCasa.js");

describe("la casa de Lola trae sus favoritas y descartes", () => {
  it("con la forma que lee el motor, y fuera de lo que se guarda", async () => {
    falla = false;
    const casa = await cargarCasa("h1", { fresca: true });
    const data = datosDelMotor(casa);
    expect(data.recipeVotes).toEqual({ lentejas: { v: undefined, fav: "all" }, pisto: { v: undefined, fav: ["Peques", "Adultos"] } });
    expect(data.discards.forever).toEqual(["callos"]);
    // Un descarte temporal ya pasado no cuenta.
    expect(Object.keys(data.discards.cooldownUntil)).toEqual(["pasta"]);
    // No se cuelan en household_state al guardar.
    expect(casa.state.data.recipeVotes).toBeUndefined();
    expect(casa.state.data.discards).toBeUndefined();
  });

  it("si las tablas fallan, la casa carga igual y el motor sigue como antes", async () => {
    falla = true;
    const casa = await cargarCasa("h1", { fresca: true });
    expect(casa.deLaCasa).toBeNull();
    expect(datosDelMotor(casa)).toEqual({ members: [] });
  });
});
