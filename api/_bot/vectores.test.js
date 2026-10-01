import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { porVectores, tieneNegacion } from "./vectores.js";

const ix = JSON.parse(readFileSync(new URL("./recetasVectores.json", import.meta.url), "utf8"));
const datos = Buffer.from(ix.datos, "base64");
// El vector de una receta del índice, tal cual: buscarlo tiene que devolverla primera.
const vectorDe = (id) => {
  const i = ix.ids.indexOf(id);
  return [...new Int8Array(datos.buffer, datos.byteOffset + i * ix.dims, ix.dims)].map((x) => x * ix.escalas[i]);
};
const responde = (embedding) => vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ embedding }] }) }));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("porVectores", () => {
  it("el índice es del Recetario Estrella y está al día de tamaño", () => {
    expect(ix.ids.length).toBe(ix.escalas.length);
    expect(datos.length).toBe(ix.ids.length * ix.dims);
  });

  it("devuelve primero la receta más cercana, y como mucho n", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    const id = ix.ids[42];
    vi.stubGlobal("fetch", responde(vectorDe(id)));
    const ids = await porVectores("frase única de prueba 1", { n: 3 });
    expect(ids[0]).toBe(id);
    expect(ids).toHaveLength(3);
  });

  it("la misma frase no se vuelve a vectorizar", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    const f = responde(vectorDe(ix.ids[7]));
    vi.stubGlobal("fetch", f);
    await porVectores("Frase repetida");
    await porVectores("frase repetida ");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("si el gateway falla o no hay clave, [] y sigue el respaldo", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, text: async () => "límite" })));
    expect(await porVectores("frase que falla")).toEqual([]);
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    expect(await porVectores("frase sin clave")).toEqual([]);
  });
});

describe("tieneNegacion", () => {
  it("ve el «no» y el «sin», no los confunde con palabras que los contienen", () => {
    expect(tieneNegacion("que no sea pescado")).toBe(true);
    expect(tieneNegacion("algo sin horno")).toBe(true);
    expect(tieneNegacion("unos sinsabores de nochebuena")).toBe(false);
    expect(tieneNegacion("algo con noodles")).toBe(false);
  });
});
