import { describe, it, expect } from "vitest";
import { comprobarSeguridad, CODIGO, PRESENCIA } from "./comprobadorSeguridad.js";

// Hechos de prueba. «ausente» es una comprobación explícita: sin ella, un
// ingrediente con datos pero sin esa fila no cuenta como seguro.
const hechos = {
  pan: { gluten: PRESENCIA.CONTIENE, leche: PRESENCIA.AUSENTE },
  leche: { leche: PRESENCIA.CONTIENE, gluten: PRESENCIA.AUSENTE },
  chocolate: { leche: PRESENCIA.PUEDE_CONTENER, gluten: PRESENCIA.AUSENTE },
  arroz: { gluten: PRESENCIA.AUSENTE, leche: PRESENCIA.AUSENTE },
  tomate: { gluten: PRESENCIA.AUSENTE, leche: PRESENCIA.AUSENTE },
};

const casaSinAlergias = { miembros: [{ id: "a", alergias: [] }] };
const casaCeliaca = { miembros: [{ id: "a", alergias: ["gluten"] }] };

describe("comprobarSeguridad", () => {
  it("un menú sin alérgenos declarados y con todo verificado pasa", () => {
    const menu = [{ id: "r1", ingredientes: ["arroz", "tomate"] }];
    const r = comprobarSeguridad(casaCeliaca, menu, hechos);
    expect(r).toEqual({ ok: true, incumplimientos: [] });
  });

  it("un alérgeno declarado bloquea con ALERGENO_DECLARADO", () => {
    const menu = [{ id: "r1", ingredientes: ["pan"] }];
    const r = comprobarSeguridad(casaCeliaca, menu, hechos);
    expect(r.ok).toBe(false);
    expect(r.incumplimientos).toEqual([
      { codigo: CODIGO.ALERGENO_DECLARADO, miembroId: "a", recetaId: "r1", ingredienteId: "pan", alergeno: "gluten" },
    ]);
  });

  it("una traza (puede contener) también bloquea: en alergias no se tolera", () => {
    const casaLactea = { miembros: [{ id: "a", alergias: ["leche"] }] };
    const r = comprobarSeguridad(casaLactea, [{ id: "r1", ingredientes: ["chocolate"] }], hechos);
    expect(r.ok).toBe(false);
    expect(r.incumplimientos[0].codigo).toBe(CODIGO.ALERGENO_PUEDE_CONTENER);
  });

  it("un ingrediente sin datos no se da por seguro: NO_VERIFICADO y no es ok", () => {
    const menu = [{ id: "r1", ingredientes: ["ingrediente-desconocido"] }];
    const r = comprobarSeguridad(casaCeliaca, menu, hechos);
    expect(r.ok).toBe(false);
    expect(r.incumplimientos[0].codigo).toBe(CODIGO.NO_VERIFICADO);
  });

  it("un ingrediente con datos pero sin fila para el alérgeno tampoco es ok", () => {
    const soloGluten = { pollo: { gluten: PRESENCIA.AUSENTE } };
    const casaLactea = { miembros: [{ id: "a", alergias: ["leche"] }] };
    const r = comprobarSeguridad(casaLactea, [{ id: "r1", ingredientes: ["pollo"] }], soloGluten);
    expect(r.ok).toBe(false);
    expect(r.incumplimientos[0].codigo).toBe(CODIGO.NO_VERIFICADO);
  });

  it("solo se marca al miembro que tiene la alergia, no a toda la casa", () => {
    const casa = {
      miembros: [
        { id: "a", alergias: [] },
        { id: "b", alergias: ["gluten"] },
      ],
    };
    const r = comprobarSeguridad(casa, [{ id: "r1", ingredientes: ["pan"] }], hechos);
    expect(r.incumplimientos.map((i) => i.miembroId)).toEqual(["b"]);
  });

  it("sin alergias, cualquier menu pasa aunque los datos sean incompletos", () => {
    const r = comprobarSeguridad(casaSinAlergias, [{ id: "r1", ingredientes: ["ingrediente-desconocido"] }], hechos);
    expect(r).toEqual({ ok: true, incumplimientos: [] });
  });

  it("la salida solo usa códigos del enum, sin texto libre", () => {
    const menu = [
      { id: "r1", ingredientes: ["pan", "chocolate", "desconocido"] },
    ];
    const r = comprobarSeguridad(casaCeliaca, menu, hechos);
    const validos = Object.values(CODIGO);
    for (const i of r.incumplimientos) expect(validos).toContain(i.codigo);
  });

  it("una casa vacía o sin menú es ok", () => {
    expect(comprobarSeguridad({ miembros: [] }, [], hechos)).toEqual({ ok: true, incumplimientos: [] });
    expect(comprobarSeguridad(casaCeliaca, undefined, hechos).ok).toBe(true);
  });

  // Prueba de que el comprobador detecta de verdad: un menú limpio pasa, y el
  // mismo menú con un alérgeno metido a propósito tiene que fallar.
  it("un alérgeno metido a propósito en un menú limpio hace que falle", () => {
    const limpio = [{ id: "r1", ingredientes: ["arroz", "tomate"] }];
    expect(comprobarSeguridad(casaCeliaca, limpio, hechos).ok).toBe(true);

    const contaminado = [...limpio, { id: "r2", ingredientes: ["arroz", "pan"] }];
    const r = comprobarSeguridad(casaCeliaca, contaminado, hechos);
    expect(r.ok).toBe(false);
    expect(r.incumplimientos.map((i) => i.recetaId)).toEqual(["r2"]);
  });
});
