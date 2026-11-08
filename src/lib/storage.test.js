import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("saveState", () => {
  it("no vuelve a escribir la copia una vez congelada", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem, getItem: () => null, removeItem: () => {} });
    const { saveState, congelarCopia } = await import("./storage.js");
    saveState({ data: {} });
    expect(setItem).toHaveBeenCalledTimes(1);
    congelarCopia();
    expect(saveState({ data: {} })).toEqual({ ok: true, pruned: false, saved: null });
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
