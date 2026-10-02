import { describe, expect, it, vi } from "vitest";

let guardadas = [];
vi.mock("./db.js", () => ({
  select: vi.fn(async (tabla, filtro) => {
    const hs = filtro.match(/in\.\(([^)]*)\)/)?.[1]?.split(",") ?? [];
    return guardadas.filter((g) => hs.includes(g.source_hash));
  }),
  insert: vi.fn(async (tabla, filas) => { guardadas.push(...filas); }),
}));

const { traducir, hashDe } = await import("./traducir.js");
const falso = () => {
  const llamadas = [];
  const modelo = async (textos) => { llamadas.push(textos); return textos.map((t) => `EN:${t}`); };
  return { modelo, llamadas };
};

describe("traducir lo pintado", () => {
  it("en castellano no toca nada ni llama a nadie", async () => {
    const f = falso();
    expect(await traducir(["<b>Sábado 4 de octubre</b>"], "es", f)).toEqual(["<b>Sábado 4 de octubre</b>"]);
    expect(await traducir(["Hola"], null, f)).toEqual(["Hola"]);
    expect(f.llamadas).toEqual([]);
  });

  it("en inglés, un lote, sin repetidos ni vacíos", async () => {
    const f = falso();
    const r = await traducir(["🍽️ Lentejas estofadas", "", "🍽️ Lentejas estofadas", "Tortilla"], "en", f);
    expect(r).toEqual(["EN:🍽️ Lentejas estofadas", "", "EN:🍽️ Lentejas estofadas", "EN:Tortilla"]);
    expect(f.llamadas).toEqual([["🍽️ Lentejas estofadas", "Tortilla"]]);
  });

  it("lo ya traducido sale de la caché (también tras reiniciar: de la base)", async () => {
    const f = falso();
    await traducir(["Merluza a la plancha"], "en", f);
    const g = falso();
    expect(await traducir(["Merluza a la plancha"], "en", g)).toEqual(["EN:Merluza a la plancha"]);
    expect(g.llamadas).toEqual([]);
    expect(guardadas.some((x) => x.source_hash === hashDe("Merluza a la plancha"))).toBe(true);
  });

  it("si el modelo falla, sale en castellano", async () => {
    const r = await traducir(["Crema de calabaza nueva"], "en", { modelo: async () => { throw new Error("caído"); } });
    expect(r).toEqual(["Crema de calabaza nueva"]);
  });
});
