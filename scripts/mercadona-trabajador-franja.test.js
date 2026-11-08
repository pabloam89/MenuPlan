// Trozo 20 de #1407: tras el carro, el pedido y sus horas libres; con la hora elegida, la reserva y el teléfono.
// Nunca se confirma el pedido: eso es pagar (trozo 21).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { enPaginaPedido, franjasParaOfrecer, pedirFranjas, reservarFranja } from "./lib/mercadonaPedido.mjs";
import { atenderReserva, unaVuelta } from "./lib/mercadonaTrabajador.mjs";
import { PEDIDO_MINIMO_MERCADONA } from "../src/lib/mercadonaLista.js";

// Como las de pedido.md, «Franjas», con datos inventados.
const franja = (n, o = {}) => ({ id: `f${n}`, start: `2026-11-1${n}T14:00:00Z`, end: `2026-11-1${n}T15:00:00Z`, price: "7.21", available: true, open: true, timezone: "Europe/Madrid", ...o });
const CARRO = { id: "carro-1", version: 14, lines: [{ product_id: "10", quantity: 2 }], summary: { total: "64.10" } };

describe("franjasParaOfrecer", () => {
  it("solo las libres, por hora, cuatro como mucho y sin campos de más", () => {
    const todas = [franja(5), franja(2, { available: false }), franja(3), franja(4), franja(6), franja(7), { ...franja(8), extra: "x" }];
    const r = franjasParaOfrecer(todas);
    expect(r.map((f) => f.id)).toEqual(["f3", "f4", "f5", "f6"]);
    expect(Object.keys(r[0]).sort()).toEqual(["available", "end", "id", "open", "price", "start", "timezone"]);
    expect(franjasParaOfrecer([{ ...franja(8), extra: "x" }])[0]).not.toHaveProperty("extra");
  });

  it("lo que no se lee como franja no se ofrece", () => {
    expect(franjasParaOfrecer([{ id: "x", available: true, start: "mañana" }, null, franja(3, { id: null })])).toEqual([]);
    expect(franjasParaOfrecer(undefined)).toEqual([]);
  });
});

/** Una página falsa que contesta a enPaginaPedido. */
const pagina = (respuesta) => ({ evaluate: vi.fn(async (_f, orden) => (typeof respuesta === "function" ? respuesta(orden) : respuesta)) });

describe("pedirFranjas", () => {
  it("por debajo del pedido mínimo no crea el pedido", async () => {
    const p = pagina({});
    expect(await pedirFranjas(p, { ...CARRO, summary: { total: String(PEDIDO_MINIMO_MERCADONA - 0.01) } })).toEqual({ fallo: "bajo_minimo" });
    expect(await pedirFranjas(p, { ...CARRO, summary: {} })).toEqual({ fallo: "bajo_minimo" });
    expect(p.evaluate).not.toHaveBeenCalled();
  });

  it("crea el pedido con el carro escrito y da sus horas libres", async () => {
    const p = pagina({ paso: "franjas", status: 200, pedido_xid: "p9", summary: { total: "66.30" }, franjas: [franja(4), franja(3)] });
    expect(await pedirFranjas(p, CARRO)).toEqual({ pedido: { pedido_xid: "p9", total: 66.3, franjas: [franja(3), franja(4)] } });
    expect(p.evaluate.mock.calls[0][1]).toEqual({ crear: CARRO });
  });

  it.each([
    [{ paso: "sesion", status: 0 }, "sesion_caducada"],
    [{ paso: "crear_pedido", status: 429 }, "bloqueado"],
    [{ paso: "crear_pedido", status: 500 }, "error"],
    [{ paso: "sin_direccion", status: 201, pedido_xid: "p9" }, "sin_direccion"],
    [{ paso: "franjas", status: 503, pedido_xid: "p9" }, "error"],
    [{ paso: "franjas", status: 200, pedido_xid: "p9", franjas: [franja(3, { available: false })] }, "sin_franjas"],
  ])("%j → %s", async (r, fallo) => {
    expect(await pedirFranjas(pagina(r), CARRO)).toEqual({ fallo });
  });
});

