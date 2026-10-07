import { describe, it, expect, vi, beforeEach } from "vitest";

// Un cliente de mentira que apunta en qué tabla se escribe y qué.
const escrito = [];
vi.mock("./supabase.js", () => ({
  supabase: {
    from: (tabla) => ({
      upsert: async (filas, opciones) => { escrito.push({ tabla, filas, opciones }); return { error: null }; },
    }),
  },
}));

const { subirDescartesPendientes } = await import("./householdDiscardsSync.js");

const descartes = { forever: ["r-1"], cooldownUntil: { "r-2": Date.parse("2026-11-01T00:00:00Z") } };

beforeEach(() => { escrito.length = 0; });

// Al cargar, App.jsx compara con los descartes de la CASA (loadHouseholdDiscards):
// lo que falte tiene que ir a la casa, no a los del usuario, o no lo ve nadie
// más de la casa y se vuelve a subir en cada carga.
describe("subir los descartes que la nube no tiene", () => {
  it("con casa, a household_recipe_discards", async () => {
    await subirDescartesPendientes("casa-1", "u1", descartes);
    expect(escrito).toHaveLength(1);
    expect(escrito[0].tabla).toBe("household_recipe_discards");
    expect(escrito[0].opciones).toEqual({ onConflict: "household_id,recipe_id" });
    expect(escrito[0].filas).toEqual([
      { household_id: "casa-1", recipe_id: "r-1", is_permanent: true, cooldown_until: null },
      { household_id: "casa-1", recipe_id: "r-2", is_permanent: false, cooldown_until: "2026-11-01T00:00:00.000Z" },
    ]);
  });

  it("sin casa, a los del usuario, como antes", async () => {
    await subirDescartesPendientes(null, "u1", descartes);
    expect(escrito.map((e) => e.tabla)).toEqual(["user_recipe_discards"]);
    expect(escrito[0].filas[0]).toMatchObject({ user_id: "u1", recipe_id: "r-1" });
  });

  it("si no falta nada, no escribe", async () => {
    await subirDescartesPendientes("casa-1", "u1", { forever: [], cooldownUntil: {} });
    expect(escrito).toHaveLength(0);
  });
});
