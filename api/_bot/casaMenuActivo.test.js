import { describe, it, expect, vi } from "vitest";

// Si la tabla tuviera dos menús activos en una casa, Lola y la app tienen que
// quedarse con el mismo: el de updated_at más reciente (menuActivoDe).
vi.mock("./db.js", () => ({
  select: vi.fn(async (tabla) => {
    if (tabla === "household_state") return [{ state: { data: {} }, bot_rev: 1, updated_at: "2026-10-08T10:00:00Z" }];
    if (tabla === "households") return [{ owner_user_id: "u1" }];
    // A propósito en el orden "malo": el viejo primero.
    if (tabla === "user_menus") {
      return [
        { id: "viejo", user_id: "u1", is_active: true, updated_at: "2026-10-01T10:00:00Z" },
        { id: "nuevo", user_id: "u1", is_active: true, updated_at: "2026-10-05T10:00:00Z" },
      ];
    }
    return [];
  }),
  insert: vi.fn(async () => []),
  update: vi.fn(async () => []),
  rpc: vi.fn(async () => null),
  eq: (v) => `eq.${encodeURIComponent(v)}`,
}));
vi.mock("./propias.js", () => ({ recetasPropiasDeCasa: vi.fn(async () => []) }));

const { cargarCasa } = await import("./casa.js");

describe("cargarCasa elige el menú activo con el mismo criterio que la app", () => {
  it("con dos activos, el más reciente", async () => {
    const casa = await cargarCasa("h1", { fresca: true });
    expect(casa.menu?.id).toBe("nuevo");
  });
});
