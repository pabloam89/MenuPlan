import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { conPlazo, quedaMs, cabeUnTurno, plazoDeLlamada, DURACION_MAX_MS, MARGEN_MS } from "./plazo.js";

// Reloj fijo: el test no depende de lo que tarde la máquina (C7).
const AHORA = 1_000_000;

describe("el reloj de cada invocación (#958)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("DURACION_MAX_MS es el maxDuration del webhook en vercel.json", () => {
    const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
    expect(vercel.functions["api/bot/telegram.js"].maxDuration * 1000).toBe(DURACION_MAX_MS);
  });

  it("fuera de una invocación no hay límite", () => {
    expect(quedaMs()).toBe(Infinity);
    expect(cabeUnTurno()).toBe(true);
    expect(plazoDeLlamada(55_000)).toBe(55_000);
  });

  it("recién empezada cabe un turno; a los 100 s ya no, y el plazo del modelo se recorta a lo que queda", async () => {
    vi.spyOn(Date, "now").mockReturnValue(AHORA);
    await conPlazo(AHORA, async () => {
      expect(quedaMs()).toBe(DURACION_MAX_MS - MARGEN_MS);
      expect(cabeUnTurno()).toBe(true);
      expect(plazoDeLlamada(55_000)).toBe(55_000);
    });
    await conPlazo(AHORA - 100_000, async () => {
      expect(quedaMs()).toBe(DURACION_MAX_MS - MARGEN_MS - 100_000);
      expect(cabeUnTurno()).toBe(false);
      expect(plazoDeLlamada(55_000)).toBe(DURACION_MAX_MS - MARGEN_MS - 100_000);
    });
  });

  it("cada invocación lleva su reloj, aunque compartan proceso", async () => {
    vi.spyOn(Date, "now").mockReturnValue(AHORA);
    const [a, b] = await Promise.all([
      conPlazo(AHORA, async () => quedaMs()),
      conPlazo(AHORA - 90_000, async () => quedaMs()),
    ]);
    expect(a - b).toBe(90_000);
  });
});
