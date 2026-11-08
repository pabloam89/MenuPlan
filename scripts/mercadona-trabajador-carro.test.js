// Trozo 19 de #1407: la lista se suma al carro sin quitar lo que había, y solo si la casa lo ha encendido.
import { describe, expect, it, vi } from "vitest";
import { faltanEnCarro, sumarAlCarro, totalDelCarro } from "./lib/mercadonaCarro.mjs";
import { llenarCarro } from "./lib/mercadonaPagina.mjs";
import { atender, resultadoDeCarro, unaVuelta } from "./lib/mercadonaTrabajador.mjs";

// Un carro como el que devuelve `GET …/cart/` (pedido.md, «Carrito»), con datos inventados.
const CARRO = {
  id: "carro-1",
  version: 13,
  lines: [
    { product_id: "10", quantity: 2, sources: ["a", "b"], version: 4 },
    { product_id: "20", quantity: 1, sources: ["c"], version: 2 },
  ],
  summary: { total: "41.30" },
};
const HORA = { id: "f1", start: "2026-11-12T14:00:00Z", end: "2026-11-12T15:00:00Z", price: "7.21", available: true };
const LISTA = { name: "Compra HoMenu", products: [{ merca_code: "20", quantity: 3 }, { merca_code: "30", quantity: 1 }] };

describe("sumarAlCarro", () => {
  it("lo que había sigue igual, el mismo producto suma y lo nuevo va detrás", () => {
    expect(sumarAlCarro(CARRO, LISTA.products)).toEqual({
      id: "carro-1",
      version: 13,
      lines: [
        { product_id: "10", quantity: 2, sources: ["a", "b"], version: 4 },
        { product_id: "20", quantity: 4, sources: ["c"], version: 2 },
        { product_id: "30", quantity: 1 },
      ],
    });
  });

  it("no cambia el carro leído", () => {
    sumarAlCarro(CARRO, LISTA.products);
    expect(CARRO.lines[1].quantity).toBe(1);
  });

  it("con el carro vacío, la lista tal cual", () => {
    expect(sumarAlCarro({ id: "c", version: 1, lines: [] }, [{ merca_code: 7, quantity: 2 }]).lines).toEqual([{ product_id: "7", quantity: 2 }]);
  });
});

describe("lo que devuelve Mercadona", () => {
  it("faltanEnCarro dice qué línea no quedó como se mandó", () => {
    const mandado = sumarAlCarro(CARRO, LISTA.products);
    const devuelto = { lines: mandado.lines.filter((l) => l.product_id !== "30") };
    expect(faltanEnCarro(mandado, devuelto)).toEqual(["30"]);
    expect(faltanEnCarro(mandado, mandado)).toEqual([]);
  });

  it("totalDelCarro lee el total con punto o coma, y null si no hay", () => {
    expect(totalDelCarro(CARRO)).toBe(41.3);
    expect(totalDelCarro({ summary: { total: "87,40" } })).toBe(87.4);
    expect(totalDelCarro({ summary: {} })).toBeNull();
    expect(totalDelCarro({ summary: { total: "«texto»" } })).toBeNull();
  });
});

// Una página falsa: responde a lo que el trabajador pide con `evaluate(enPagina, orden)`.
function pagina({ leer = { paso: "leer_carro", status: 200, carro: CARRO }, escribir } = {}) {
  const escrituras = [];
  return {
    escrituras,
    goto: vi.fn(async () => ({ status: () => 200 })),
    waitForTimeout: vi.fn(async () => {}),
    evaluate: vi.fn(async (_f, orden) => {
      if (!orden) return true;
      // El pedido y sus horas (trozo 20), para que «reservar» llegue hasta el final.
      if (orden.crear) return { paso: "horas_entrega", status: 200, pedido_xid: "p9", summary: { total: "64.10" }, horas_entrega: [HORA] };
      if ("carro" in orden && orden.carro === null) return leer;
      if ("carro" in orden) {
        escrituras.push(orden.carro);
        return escribir ?? { paso: "escribir_carro", status: 200, carro: { ...orden.carro, summary: { total: "64.10" } } };
      }
      return { paso: "leer", status: 200, id: 7, guardada: { products: orden.products.map((p) => ({ id: p.merca_code })) } };
    }),
  };
}

describe("llenarCarro", () => {
  it("lee, suma y escribe UNA vez con la versión leída", async () => {
    const p = pagina();
    expect(await llenarCarro(p, LISTA)).toEqual({ resultado: "carro_lleno", total: 64.1, faltan: [], carro: expect.objectContaining({ id: "carro-1", version: 13 }) });
    expect(p.escrituras).toHaveLength(1);
    expect(p.escrituras[0].version).toBe(13);
  });

  it("si no puede leer el carro, no escribe nada", async () => {
    const p = pagina({ leer: { paso: "leer_carro", status: 500, carro: null } });
    expect(await llenarCarro(p, LISTA)).toEqual({ resultado: "fallo_carro", status: 500 });
    expect(p.escrituras).toHaveLength(0);
  });

  it("si Mercadona rechaza la escritura (el carro cambió), lo cuenta y no reintenta", async () => {
    const p = pagina({ escribir: { paso: "escribir_carro", status: 409, carro: null } });
    expect(await llenarCarro(p, LISTA)).toEqual({ resultado: "fallo_carro", status: 409 });
    expect(p.escrituras).toHaveLength(1);
  });
});

const dep = (p) => ({ abrirSesion: async () => '{"cookies":[]}', abrirNavegador: async () => ({ pagina: p, cerrar: async () => {} }) });
const encargo = (llega_hasta) => ({ encargo: { id: "e1", lista: LISTA }, sesion_cifrada: "sellada", ...(llega_hasta ? { llega_hasta } : {}) });

