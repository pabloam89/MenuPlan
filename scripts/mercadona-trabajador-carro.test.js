// Trozo 19 de #1407: la lista se suma al carro sin quitar lo que había, y solo si la casa lo ha encendido.
import { describe, expect, it, vi } from "vitest";
import { faltanEnCarro, sumarAlCarro, totalDelCarro } from "./lib/mercadonaCarro.mjs";
import { llenarCarro } from "./lib/mercadonaPagina.mjs";
import { atender, resultadoDeCarro } from "./lib/mercadonaTrabajador.mjs";

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
    expect(await llenarCarro(p, LISTA)).toEqual({ resultado: "carro_lleno", total: 64.1, faltan: [] });
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
const encargo = (alcance) => ({ encargo: { id: "e1", lista: LISTA }, sesion_cifrada: "sellada", ...(alcance ? { alcance } : {}) });

describe("atender: hasta dónde llega", () => {
  it("con «lista», o sin alcance, no toca el carro", async () => {
    for (const alcance of ["lista", undefined, "otra_cosa"]) {
      const p = pagina();
      const r = await atender(encargo(alcance), dep(p));
      expect(r).toEqual({ lista_xid: "7", entraron: 2, faltan: [] });
      expect(p.escrituras).toHaveLength(0);
    }
  });

  it("con «reservar» o «pagar», la lista y además el carro", async () => {
    for (const alcance of ["reservar", "pagar"]) {
      const p = pagina();
      expect(await atender(encargo(alcance), dep(p))).toEqual({ lista_xid: "7", entraron: 2, faltan: [], carro: { lleno: true, total: 64.1, faltan: [] } });
      expect(p.escrituras).toHaveLength(1);
    }
  });

  it("un carro que falla no tumba la lista, que ya está", async () => {
    const p = pagina({ leer: { paso: "leer_carro", status: 403, carro: null } });
    expect(await atender(encargo("reservar"), dep(p))).toEqual({ lista_xid: "7", entraron: 2, faltan: [], carro: { lleno: false, motivo: "bloqueado" } });
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
