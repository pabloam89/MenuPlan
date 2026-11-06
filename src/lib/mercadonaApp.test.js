import { describe, expect, it, vi } from "vitest";

vi.mock("./familiaCasa.js", () => ({ tokenDeSesion: async () => "t" }));
vi.mock("./apiUrl.js", () => ({ apiUrl: (r) => r }));

const { guardarSesion, leerEstado } = await import("./mercadonaApp.js");

const responde = (cuerpo, ok = true, status = 200) => vi.fn(async () => ({ ok, status, json: async () => cuerpo }));

describe("las llamadas", () => {
  it("leer va por GET con la casa y el token", async () => {
    const fetcher = responde({ cuenta: "conectada" });
    expect(await leerEstado("c 1", { fetcher })).toEqual({ ok: true, cuenta: "conectada" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/mercadona?casa=c%201");
    expect(init.headers.authorization).toBe("Bearer t");
  });

  it("conectar manda solo la sesión sellada", async () => {
    const fetcher = responde({ conectada: true });
    await guardarSesion("c", "sello", { fetcher });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ casa: "c", conectar: { sesion_cifrada: "sello" } });
  });

  it("sin sesión no llama", async () => {
    const fetcher = responde({});
    expect(await leerEstado("c", { fetcher, token: async () => null })).toEqual({ ok: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("un error del servidor o de red no lanza", async () => {
    expect(await leerEstado("c", { fetcher: responde({}, false, 500) })).toEqual({ ok: false });
    expect(await leerEstado("c", { fetcher: vi.fn().mockRejectedValue(new TypeError("red")) })).toEqual({ ok: false });
  });
});
