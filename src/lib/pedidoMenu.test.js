import { describe, expect, it } from "vitest";
import { CAMINO, TEMA, TEMAS, temasDelCamino } from "./caminos.js";
import { ESTADO_EJE } from "./ejesDeCasa.js";
import { faltaDelPedido, menuEnFecha } from "./pedidoMenu.js";

const { SABIDO, SUPUESTO, FALTA, NO_APLICA } = ESTADO_EJE;
const todos = (estado) => Object.fromEntries(TEMAS.flatMap((t) => t.ejes).map((e) => [e.dato, estado]));
const SABE_TODO = { ...todos(SABIDO), etapaBebe: NO_APLICA };
const DESDE = "2026-11-05";

describe("faltaDelPedido (trozo 65)", () => {
  it("si la casa lo sabe todo y hay fecha, se genera sin preguntar", () => {
    expect(faltaDelPedido({ camino: CAMINO.MEDIO, desde: DESDE, ejes: SABE_TODO })).toMatchObject({ listo: true, temas: [], bloquea: [] });
  });

  it("pregunta solo los temas del camino en los que falta algo, en su orden", () => {
    const ejes = { ...SABE_TODO, mealStructure: FALTA, tandaMinutos: FALTA };
    const r = faltaDelPedido({ camino: CAMINO.MEDIO, desde: DESDE, ejes });
    expect(r.temas).toEqual([TEMA.ESTRUCTURA]);
    expect(r.listo).toBe(false);
  });

  it("casa nueva: el camino corto solo abre sus temas", () => {
    const r = faltaDelPedido({ camino: CAMINO.BASICO, desde: DESDE, ejes: { ...todos(FALTA), etapaBebe: NO_APLICA } });
    expect(r.temas).toEqual(temasDelCamino(CAMINO.BASICO, { hayNinos: false }));
  });

  it("sin fecha falta preguntarla, aunque la casa lo sepa todo", () => {
    expect(faltaDelPedido({ camino: CAMINO.BASICO, ejes: SABE_TODO })).toMatchObject({ faltaFecha: true, listo: false });
  });

  it("forzado, no pregunta ni los temas ni la fecha", () => {
    const r = faltaDelPedido({ camino: CAMINO.AVANZADO, forzado: true, ejes: { ...todos(FALTA), etapaBebe: NO_APLICA } });
    expect(r).toMatchObject({ temas: [], faltaFecha: false, listo: true });
  });

  it("lo de seguridad bloquea aunque lo fuercen y aunque el camino no abra ese tema", () => {
    const ejes = { ...SABE_TODO, etapaBebe: FALTA };
    const r = faltaDelPedido({ camino: CAMINO.BASICO, forzado: true, hayNinos: true, ejes });
    expect(r.bloquea).toEqual(["etapaBebe"]);
    expect(r.listo).toBe(false);
  });

  it("dice lo que da por supuesto, solo de su camino", () => {
    const ejes = { ...SABE_TODO, cookLevel: SUPUESTO, tandaMinutos: SUPUESTO };
    expect(faltaDelPedido({ camino: CAMINO.MEDIO, desde: DESDE, ejes }).supuestos).toEqual(["cookLevel"]);
  });

  it("sin ficha no pregunta lo que quizá ya se dijo", () => {
    expect(faltaDelPedido({ camino: CAMINO.AVANZADO, desde: DESDE, ejes: null })).toMatchObject({ temas: [], listo: true });
  });

  it("avisa si la fecha pisa un menú", () => {
    const semana = { weekStart: "2026-11-02", weekEnd: "2026-11-08", plan: {} };
    expect(faltaDelPedido({ camino: CAMINO.BASICO, desde: DESDE, ejes: SABE_TODO, semanas: [semana] }).pisa).toBe(semana);
    expect(menuEnFecha([semana], "2026-11-09")).toBeNull();
    expect(menuEnFecha([{ ...semana, plan: null }], DESDE)).toBeNull();
  });
});
