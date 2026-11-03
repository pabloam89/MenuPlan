import { describe, it, expect, vi, afterEach } from "vitest";
import { sinCompra, conCambio, compraLocal, cambiarCompraLocal, leerCompra, mandarCompra } from "./compraApp.js";
import { DATOS_CASA } from "./registroFicha.js";

const TICKET = { id: "tk_1", store: "Mercadona", purchasedAt: "2026-11-03T10:00:00.000Z", total: 3.5, lineCount: 1, tachedKeys: [], tachedWeekStart: null, pantryIds: [] };
const PRECIO = { id: "tk_1-0", receiptId: "tk_1", ingredientId: "leche", name: "Leche", price: 3.5, source: "receipt", kind: "food", purchasedAt: "2026-11-03T10:00:00.000Z" };
const GASTO = { ...PRECIO, id: "g_1", receiptId: null, source: "manual" };
const movil = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const token = async () => "tok";
const respuesta = (status, cuerpo) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status }));
afterEach(() => vi.restoreAllMocks());

describe("lo gastado vive en sus tablas, no en el documento (trozo 22 de #1037)", () => {
  it("el registro dice dónde vive, y el documento que se guarda ya no lleva tickets ni precios", () => {
    expect(DATOS_CASA.priceObs.vive).toBe("tabla:precio_observado");
    expect(DATOS_CASA.receipts.vive).toBe("tabla:ticket");
    expect(sinCompra({ members: [], priceObs: [PRECIO], receipts: [TICKET], priceAliases: { a: "b" } })).toEqual({ members: [], priceAliases: { a: "b" } });
    const limpio = { members: [] };
    expect(sinCompra(limpio)).toBe(limpio);
  });

  it("un ticket va el primero con sus precios; un precio repetido no se duplica; borrar se lleva sus precios", () => {
    const vacia = { tickets: [], precios: [] };
    const conTicket = conCambio(vacia, { ticket: TICKET, precios: [PRECIO] });
    expect(conTicket).toEqual({ tickets: [TICKET], precios: [PRECIO] });
    const conGasto = conCambio(conTicket, { precios: [GASTO, PRECIO] });
    expect(conGasto.precios.map((p) => p.id)).toEqual(["tk_1-0", "g_1"]);
    expect(conCambio(conGasto, { borrar_ticket: "tk_1" })).toEqual({ tickets: [], precios: [GASTO] });
  });

  it("sin casa, lo guarda el móvil con el mismo cambio", () => {
    const almacen = movil();
    expect(compraLocal(almacen)).toEqual({ tickets: [], precios: [] });
    cambiarCompraLocal({ ticket: TICKET, precios: [PRECIO] }, almacen);
    expect(compraLocal(almacen)).toEqual({ tickets: [TICKET], precios: [PRECIO] });
    cambiarCompraLocal({ borrar_ticket: "tk_1" }, almacen);
    expect(compraLocal(almacen)).toEqual({ tickets: [], precios: [] });
  });
});

describe("la app y las tablas (compraApp.js)", () => {
  it("lee tickets y precios; si no puede, lo dice y no da «nada gastado»", async () => {
    const f = respuesta(200, { tickets: [TICKET], precios: [PRECIO] });
    expect(await leerCompra("c1", { token, fetcher: f })).toEqual({ ok: true, tickets: [TICKET], precios: [PRECIO] });
    expect(f.mock.calls[0][0]).toMatch(/\?casa=c1&compra=1$/);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await leerCompra("c1", { token, fetcher: respuesta(500, { fallo: "servidor" }) })).toMatchObject({ ok: false });
    expect(await leerCompra("c1", { token, fetcher: respuesta(200, {}) })).toMatchObject({ ok: false });
    expect(await leerCompra("c1", { token: async () => null, fetcher: f })).toEqual({ ok: false, fallo: "sin_sesion" });
  });

  it("manda el cambio tal cual; si el servidor no lo guardó, ok: false", async () => {
    const f = respuesta(200, { guardado: true, precios: 1 });
    expect(await mandarCompra("c1", { ticket: TICKET, precios: [PRECIO] }, { token, fetcher: f })).toEqual({ ok: true });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ casa: "c1", compra: { ticket: TICKET, precios: [PRECIO] } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await mandarCompra("c1", { precios: [GASTO] }, { token, fetcher: respuesta(403, { fallo: "sin_permiso" }) })).toMatchObject({ ok: false });
    expect(await mandarCompra("c1", { precios: [GASTO] }, { token, fetcher: respuesta(200, {}) })).toMatchObject({ ok: false });
    expect(await mandarCompra("c1", { precios: [GASTO] }, { token, fetcher: vi.fn(async () => { throw new TypeError("sin red"); }) })).toEqual({ ok: false, fallo: "sin_red" });
  });
});
