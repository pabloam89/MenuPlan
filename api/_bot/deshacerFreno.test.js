import { describe, it, expect, vi, beforeEach } from "vitest";

const ahora = { members: [{ id: "m1", name: "Leo", allergies: ["Huevos"] }] };
const foto = { id: 1, bot_rev_despues: 7, antes: { state: { data: { members: [{ id: "m1", name: "Leo", allergies: [] }] } } }, created_at: new Date().toISOString() };
const rpc = vi.fn(async () => ({ ok: true }));

vi.mock("./db.js", () => ({
  select: vi.fn(async (tabla) => {
    if (tabla === "bot_deshacer") return [foto];
    if (tabla === "household_state") return [{ state: { data: ahora }, bot_rev: 7, updated_at: new Date().toISOString() }];
    return [];
  }),
  insert: vi.fn(async () => []), update: vi.fn(async () => []), rpc, eq: (x) => `eq.${x}`,
}));

const { deshacer } = await import("./casa.js");
const { deshacerRapido } = await import("./turno.js");
const { frenoDeshacer } = await import("./supervisor.js");

describe("el freno llega a deshacer", () => {
  beforeEach(() => rpc.mockClear());

  it("con un «deshaz» suelto no restaura: no llama a guardar", async () => {
    const r = await deshacer("casa", { freno: (a, b) => frenoDeshacer(a, b, "deshaz", "") });
    expect(r).toMatch(/No lo he deshecho/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("con «No es así» tras «Apuntado: Leo es alérgico al huevo», sí intenta restaurar", async () => {
    await deshacer("casa", { freno: (a, b) => frenoDeshacer(a, b, "Deshaz lo último que has cambiado", "✅ Apuntado: Leo es alérgico al huevo.") });
    expect(rpc).toHaveBeenCalled();
  });

  it("la vía rápida no deshace lo que quita protección: pasa a Lola", async () => {
    expect(await deshacerRapido("casa")).toBe(null);
    expect(rpc).not.toHaveBeenCalled();
  });
});
