import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { conPlazo, quedaMs, cabeUnTurno, plazoDeLlamada, DURACION_MAX_MS, MARGEN_MS, TURNO_MIN_MS } from "./plazo.js";

describe("el reloj de cada invocación (#958)", () => {
  it("DURACION_MAX_MS es el maxDuration del webhook en vercel.json", () => {
    const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
    expect(vercel.functions["api/bot/telegram.js"].maxDuration * 1000).toBe(DURACION_MAX_MS);
  });

  it("fuera de una invocación no hay límite", () => {
    expect(quedaMs()).toBe(Infinity);
    expect(cabeUnTurno()).toBe(true);
    expect(plazoDeLlamada(55_000)).toBe(55_000);
  });

  it("dentro, lo que queda descuenta el margen final y recorta el plazo del modelo", async () => {
    await conPlazo(Date.now() - 100_000, async () => {
      const queda = quedaMs();
      expect(queda).toBeLessThanOrEqual(DURACION_MAX_MS - MARGEN_MS - 100_000);
      expect(queda).toBeGreaterThan(DURACION_MAX_MS - MARGEN_MS - 100_000 - 1000);
      expect(plazoDeLlamada(55_000)).toBeLessThanOrEqual(queda);
      expect(cabeUnTurno()).toBe(false);
    });
    await conPlazo(Date.now(), async () => {
      expect(quedaMs()).toBeGreaterThan(TURNO_MIN_MS);
      expect(cabeUnTurno()).toBe(true);
    });
  });

  it("cada invocación lleva su reloj, aunque compartan proceso", async () => {
    const [a, b] = await Promise.all([
      conPlazo(Date.now(), async () => quedaMs()),
      conPlazo(Date.now() - 90_000, async () => quedaMs()),
    ]);
    expect(a - b).toBeGreaterThan(80_000);
  });
});
