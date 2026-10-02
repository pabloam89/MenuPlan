/**
 * La vía rápida de tachar no deja medio mensaje escrito: si hay una duda
 * («leche»: ¿entera o semidesnatada?) no tacha nada y el turno entero es de
 * Lola. Antes tachaba lo claro y Lola volvía a hacer el mensaje completo.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(async () => []), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), borrar: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), rastro: vi.fn(), EMBUDO: {}, duenoDe: vi.fn() }));
let escritos = 0;
vi.mock("./casa.js", async (original) => ({
  ...(await original()),
  conCasa: vi.fn(async (_h, cambiar) => {
    const casa = {
      householdId: "h1", botRev: 1, semana: null,
      state: { shopping: { items: [
        { id: "a", name: "Leche entera", have: false },
        { id: "b", name: "Leche semidesnatada", have: false },
        { id: "c", name: "Pan", have: false },
      ] } },
    };
    const cambios = await cambiar(casa);
    if (cambios) escritos++;
    return { ok: true, casa };
  }),
}));

const { marcarCompra } = await import("./menu.js");

describe("tachar con dudas", () => {
  it("la vía rápida (soloSiClaro) no escribe nada si hay una duda", async () => {
    escritos = 0;
    const out = {};
    await marcarCompra("h1", ["pan", "leche"], "comprado", out, { soloSiClaro: true });
    expect(out.dudosos.length).toBe(1);
    expect(escritos).toBe(0);
  });

  it("Lola sí tacha lo claro y pregunta lo dudoso", async () => {
    escritos = 0;
    const out = {};
    await marcarCompra("h1", ["pan", "leche"], "comprado", out);
    expect(out.hechos).toEqual(["Pan"]);
    expect(escritos).toBe(1);
  });
});
