import { describe, it, expect } from "vitest";
import { madridAUtc } from "./recordatorios.js";
import { botonDeRecordatorio, idDeBoton, alPulsar, AL_PULSAR, avisoDeOtraCasa } from "./botonRecordatorio.js";

describe("madridAUtc", () => {
  it("en verano España va a UTC+2", () => {
    expect(madridAUtc("2026-07-05T19:00").toISOString()).toBe("2026-07-05T17:00:00.000Z");
  });
  it("en invierno, a UTC+1", () => {
    expect(madridAUtc("2026-12-06T19:00").toISOString()).toBe("2026-12-06T18:00:00.000Z");
  });
  it("el día del cambio de hora de octubre, por la tarde ya es invierno", () => {
    expect(madridAUtc("2026-10-25T19:00").toISOString()).toBe("2026-10-25T18:00:00.000Z");
  });
  it("lo que no es una fecha, null", () => {
    expect(madridAUtc("el domingo")).toBeNull();
  });
});

// El botón de un recordatorio lleva su tarea, no su texto (#1238).
describe("el botón de un recordatorio", () => {
  const ID = "0f8e2a1c-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

  it("lleva el id de la tarea, cabe en los 64 bytes de Telegram y se lee de vuelta", () => {
    const { dato } = botonDeRecordatorio(ID);
    expect(Buffer.byteLength(dato)).toBeLessThanOrEqual(64);
    expect(idDeBoton(dato)).toBe(ID);
  });

  it("otro botón, o un id que no es uuid, no es de un recordatorio", () => {
    expect(idDeBoton("t:Prepara el menú")).toBeNull();
    expect(idDeBoton("rec:123")).toBeNull();
    expect(idDeBoton(undefined)).toBeNull();
  });

  it("se hace solo en la casa del recordatorio; si ya no está, se dice", () => {
    const recordatorio = { household_id: "casaA", texto: "Sacar la carne" };
    expect(alPulsar({ recordatorio, casa: "casaA" })).toBe(AL_PULSAR.HACER);
    expect(alPulsar({ recordatorio, casa: "casaB" })).toBe(AL_PULSAR.OTRA_CASA);
    expect(alPulsar({ recordatorio: null, casa: "casaA" })).toBe(AL_PULSAR.YA_NO_ESTA);
  });

  it("el aviso de otra casa nombra las dos, y sin nombres no se rompe", () => {
    expect(avisoDeOtraCasa({ suya: "Casa A", abierta: "Casa B" })).toMatch(/es de <b>Casa A<.b>, y ahora tienes abierta <b>Casa B<.b>/);
    expect(avisoDeOtraCasa({ suya: null, abierta: null })).toMatch(/es de otra casa/);
  });
});
