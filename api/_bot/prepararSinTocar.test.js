/**
 * Leer no escribe (#958, clase G): prepararRecetas prepara el motor para una
 * casa y no le cambia nada. Antes, con un menú de grupos que la casa no
 * conocía, reescribía `casa.state.data.groups` en la lectura (repararGrupos),
 * y quien guardaba después `{ ...casa.state }` lo persistía sin decirlo.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`, config: () => ({}),
  select: vi.fn(async () => []), insert: vi.fn(async () => []), update: vi.fn(async () => []),
  rpc: vi.fn(async () => null), borrar: vi.fn(async () => []),
  contandoEscrituras: async (correr) => ({ r: await correr(), escribio: false }),
}));

const { prepararRecetas, usarMotor } = await import("./menu.js");
// En los tests no existe core.mjs (sale del build): el motor, del fuente.
usarMotor(await import("../../src/server/botCore.js"));

describe("prepararRecetas no toca la casa (#958)", () => {
  it("ni con un menú cuyos grupos la casa no conoce", async () => {
    const casa = {
      householdId: "h1", menu: null, semanas: [], recetasPropias: [],
      state: { data: { members: [{ id: "a", name: "Ana" }], groups: [{ id: "g-casa", label: "Familia", memberIds: ["a"] }], menuModel: "same" } },
      semana: { plan: { "g-viejo": { "Lun-Comida": { recipeId: "lentejas" } } } },
    };
    const antes = structuredClone(casa);
    await prepararRecetas(casa);
    expect(casa).toEqual(antes);
  });
});
