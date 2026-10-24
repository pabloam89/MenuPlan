/**
 * Qué semana se genera (#905, #907): «la siguiente» es la primera sin menú,
 * una fecha manda, lo que ya tiene menú no se rehace en silencio y rehacer
 * la semana en curso no toca hoy ni lo pasado.
 */
import { describe, it, expect } from "vitest";
import { resolverSemana, conservarDiasPrevios, TOPE_SEMANAS } from "./semanaPedida.js";
import { DIAS } from "../../src/lib/dias.js";

// Sábado 24 oct 2026, con la semana del 26 oct ya generada (el caso de #905).
const hoy = "2026-10-24";
const del26 = { weekStart: "2026-10-26", weekEnd: "2026-11-01", startDayIdx: 0 };
const estaSemana = { weekStart: "2026-10-21", weekEnd: "2026-10-25", startDayIdx: 2 };

describe("resolverSemana", () => {
  it("«la siguiente» con la del 26 hecha es la del 2 de noviembre (offset 2), no la del 26", () => {
    expect(resolverSemana({ cual: "siguiente", semanas: [del26], hoy })).toMatchObject({ offset: 2, startDayIdx: 0 });
  });
  it("«la siguiente» sin nada generado sigue siendo el lunes que viene", () => {
    expect(resolverSemana({ cual: "siguiente", semanas: [], hoy })).toMatchObject({ offset: 1 });
  });
  it("«a partir del 2 de noviembre» es la semana de esa fecha", () => {
    expect(resolverSemana({ desde: "2026-11-02", semanas: [del26], hoy })).toMatchObject({ offset: 2 });
    expect(resolverSemana({ desde: "2026-11-05", semanas: [], hoy })).toMatchObject({ offset: 2 });
  });
  it("una fecha con menú ya hecho avisa y no genera, salvo rehacer", () => {
    const r = resolverSemana({ desde: "2026-10-26", semanas: [del26], hoy });
    expect(r.aviso).toMatch(/YA HAY MENÚ del 2026-10-26/);
    expect(r.aviso).toMatch(/la del 2 nov/);
    expect(resolverSemana({ desde: "2026-10-26", rehacer: true, semanas: [del26], hoy })).toMatchObject({ offset: 1, existente: del26 });
  });
  it("fechas pasadas o demasiado lejos no se generan", () => {
    expect(resolverSemana({ desde: "2026-10-12", hoy }).aviso).toMatch(/ya ha pasado/);
    expect(resolverSemana({ desde: "2027-03-01", hoy }).aviso).toMatch(new RegExp(`${TOPE_SEMANAS} semanas`));
  });
  it("rehacer la semana en curso empieza mañana", () => {
    // Jueves 22 oct: mañana es viernes (índice 4).
    expect(resolverSemana({ cual: "esta", rehacer: true, semanas: [estaSemana], hoy: "2026-10-22" })).toMatchObject({ offset: 0, startDayIdx: 4 });
    // Sin menú, «esta» empieza hoy.
    expect(resolverSemana({ cual: "esta", semanas: [], hoy: "2026-10-22" })).toMatchObject({ offset: 0, startDayIdx: 3 });
  });
  it("un domingo no queda nada que rehacer de la semana en curso", () => {
    expect(resolverSemana({ cual: "esta", rehacer: true, semanas: [estaSemana], hoy: "2026-10-25" }).aviso).toMatch(/solo queda hoy/);
  });
  it("«esta» con menú y sin rehacer no se rehace en silencio", () => {
    expect(resolverSemana({ cual: "esta", semanas: [estaSemana], hoy }).aviso).toMatch(/NO lo he rehecho/);
  });
});

describe("conservarDiasPrevios", () => {
  it("hoy y lo pasado vuelven del plan viejo; lo de mañana es lo nuevo", () => {
    const plan = { g1: { "Vie-Comida": { recipeId: "nuevo" } } };
    const viejo = { g1: { "Mié-Comida": { recipeId: "a" }, "Jue-Cena": { recipeId: "b" }, "Vie-Comida": { recipeId: "viejo" } }, g2: { "Mié-Comida": { recipeId: "x" } } };
    conservarDiasPrevios(plan, viejo, 4, DIAS);
    expect(plan.g1).toEqual({ "Mié-Comida": { recipeId: "a" }, "Jue-Cena": { recipeId: "b" }, "Vie-Comida": { recipeId: "nuevo" } });
    expect(plan.g2).toBeUndefined();
  });
});

describe("botón de rehacer (#907)", () => {
  it("nombra la que viene si tiene menú; si no, la de ahora; un domingo sin la siguiente, nada", async () => {
    const { botonRehacer, esBotonRehacer } = await import("./semanaPedida.js");
    expect(botonRehacer([estaSemana, del26], hoy)).toBe("Rehacer la del 26 oct");
    expect(botonRehacer([estaSemana], hoy)).toBe("Rehacer la del 19 oct");
    expect(botonRehacer([estaSemana], "2026-10-25")).toBeNull();
    expect(esBotonRehacer("Rehacer la del 26 oct")).toBe(true);
    expect(esBotonRehacer("rehazme el menú")).toBe(false);
  });
});

describe("desdeDelBoton", () => {
  it("el lunes que nombra el botón, en el año que toca", async () => {
    const { desdeDelBoton } = await import("./semanaPedida.js");
    expect(desdeDelBoton("Rehacer la del 26 oct", hoy)).toBe("2026-10-26");
    expect(desdeDelBoton("Rehacer la del 4 ene", "2026-12-30")).toBe("2027-01-04");
    expect(desdeDelBoton("rehazlo", hoy)).toBeNull();
  });
});
