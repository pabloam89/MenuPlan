import { describe, expect, it } from "vitest";
import { esFranja, esPedido, partesDeFranja, precioDeFranja, textoDeFranja } from "./mercadonaFranja.js";
import { momentoDeCasa } from "./dias.js";

// Como las da Mercadona: en UTC (pedido.md, «Franjas»). Datos inventados.
const INVIERNO = { id: "f1", start: "2026-11-12T14:00:00Z", end: "2026-11-12T15:00:00Z", price: "7.21" };
const VERANO = { id: "f2", start: "2026-07-01T14:00:00Z", end: "2026-07-01T15:00:00Z", price: 0 };

describe("en la hora de la casa", () => {
  it("noviembre va a UTC+1 y julio a UTC+2, sin echar la cuenta a mano", () => {
    expect(momentoDeCasa(INVIERNO.start)).toEqual({ iso: "2026-11-12", dia: "Jue", hora: "15:00" });
    expect(momentoDeCasa(VERANO.start)).toEqual({ iso: "2026-07-01", dia: "Mié", hora: "16:00" });
  });

  it("la medianoche de UTC ya es el día siguiente en Madrid", () => {
    expect(momentoDeCasa("2026-11-12T23:30:00Z")).toMatchObject({ iso: "2026-11-13", hora: "00:30" });
  });

  it("lo que no es una fecha, null", () => {
    expect(momentoDeCasa("mañana")).toBeNull();
  });
});

describe("cómo se dice una franja", () => {
  it("día, horas y precio; la que no cuesta, gratis", () => {
    expect(partesDeFranja(INVIERNO)).toEqual({ dia: "jueves 12 nov", horas: "15:00–16:00", precio: "7,21 €" });
    expect(textoDeFranja(VERANO)).toBe("miércoles 1 jul, 16:00–17:00 · gratis");
  });

  it("sin precio que se lea, sin precio; sin fechas, nada", () => {
    expect(textoDeFranja({ ...INVIERNO, price: null })).toBe("jueves 12 nov, 15:00–16:00");
    expect(precioDeFranja({ price: "7,21" })).toBe(7.21);
    expect(textoDeFranja({ id: "x" })).toBe("");
  });
});

describe("la forma que guarda la 0134", () => {
  it("una franja: id y dos fechas en orden", () => {
    expect(esFranja(INVIERNO)).toBe(true);
    for (const f of [null, [], { ...INVIERNO, id: "" }, { ...INVIERNO, end: INVIERNO.start }, { ...INVIERNO, start: "mañana" }]) expect(esFranja(f)).toBe(false);
  });

  it("un pedido: su id, su total y de una a cuatro franjas", () => {
    expect(esPedido({ pedido_xid: "p", total: 64.1, franjas: [INVIERNO] })).toBe(true);
    expect(esPedido({ pedido_xid: "p", total: null, franjas: [INVIERNO, VERANO] })).toBe(true);
    expect(esPedido({ pedido_xid: "p", total: 64.1, franjas: [] })).toBe(false);
    expect(esPedido({ pedido_xid: "p", total: 64.1, franjas: Array(5).fill(INVIERNO) })).toBe(false);
    expect(esPedido({ pedido_xid: "", total: 1, franjas: [INVIERNO] })).toBe(false);
  });
});