describe("reservarFranja", () => {
  const TELEFONO = { phone_country_code: "34", phone_national_number: "600112233" };

  it("reserva con la franja tal como vino y el teléfono abierto", async () => {
    const p = pagina({ paso: "reservado", status: 200, cambiable_hasta: "2026-11-11T19:59:00+01:00", telefono: 200 });
    expect(await reservarFranja(p, { pedido_xid: "p9", franja: franja(3), telefono: TELEFONO })).toEqual({ cambiable_hasta: "2026-11-11T18:59:00.000Z" });
    expect(p.evaluate.mock.calls[0][1]).toEqual({ reservar: { pedido: "p9", franja: franja(3), telefono: TELEFONO } });
  });

  it("si se ocupó entre medias, franja_ocupada; otro no, su fallo", async () => {
    for (const status of [400, 409, 422]) expect(await reservarFranja(pagina({ paso: "reservar", status }), { pedido_xid: "p9", franja: franja(3) })).toEqual({ fallo: "franja_ocupada" });
    expect(await reservarFranja(pagina({ paso: "reservar", status: 401 }), { pedido_xid: "p9", franja: franja(3) })).toEqual({ fallo: "sesion_caducada" });
    expect(await reservarFranja(pagina({ paso: "ver_pedido", status: 500 }), { pedido_xid: "p9", franja: franja(3) })).toEqual({ fallo: "error" });
  });

  it("un teléfono que no entra no deshace la reserva: se dice en el log", async () => {
    const log = vi.fn();
    const p = pagina({ paso: "reservado", status: 200, cambiable_hasta: null, telefono: 400 });
    expect(await reservarFranja(p, { pedido_xid: "p9", franja: franja(3), telefono: TELEFONO }, log)).toEqual({ cambiable_hasta: null });
    expect(log).toHaveBeenCalledWith("teléfono sin poner: 400");
  });
});

describe("en la página", () => {
  it("nunca confirma ni paga: no llama a confirm/", () => {
    const codigo = readFileSync(new URL("./lib/mercadonaPedido.mjs", import.meta.url), "utf8");
    expect(codigo).not.toMatch(/confirm\//);
    expect(enPaginaPedido.toString()).not.toMatch(/confirm/);
  });
});

// El trabajador entero, con un navegador falso: la portada y la página que contesta a cada paso.
function navegador(respuestas) {
  const p = {
    goto: vi.fn(async () => ({ status: () => 200 })),
    waitForTimeout: vi.fn(async () => {}),
    evaluate: vi.fn(async (_f, orden) => {
      if (orden === null || orden === undefined) return true;
      return respuestas(orden);
    }),
  };
  const abiertos = [];
  return {
    p,
    abiertos,
    abrirSesion: vi.fn(async (sello) => {
      abiertos.push(sello);
      if (sello === "tel-sellado") return JSON.stringify({ phone_country_code: "34", phone_national_number: "600112233" });
      if (sello === "roto") throw new Error("no abre");
      return '{"cookies":[]}';
    }),
    abrirNavegador: async () => ({ pagina: p, cerrar: async () => {} }),
  };
}
const RESERVA = { reserva: { id: "e1", pedido_xid: "p9", franja: franja(3) }, sesion_cifrada: "sellada", telefono_sellado: "tel-sellado" };

describe("atenderReserva", () => {
  it("abre la sesión y el teléfono, reserva y dice hasta cuándo se cambia", async () => {
    const n = navegador(() => ({ paso: "reservado", status: 200, cambiable_hasta: "2026-11-11T18:59:00Z", telefono: 200 }));
    expect(await atenderReserva(RESERVA, n)).toEqual({ cambiable_hasta: "2026-11-11T18:59:00.000Z" });
    expect(n.abiertos).toEqual(["sellada", "tel-sellado"]);
    expect(n.p.evaluate.mock.calls.at(-1)[1].reservar.telefono).toEqual({ phone_country_code: "34", phone_national_number: "600112233" });
  });

  it("un teléfono que no abre no impide reservar; una sesión que no abre, sí", async () => {
    const n = navegador(() => ({ paso: "reservado", status: 200, cambiable_hasta: null, telefono: null }));
    expect(await atenderReserva({ ...RESERVA, telefono_sellado: "roto" }, n)).toEqual({ cambiable_hasta: null });
    expect(n.p.evaluate.mock.calls.at(-1)[1].reservar.telefono).toBeNull();
    expect(await atenderReserva({ ...RESERVA, sesion_cifrada: "roto" }, navegador(() => ({})))).toEqual({ fallo: "sesion_caducada" });
  });
});

describe("unaVuelta: primero las reservas", () => {
  it("si hay una reserva, la atiende y la cierra; no toma encargos", async () => {
    const n = navegador(() => ({ paso: "reservado", status: 200, cambiable_hasta: null, telefono: 200 }));
    const api = { tomarReserva: vi.fn(async () => RESERVA), tomar: vi.fn(async () => null), cerrar: vi.fn(async () => {}) };
    expect(await unaVuelta({ api, log: () => {}, ...n })).toBe(true);
    expect(api.tomar).not.toHaveBeenCalled();
    expect(api.cerrar).toHaveBeenCalledWith("e1", { cambiable_hasta: null });
  });

  it("sin reservas, el encargo de siempre", async () => {
    const api = { tomarReserva: vi.fn(async () => null), tomar: vi.fn(async () => null), cerrar: vi.fn() };
    expect(await unaVuelta({ api, log: () => {}, ...navegador(() => ({})) })).toBe(false);
    expect(api.tomar).toHaveBeenCalled();
  });
});
