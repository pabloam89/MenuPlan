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

const { aSolas, drenar } = await import("./turnos.js");
const { update, select } = await import("./db.js");
const { conPlazo } = await import("./plazo.js");

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

describe("drenar mira el reloj de la invocación (#958)", () => {
  beforeEach(() => { llamadas.length = 0; update.mockReset(); update.mockResolvedValue([]); select.mockReset(); select.mockResolvedValue([]); });
  afterEach(() => { vi.restoreAllMocks(); libre = true; });

  it("sin tiempo para un turno entero: no toma el candado ni saca nada, y lo releva", async () => {
    const atender = vi.fn(async () => {});
    const alSobrar = vi.fn(async () => {});
    // La invocación empezó hace 100 s: quedan 8 s, menos que TURNO_MIN_MS.
    await conPlazo(Date.now() - 100_000, () => drenar("c1", atender, { espera: 0, alSobrar }));
    expect(update).not.toHaveBeenCalled();
    expect(atender).not.toHaveBeenCalled();
    expect(llamadas).not.toContain("bot_tomar_candado");
    expect(alSobrar).toHaveBeenCalledTimes(1);
  });

  it("con tiempo: atiende lo pendiente, suelta el candado y no releva si no queda nada", async () => {
    update.mockResolvedValueOnce([{ id: 1, item: { texto: "hola" } }]);
    const atender = vi.fn(async () => {});
    const alSobrar = vi.fn(async () => {});
    await conPlazo(Date.now(), () => drenar("c1", atender, { espera: 0, alSobrar }));
    expect(atender).toHaveBeenCalledWith([{ texto: "hola" }]);
    expect(alSobrar).not.toHaveBeenCalled();
    expect(llamadas.filter((n) => n === "bot_soltar_candado")).toHaveLength(1);
  });

  it("se queda sin tiempo a mitad con cola detrás: no saca más, suelta el candado y lo releva", async () => {
    update.mockResolvedValue([{ id: 1, item: { texto: "otra" } }]);
    select.mockResolvedValue([{ id: 2 }]);
    let ahora = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => ahora);
    // Cada turno tarda 80 s: tras el primero ya no cabe otro en los 120 s.
    const atender = vi.fn(async () => { ahora += 80_000; });
    const alSobrar = vi.fn(async () => {});
    await conPlazo(Date.now(), () => drenar("c1", atender, { espera: 0, alSobrar }));
    expect(atender).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(llamadas.filter((n) => n === "bot_soltar_candado")).toHaveLength(1);
    expect(alSobrar).toHaveBeenCalledTimes(1);
  });
});
