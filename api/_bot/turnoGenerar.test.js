/**
 * La plantilla de «generar» por la vía rápida (turno.js): «¡Menú listo!» no
 * calla los huecos que se han quedado sin plato (#1029). generarMenu, de
 * mentira: aquí se prueba solo cómo se pinta lo que devuelve en `out`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const t = vi.hoisted(() => ({ out: {} }));
vi.mock("./generar.js", () => ({ generarMenu: vi.fn(async (_h, _cual, _fijos, out) => { Object.assign(out, t.out); return ""; }) }));

const { generar } = await import("./turno.js");

const listo = { ok: true, desde: "2026-10-26", hasta: "2026-11-01", platos: 9, avisos: 0, conservadas: [], pedidos: [], colocados: [] };

beforeEach(() => { t.out = { ...listo }; });

describe("generar por la vía rápida: la plantilla dice lo que falta", () => {
  it("sin huecos vacíos, «¡Menú listo!» a secas", async () => {
    const r = await generar("h1", { semana: "esta" });
    expect(r.texto).toMatch(/¡Menú listo!/);
    expect(r.texto).not.toMatch(/sin plato/);
  });

  it("con huecos vacíos, los dice tras «¡Menú listo!» y ofrece intentarlo de otra forma", async () => {
    t.out = {
      ...listo,
      huecosVacios: [
        { grupo: "g1", dia: "Sáb", comida: "Comida", plato: "principal", de: 2 },
        { grupo: "g1", dia: "Vie", comida: "Cena", plato: "principal", de: 1 },
      ],
    };
    const r = await generar("h1", { semana: "esta" });
    expect(r.texto).toMatch(/¡Menú listo!/);
    expect(r.texto).toMatch(/⚠️ <b>Se quedan sin plato:<\/b> viernes cena, sábado comida \(2º\)\./);
    expect(r.texto).toMatch(/Dime si lo intento de otra forma/);
    // Lo que se dice va después del titular, nunca delante.
    expect(r.texto.indexOf("¡Menú listo!")).toBeLessThan(r.texto.indexOf("Se quedan sin plato"));
  });

  it("si no se generó (ya había menú, o quedó vacío), la vía rápida pasa el turno", async () => {
    t.out = { ok: false, aviso: "plan_vacio" };
    expect(await generar("h1", { semana: "esta" })).toBeNull();
  });
});