describe("atender: hasta dónde llega", () => {
  it("con «lista», o sin llega_hasta, no toca el carro", async () => {
    for (const llega_hasta of ["lista", undefined, "otra_cosa"]) {
      const p = pagina();
      const r = await atender(encargo(llega_hasta), dep(p));
      expect(r).toEqual({ lista_xid: "7", entraron: 2, faltan: [] });
      expect(p.escrituras).toHaveLength(0);
    }
  });

  it("con «reservar» o «pagar», la lista, el carro y las horas del pedido (trozo 20)", async () => {
    for (const llega_hasta of ["reservar", "pagar"]) {
      const p = pagina();
      expect(await atender(encargo(llega_hasta), dep(p))).toEqual({ lista_xid: "7", entraron: 2, faltan: [], pedido: { pedido_xid: "p9", total: 64.1, horas_entrega: [HORA] } });
      expect(p.escrituras).toHaveLength(1);
    }
  });

  it("un carro que falla no tumba la lista, que ya está", async () => {
    const p = pagina({ leer: { paso: "leer_carro", status: 403, carro: null } });
    expect(await atender(encargo("reservar"), dep(p))).toEqual({ lista_xid: "7", entraron: 2, faltan: [], fallo: "bloqueado" });
  });
});

describe("unaVuelta: el carro, en el log", () => {
  it("un carro que falla se ve en el log, no sale como «hecho» a secas", async () => {
    const log = vi.fn();
    const api = { tomar: async () => encargo("reservar"), cerrar: vi.fn(async () => {}) };
    const p = pagina({ leer: { paso: "leer_carro", status: 403, carro: null } });
    expect(await unaVuelta({ api, log, entreCierresMs: 0, ...dep(p) })).toBe(true);
    expect(log).toHaveBeenCalledWith("encargo e1: hecho, carro sin llenar: bloqueado");
  });

  it("un carro lleno también se dice", async () => {
    const log = vi.fn();
    const api = { tomar: async () => encargo("reservar"), cerrar: vi.fn(async () => {}) };
    await unaVuelta({ api, log, entreCierresMs: 0, ...dep(pagina()) });
    expect(log).toHaveBeenCalledWith("encargo e1: hecho, carro lleno");
  });
});

describe("el carro no se lleva la lista por delante", () => {
  it("si el carro lanza, la lista sigue: carro sin llenar y su lista_xid", async () => {
    const p = pagina();
    const evaluar = p.evaluate;
    p.evaluate = vi.fn(async (f, orden) => {
      if (orden && "carro" in orden) throw new TypeError("sin JSON");
      return evaluar(f, orden);
    });
    const log = vi.fn();
    expect(await atender(encargo("reservar"), { ...dep(p), log })).toEqual({ lista_xid: "7", entraron: 2, faltan: [], carro: { lleno: false, motivo: "error" } });
    expect(log).toHaveBeenCalledWith("carro: TypeError");
  });

  it("si el carro se pasa de tiempo, la lista sigue", async () => {
    const p = pagina();
    const evaluar = p.evaluate;
    p.evaluate = vi.fn((f, orden) => (orden && "carro" in orden ? new Promise(() => {}) : evaluar(f, orden)));
    expect(await atender(encargo("reservar"), { ...dep(p), topeMs: 20 })).toMatchObject({ lista_xid: "7", carro: { lleno: false, motivo: "error" } });
  });

  it("el carro solo tiene lo que le queda del tope del encargo, no otro entero", async () => {
    // Reloj falso: la lista se come 80 de los 100 ms; al carro le quedan 20, y un carro que no acaba se corta ahí.
    let t = 0;
    const p = pagina();
    const evaluar = p.evaluate;
    p.evaluate = vi.fn((f, orden) => {
      if (orden && "carro" in orden) return new Promise(() => {});
      if (orden?.products) t = 80;
      return evaluar(f, orden);
    });
    const relojes = vi.spyOn(globalThis, "setTimeout");
    const r = await atender(encargo("reservar"), { ...dep(p), topeMs: 100, ahora: () => t });
    expect(r).toMatchObject({ lista_xid: "7", carro: { lleno: false, motivo: "error" } });
    // Dos topes: el de la lista (100) y el del carro, con lo que quedaba (20).
    expect(relojes.mock.calls.map((c) => c[1]).filter((ms) => ms === 100 || ms === 20)).toEqual([100, 20]);
    relojes.mockRestore();
  });

  it("un carro lleno al que le faltan productos no sale como lleno a secas en el log", async () => {
    const log = vi.fn();
    const api = { tomar: async () => encargo("reservar"), cerrar: vi.fn(async () => {}) };
    const p = pagina({ escribir: { paso: "escribir_carro", status: 200, carro: { ...CARRO, summary: { total: "64.10" } } } });
    await unaVuelta({ api, log, entreCierresMs: 0, ...dep(p) });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^encargo e1: hecho, carro lleno salvo \d+$/));
  });
});

describe("resultadoDeCarro", () => {
  it.each([
    [{ resultado: "fallo_sesion", status: 0 }, { lleno: false, motivo: "sesion" }],
    [{ resultado: "fallo_carro", status: 401 }, { lleno: false, motivo: "sesion" }],
    [{ resultado: "fallo_carro", status: 429 }, { lleno: false, motivo: "bloqueado" }],
    [{ resultado: "fallo_carro", status: 500 }, { lleno: false, motivo: "error" }],
  ])("%j", (c, esperado) => {
    expect(resultadoDeCarro(c)).toEqual(esperado);
  });
});
