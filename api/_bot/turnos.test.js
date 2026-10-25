import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const llamadas = [];
let libre = true;
vi.mock("./db.js", () => ({
  rpc: vi.fn(async (nombre) => {
    llamadas.push(nombre);
    if (nombre === "bot_tomar_candado") return libre;
    return null;
  }),
  select: vi.fn(async () => []),
  insert: vi.fn(async () => []),
  update: vi.fn(async () => []),
  eq: (v) => `eq.${v}`,
}));

const { aSolas } = await import("./turnos.js");

describe("aSolas: una foto espera su turno y nunca suelta un candado ajeno", () => {
  beforeEach(() => { llamadas.length = 0; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); libre = true; });

  it("con el chat ocupado todo el rato: no responde a la vez ni suelta el candado del otro", async () => {
    libre = false;
    const atender = vi.fn(async () => {});
    const alOcupar = vi.fn(async () => {});
    const p = aSolas("c1", atender, vi.fn(), alOcupar);
    await vi.advanceTimersByTimeAsync(65000);
    await p;
    expect(atender).not.toHaveBeenCalled();
    expect(llamadas).not.toContain("bot_soltar_candado");
    expect(alOcupar).toHaveBeenCalledTimes(1);
  });

  it("con el chat libre: responde y suelta su candado", async () => {
    const atender = vi.fn(async () => {});
    const p = aSolas("c1", atender, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(10);
    await p;
    expect(atender).toHaveBeenCalledTimes(1);
    expect(llamadas.filter((n) => n === "bot_soltar_candado")).toHaveLength(1);
  });

  it("dice cuánto esperó a que el chat quedara libre (bot_route espera_cola_ms)", async () => {
    libre = false;
    const atender = vi.fn(async () => {});
    const p = aSolas("c1", atender, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(3000);
    libre = true;
    await vi.advanceTimersByTimeAsync(1100);
    await p;
    // Con relojes falsos el tiempo es exacto: 3 intentos de 1 s sin candado, y el cuarto lo toma.
    expect(atender).toHaveBeenCalledWith({ esperaMs: 4000 });
  });

  it("con el chat libre, la espera es casi nula", async () => {
    const atender = vi.fn(async () => {});
    const p = aSolas("c1", atender, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(10);
    await p;
    expect(atender.mock.calls[0][0].esperaMs).toBeLessThan(1000);
  });
});
