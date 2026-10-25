/**
 * Generar por la vía rápida solo con «esta» o «la que viene» a secas (#905,
 * #907): una fecha, «hazme las preguntas» o una corrección van a Lola, y una
 * semana que ya tiene menú no se rehace (generarMenu avisa y la vía rápida
 * pasa el turno).
 */
import { describe, it, expect } from "vitest";
import { vaPorLaRapida } from "./router.js";
import { esCorreccionRuta } from "./senales.js";

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

describe("generar: matices afinados (#905)", () => {
  it("un número que no es fecha, o «no me preguntes», sigue por la rápida", () => {
    expect(vaPorLaRapida(d({ semana: "siguiente" }), { texto: "hazme un menú de 5 cenas para la semana que viene" })).toBe(true);
    expect(vaPorLaRapida(d({ semana: "esta" }), { texto: "somos 5, genera el menú de esta semana" })).toBe(true);
    expect(vaPorLaRapida(d({ semana: "siguiente" }), { texto: "hazme el menú de la semana que viene, no me preguntes nada" })).toBe(true);
  });
  it("una fecha con mes o con «el/del», a Lola", () => {
    expect(vaPorLaRapida(d({ semana: "siguiente" }), { texto: "genera la del 9" })).toBe(false);
    expect(vaPorLaRapida(d({ semana: "siguiente" }), { texto: "el menú de la semana del 2 de noviembre" })).toBe(false);
  });
  it("justo después de un menú recién generado, a Lola", () => {
    expect(vaPorLaRapida(d({ semana: "siguiente" }), { texto: "Genérame la siguiente semana", ultima: "🎉 <b>¡Menú listo!</b> Del <b>26 de octubre al 1 de noviembre</b>." })).toBe(false);
  });
});

describe("generar: fechas sin dígito, a Lola (#915)", () => {
  const rapida = (texto) => vaPorLaRapida(d({ semana: "siguiente" }), { texto });
  it("un mes, una cuenta de semanas o días, «tras la próxima», un número de semana", () => {
    for (const texto of [
      "hazme el menú para noviembre",
      "hazme el menú de la semana de noviembre",
      "genérame el menú de dentro de dos semanas",
      "hazme el menú de aquí a quince días",
      "hazme el menú de la semana tras la próxima",
      "genérame la semana después de la que viene",
      "hazme la semana siguiente a la próxima",
      "hazme el menú de la semana 45",
      "hazme el menú para el mes que viene",
      "genera la semana del 9/11",
      "hazme el menú para Navidad",
    ]) expect(rapida(texto), texto).toBe(false);
  });
  it("lo ya logrado sigue por la rápida", () => {
    for (const texto of [
      "hazme el menú de la semana que viene",
      "genera el menú de esta semana",
      "hazme un menú de 5 cenas para la semana que viene",
      "somos 5, genera el menú de esta semana",
      "hazme el menú de la semana que viene, no me preguntes nada",
      "dame el menú de la próxima semana",
    ]) expect(rapida(texto), texto).toBe(true);

// #910: el criterio de la RUTA (qué turno va a Lola) es el amplio de siempre; el estrecho de
// senales.js (esCorreccionMedida) es solo para contar. Un PR de medición no cambia la ruta.
describe("generar con una restricción dicha en la frase: a Lola (la ruta usa el criterio amplio)", () => {
  const ultima = "Hecho: menú de la semana del 26.";
  const ruta = (texto) => vaPorLaRapida(d({ semana: "siguiente" }), { texto, ultima, corrige: esCorreccionRuta(texto, ultima) });
  it("«No quiero más de dos ensaladas, genérame la semana», a Lola", () => {
    expect(ruta("No quiero más de dos ensaladas, genérame la semana")).toBe(false);
  });
  it("«No quiero pescado, hazme el menú de esta semana», a Lola", () => {
    expect(ruta("No quiero pescado, hazme el menú de esta semana")).toBe(false);
  });
  it("sin «no» delante, la misma petición sigue por la rápida", () => {
    expect(ruta("genérame la semana")).toBe(true);
  });
});
