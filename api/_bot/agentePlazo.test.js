/**
 * El agente mira el reloj de la invocación (plazo.js, #958): con una vuelta
 * de mentira, el modelo de reserva no se prueba si ya no le daría tiempo.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { ejecutar } = await import("./agente.js");
const { conPlazo, DURACION_MAX_MS, MARGEN_MS, RESERVA_MIN_MS } = await import("./plazo.js");

const AHORA = 1_000_000;
const verMenu = { name: "ver_menu", run: async () => "Lunes: lentejas." };
const uso = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const caida = () => Anthropic.APIError.generate(529, { type: "error", error: { type: "overloaded_error", message: "x" } }, "x", new Headers());

describe("el agente y el reloj de la invocación (#958)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("si al caerse el principal no queda tiempo para el de reserva, no se prueba y el fallo se lanza", async () => {
    vi.spyOn(Date, "now").mockReturnValue(AHORA);
    const vuelta = vi.fn(async () => { throw caida(); });
    // Le quedan RESERVA_MIN_MS / 2.
    const inicio = AHORA - (DURACION_MAX_MS - MARGEN_MS - RESERVA_MIN_MS / 2);
    const err = await conPlazo(inicio, () => ejecutar({ entrada: "hola", tools: [verMenu], modelos: ["a", "b"], vuelta })).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.caida).toBe(true);
    expect(vuelta).toHaveBeenCalledTimes(1);
  });

  it("con tiempo, el de reserva contesta como siempre", async () => {
    vi.spyOn(Date, "now").mockReturnValue(AHORA);
    const vuelta = vi.fn()
      .mockRejectedValueOnce(caida())
      .mockResolvedValueOnce({ dicho: "Hoy, lentejas.", uso, vueltas: 1 });
    const r = await conPlazo(AHORA, () => ejecutar({ entrada: "hola", tools: [verMenu], modelos: ["a", "b"], vuelta }));
    expect(r.planB).toBe(true);
    expect(vuelta).toHaveBeenCalledTimes(2);
  });
});
