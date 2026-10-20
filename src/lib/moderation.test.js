import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// apiUrl arrastra @capacitor/core, que en un test no pinta nada.
vi.mock("./apiUrl.js", () => ({ apiUrl: (p) => p }));
import { reviewText } from "./moderation.js";

const responde = (body, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });

beforeEach(() => { global.fetch = responde({ ok: true }); });
afterEach(() => { vi.restoreAllMocks(); });

describe("reviewText", () => {
  it("no llama a la red con un texto vacío", async () => {
    expect(await reviewText("   ")).toEqual({ ok: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("deja pasar lo que el filtro aprueba", async () => {
    expect(await reviewText("qué rico este guiso")).toEqual({ ok: true });
  });

  it("traduce el motivo a un mensaje para quien escribe", async () => {
    global.fetch = responde({ ok: false, reason: "acoso" });
    const res = await reviewText("algo feo");
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/ataque personal/i);
  });

  it("usa el mensaje genérico ante un motivo que no conoce", async () => {
    global.fetch = responde({ ok: false, reason: "algo_nuevo" });
    const res = await reviewText("algo feo");
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/no se puede publicar/i);
  });

  // Las dos que de verdad importan: el filtro es una capa sobre reportar y
  // bloquear, no el muro que sostiene la app. Si se cae, se publica — dejar a
  // la gente sin comentar porque Anthropic tarda es peor remedio que la
  // enfermedad. En `vite dev` no hay funciones serverless y /api/moderate da
  // 404: ese es justo el segundo caso.
  it("falla abierto si la red revienta", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("sin red"));
    expect(await reviewText("lo que sea")).toEqual({ ok: true });
  });

  it("falla abierto si el endpoint no responde 2xx", async () => {
    global.fetch = responde({}, false);
    expect(await reviewText("lo que sea")).toEqual({ ok: true });
  });
});
