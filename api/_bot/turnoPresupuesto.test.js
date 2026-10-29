// La vía rápida de generar (turno.js) dice siempre la frase del presupuesto
// que trae generar_menu, si la hay; sin presupuesto, nada de euros (#958).
import { describe, it, expect, vi } from "vitest";

vi.mock("./generar.js", async (original) => ({
  ...(await original()),
  generarMenu: vi.fn(),
}));

const { generarMenu } = await import("./generar.js");
const { generar } = await import("./turno.js");

const generado = (extra) => async (_h, _s, _f, out) => {
  Object.assign(out, { ok: true, desde: "2026-11-02", hasta: "2026-11-08", pedidos: [], colocados: [], recordarSilencio: false, ...extra });
  return "Menú nuevo generado.";
};

describe("generar por la vía rápida, con presupuesto (#958)", () => {
  it("la frase del presupuesto sale en el mensaje, tal cual", async () => {
    const frase = "La comida de la semana sale por entre 40 y 44 € a precio de Mercadona por kilo: cabe en el presupuesto de 50 €.";
    generarMenu.mockImplementation(generado({ presupuesto: frase }));
    const r = await generar("h1", { semana: "siguiente" });
    expect(r.texto).toContain(`💶 ${frase}`);
  });
  it("sin presupuesto, el mensaje no habla de euros", async () => {
    generarMenu.mockImplementation(generado({ presupuesto: null }));
    const r = await generar("h1", { semana: "siguiente" });
    expect(r.texto).not.toMatch(/💶|€/);
  });
});
