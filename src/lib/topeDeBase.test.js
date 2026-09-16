import { describe, expect, it } from "vitest";

import { MAX_POR_SEMANA, MIN_POR_SEMANA, topeDeBase } from "./bases.js";

/**
 * El tope del deslizador: hasta cuántos platos de una base puede dar la semana.
 *
 * Son dos límites distintos y manda el menor. El ABSOLUTO es cuántos platos
 * existen, repartidos entre las semanas que se generan de una vez — en un menú
 * de cuatro, cada semana recibe su propio cuarto del catálogo. El COMPARTIDO
 * son los huecos que quedan libres después de lo pedido para las demás.
 *
 * Sin esto el deslizador dejaba pedir cinco platos de cuscús cuando el catálogo
 * tiene seis en total: al generar cuatro semanas, cada una veía uno y la tanda
 * se caía siempre con un aviso que nadie sabía interpretar.
 */
describe("topeDeBase", () => {
  it("con una sola semana, el tope es lo que hay (hasta el máximo)", () => {
    expect(topeDeBase(3, { semanas: 1 })).toBe(3);
    expect(topeDeBase(200, { semanas: 1 })).toBe(MAX_POR_SEMANA);
  });

  it("varias semanas reparten el recetario: cada una ve su parte", () => {
    // Cuscús: seis platos en todo el catálogo. En cuatro semanas, uno por
    // semana, que está por debajo del mínimo que hace tanda.
    expect(topeDeBase(6, { semanas: 4 })).toBe(1);
    expect(topeDeBase(6, { semanas: 4 })).toBeLessThan(MIN_POR_SEMANA);
    // Sofrito: ciento noventa. Le sobra incluso repartido.
    expect(topeDeBase(190, { semanas: 4 })).toBe(MAX_POR_SEMANA);
  });

  it("lo que ya ocupan las demás bases baja el tope de esta", () => {
    // Catorce huecos, once ya pedidos: caben tres más.
    expect(topeDeBase(50, { semanas: 1, huecosLibres: 3 })).toBe(3);
    // Y si no queda ninguno, cero.
    expect(topeDeBase(50, { semanas: 1, huecosLibres: 0 })).toBe(0);
  });

  it("nunca devuelve negativo aunque la semana esté pasada de vueltas", () => {
    expect(topeDeBase(50, { semanas: 1, huecosLibres: -4 })).toBe(0);
  });

  it("manda el menor de los dos límites", () => {
    // Hay platos de sobra pero la semana está llena: manda el compartido.
    expect(topeDeBase(200, { semanas: 1, huecosLibres: 2 })).toBe(2);
    // Hay hueco de sobra pero apenas platos: manda el absoluto.
    expect(topeDeBase(2, { semanas: 1, huecosLibres: 12 })).toBe(2);
  });

  it("sin platos no se puede pedir nada", () => {
    expect(topeDeBase(0, { semanas: 1 })).toBe(0);
    expect(topeDeBase(undefined, { semanas: 1 })).toBe(0);
  });
});
