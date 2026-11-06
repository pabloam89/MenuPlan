import { describe, expect, it, vi } from "vitest";
import { bajarCategorias } from "./mercadonaFetch.mjs";

const sinEspera = { pausa: async () => {}, esperaBaseMs: 1 };

describe("bajarCategorias", () => {
  it("devuelve la página de cada categoría", async () => {
    const paginas = await bajarCategorias([1, 2, 3], async (id) => ({ id }), sinEspera);
    expect([...paginas.keys()]).toEqual([1, 2, 3]);
  });

  it("reintenta una categoría que falla y se queda con la buena", async () => {
    let fallos = 2;
    const leer = vi.fn(async (id) => {
      if (id === 2 && fallos-- > 0) throw new Error("429");
      return { id };
    });
    const paginas = await bajarCategorias([1, 2], leer, sinEspera);
    expect(paginas.get(2)).toEqual({ id: 2 });
    expect(leer).toHaveBeenCalledTimes(4);
  });

  it("si una categoría sigue fallando, lanza y dice cuál: nunca un catálogo a medias", async () => {
    const leer = async (id) => {
      if (id === 2) throw new Error("403");
      return { id };
    };
    await expect(bajarCategorias([1, 2, 3], leer, sinEspera)).rejects.toThrow("1 categorías sin bajar: 2: 403");
  });

  it("espera más en cada reintento", async () => {
    const esperas = [];
    const pausa = async (ms) => esperas.push(ms);
    await expect(bajarCategorias([1], async () => { throw new Error("x"); }, { pausa, esperaBaseMs: 10 })).rejects.toThrow();
    expect(esperas).toEqual([10, 20, 40]);
  });
});
