import { describe, expect, it, vi } from "vitest";

vi.mock("./familiaCasa.js", () => ({ tokenDeSesion: async () => "t" }));
vi.mock("./apiUrl.js", () => ({ apiUrl: (r) => r }));

const { encargoEnMarcha, guardarSesion, leerEstado, pedirLista, quitarCuenta, textoDeEncargo } = await import("./mercadonaApp.js");

const responde = (cuerpo, ok = true, status = 200) => vi.fn(async () => ({ ok, status, json: async () => cuerpo }));

describe("las llamadas", () => {
  it("leer va por GET con la casa y el token", async () => {
    const fetcher = responde({ cuenta: "conectada" });
    expect(await leerEstado("c 1", { fetcher })).toEqual({ ok: true, cuenta: "conectada" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/mercadona?casa=c%201");
    expect(init.headers.authorization).toBe("Bearer t");
  });

  it("pedir la lista manda la casa y la lista", async () => {
    const fetcher = responde({ encargo: { id: "e" } });
    await pedirLista("c", { name: "x" }, { fetcher });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ casa: "c", encargar: { lista: { name: "x" } } });
  });

  it("conectar manda solo la sesión sellada", async () => {
    const fetcher = responde({ conectada: true });
    await guardarSesion("c", "sello", { fetcher });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ casa: "c", conectar: { sesion_cifrada: "sello" } });
  });

  it("desconectar", async () => {
    const fetcher = responde({ conectada: false });
    await quitarCuenta("c", { fetcher });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ casa: "c", desconectar: true });
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

describe("el encargo", () => {
  it("sabe si sigue en marcha", () => {
    expect(["pendiente", "rellenando", "hecho", "fallido"].map((status) => encargoEnMarcha({ status }))).toEqual([true, true, false, false]);
    expect(encargoEnMarcha(null)).toBe(false);
  });

  it.each([
    [{ status: "hecho", entraron: 3, faltan: [] }, "Lista creada con 3 productos."],
    [{ status: "hecho", entraron: 3, faltan: ["1", "2"] }, "Lista creada con 3 productos. 2 no han entrado."],
    [{ status: "hecho", entraron: null, faltan: null }, "No he podido comprobar"],
    [{ status: "fallido", fallo: "bloqueado" }, "no nos ha dejado"],
    [{ status: "fallido", fallo: "caducado" }, "demasiado"],
    [{ status: "fallido", fallo: "error" }, "No se ha podido"],
  ])("cuenta qué pasó: %j", (e, texto) => {
    expect(textoDeEncargo(e)).toContain(texto);
  });
});
