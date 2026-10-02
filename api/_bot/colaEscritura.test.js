import { describe, it, expect } from "vitest";
import { colaDeEscritura } from "./agente.js";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

describe("las escrituras de un turno van en fila", () => {
  it("nunca se solapan, aunque se lancen a la vez, y respetan el orden", async () => {
    const enFila = colaDeEscritura();
    let dentro = 0;
    let maxDentro = 0;
    const orden = [];
    const tarea = (n, ms) => () => (async () => {
      dentro++; maxDentro = Math.max(maxDentro, dentro);
      await espera(ms);
      orden.push(n);
      dentro--;
      return n;
    })();
    // Como lanza el modelo cinco «fuera_de_casa»: todas a la vez.
    const r = await Promise.all([tarea(1, 30), tarea(2, 5), tarea(3, 20), tarea(4, 1), tarea(5, 10)].map(enFila));
    expect(maxDentro).toBe(1);
    expect(orden).toEqual([1, 2, 3, 4, 5]);
    expect(r).toEqual([1, 2, 3, 4, 5]);
  });

  it("una que falla no bloquea a las siguientes, y su error le llega a quien la lanzó", async () => {
    const enFila = colaDeEscritura();
    const mala = enFila(async () => { throw new Error("choque"); });
    const buena = enFila(async () => "guardada");
    await expect(mala).rejects.toThrow("choque");
    await expect(buena).resolves.toBe("guardada");
  });
});
