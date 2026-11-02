import { describe, it, expect, vi } from "vitest";

// Trozo 18 de #1037: los tachados que se juntan antes de llamar a household_shopping_mark van por id del artículo.
const rpc = vi.fn(async () => ({ data: { ok: true, bot_rev: 2 }, error: null }));
vi.mock("./supabase.js", () => ({ supabase: { rpc: (...a) => rpc(...a) } }));
const { queueMarcarCompra } = await import("./menusSync.js");

describe("tachados del lector en lote", () => {
  it("un derivado y un añadido a mano con el mismo nombre y unidad no se pisan", async () => {
    vi.useFakeTimers();
    queueMarcarCompra("h1", "m1", "2026-11-02", [
      { id: "leche|ml", name: "Leche", unit: "ml", have: true },
      { id: "manual:leche", name: "Leche", unit: "ml", have: true },
    ]);
    await vi.advanceTimersByTimeAsync(1500);
    vi.useRealTimers();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_marcas.map((m) => m.id)).toEqual(["leche|ml", "manual:leche"]);
  });
});
