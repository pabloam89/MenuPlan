/**
 * Generar por la vía rápida solo con «esta» o «la que viene» a secas (#905,
 * #907): una fecha, «hazme las preguntas» o una corrección van a Lola, y una
 * semana que ya tiene menú no se rehace (generarMenu avisa y la vía rápida
 * pasa el turno).
 */
import { describe, it, expect } from "vitest";
import { vaPorLaRapida } from "./router.js";

const d = (datos) => ({ modo: "generar", confianza: 0.95, datos });

describe("generar por la vía rápida", () => {
  it("«hazme el menú de la semana que viene» sigue por la rápida", () => {
    expect(vaPorLaRapida(d({ semana: "siguiente" }), { texto: "hazme el menú de la semana que viene" })).toBe(true);
  });
  it("con una fecha, a Lola", () => {
    expect(vaPorLaRapida(d({ semana: "siguiente" }), { texto: "genérame la semana a partir del 2 de noviembre" })).toBe(false);
  });
  it("si pide que le pregunten antes, a Lola", () => {
    expect(vaPorLaRapida(d({ semana: "siguiente" }), { texto: "Hagamos el menú de la semana que viene hazme todas las preguntas que necesites" })).toBe(false);
  });
  it("una corrección explícita, a Lola", () => {
    expect(vaPorLaRapida(d({ semana: "siguiente" }), { texto: "que me hagas la semana que viene", corrige: true })).toBe(false);
  });
});
