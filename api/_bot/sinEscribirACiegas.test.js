/**
 * Si la base falla al mirar si algo ya se hizo, no se escribe a ciegas (#958,
 * lo que el revisor vio en #965 como C5): yaVista dice SIN_LEER, no «no visto».
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./db.js", () => ({
  select: vi.fn(async () => { throw Object.assign(new Error("GET /rest/v1/bot_entradas → 503"), { status: 503 }); }),
  insert: vi.fn(async () => []),
  eq: (x) => `eq.${x}`,
}));

const { yaVista } = await import("./entradas.js");
const { SIN_LEER } = await import("./avisar.js");

describe("sin escribir a ciegas", () => {
  it("si no se puede mirar, yaVista dice SIN_LEER y lo apunta como fallo", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await yaVista("telegram", "escritura:1:2:x:y")).toBe(SIN_LEER);
    expect(error.mock.calls.flat().join(" ")).toMatch(/entradas_ya_vista/);
  });
});
