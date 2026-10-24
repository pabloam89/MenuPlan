/**
 * Las piezas de la medida de un turno (medidaTurno.js, #910): tiempo de reloj
 * de las herramientas, el import en frío del motor y el uso de la llamada
 * cancelada. Todo con números inventados: no hay reloj ni SDK de verdad.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { relojDeHerramientas, usoParcialDe, cargaMedida, motorFrioDesde, olvidarCargaDelMotor } from "./medidaTurno.js";

describe("relojDeHerramientas: el reloj, no la suma", () => {
  it("lecturas a la vez: cuenta la más larga, no las tres", () => {
    const h = [{ t0: 1000, ms: 300 }, { t0: 1000, ms: 500 }, { t0: 1010, ms: 200 }];
    expect(relojDeHerramientas(h)).toBe(500);
  });

  it("cinco escrituras en fila (cada una lleva dentro la espera de las anteriores): el total, no la suma", () => {
    // Misma salida que el 2 oct 2026: las cinco arrancan a la vez y la fila las deja acabar de a una.
    const h = [1, 2, 3, 4, 5].map((i) => ({ t0: 5000, ms: 400 * i }));
    expect(h.reduce((a, x) => a + x.ms, 0)).toBe(6000); // lo que sumaba la medida vieja
    expect(relojDeHerramientas(h)).toBe(2000); // lo que esperó el turno
  });

  it("dos tandas separadas por el modelo: las dos cuentan, el hueco no", () => {
    const h = [{ t0: 0, ms: 100 }, { t0: 4000, ms: 250 }];
    expect(relojDeHerramientas(h)).toBe(350);
  });

  it("una dentro de otra no suma", () => {
    expect(relojDeHerramientas([{ t0: 0, ms: 1000 }, { t0: 200, ms: 100 }])).toBe(1000);
  });

  it("sin inicio apuntado (filas viejas) o sin nada: null", () => {
    expect(relojDeHerramientas([{ ms: 300 }])).toBeNull();
    expect(relojDeHerramientas([])).toBeNull();
    expect(relojDeHerramientas(undefined)).toBeNull();
  });

  it("nunca pasa de la suma", () => {
    const h = [{ t0: 0, ms: 300 }, { t0: 100, ms: 300 }, { t0: 1000, ms: 50 }];
    expect(relojDeHerramientas(h)).toBeLessThanOrEqual(h.reduce((a, x) => a + x.ms, 0));
  });
});

describe("motor en frío", () => {
  beforeEach(() => olvidarCargaDelMotor());

  it("el primer import queda apuntado y devuelve lo cargado", async () => {
    const antes = Date.now();
    const m = await cargaMedida(async () => { await new Promise((r) => setTimeout(r, 20)); return { motor: true }; });
    expect(m).toEqual({ motor: true });
    expect(motorFrioDesde(antes)).toBeGreaterThanOrEqual(15);
  });

  it("un turno que empezó después de cargarse no ve frío", async () => {
    await cargaMedida(async () => ({}));
    await new Promise((r) => setTimeout(r, 5));
    expect(motorFrioDesde(Date.now())).toBeNull();
  });

  it("sin haberse cargado, null; y el segundo import no pisa el primero", async () => {
    expect(motorFrioDesde(0)).toBeNull();
    await cargaMedida(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const primero = motorFrioDesde(0);
    await cargaMedida(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(motorFrioDesde(0)).toBe(primero);
  });

  it("si el import falla, no apunta nada", async () => {
    await expect(cargaMedida(async () => { throw new Error("sin core.mjs"); })).rejects.toThrow("sin core.mjs");
    expect(motorFrioDesde(0)).toBeNull();
  });
});

describe("usoParcialDe: lo pagado de la llamada que se cortó", () => {
  it("suma las llamadas acabadas y lo que el stream en curso ya había contado", () => {
    const progreso = {
      uso: { input_tokens: 10, output_tokens: 50, cache_read_input_tokens: 30000, cache_creation_input_tokens: 0 },
      enCurso: { currentMessage: { usage: { input_tokens: 4, output_tokens: 2, cache_read_input_tokens: 31000, cache_creation_input_tokens: 120 } } },
    };
    expect(usoParcialDe(progreso)).toEqual({ in: 14, out: 52, cr: 61000, cw: 120 });
  });

  it("cortada antes de que llegue nada: null (la medida lo estima y lo marca)", () => {
    expect(usoParcialDe({ uso: {}, enCurso: null })).toBeNull();
    expect(usoParcialDe({ uso: { input_tokens: 0 }, enCurso: { currentMessage: undefined } })).toBeNull();
    expect(usoParcialDe(null)).toBeNull();
  });
});
