import { describe, expect, it } from "vitest";
import { esHoraEntrega, esPedido, partesDeHoraEntrega, precioDeHoraEntrega, textoDeHoraEntrega } from "./mercadonaHoraEntrega.js";
import { momentoDeCasa } from "./dias.js";

// Como las da Mercadona: en UTC (pedido.md, «Horas de entrega»). Datos inventados.
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

describe("cómo se dice una hora_entrega", () => {
  it("día, horas y precio; la que no cuesta, gratis", () => {
    expect(partesDeHoraEntrega(INVIERNO)).toEqual({ dia: "jueves 12 nov", horas: "15:00–16:00", precio: "7,21 €" });
    expect(textoDeHoraEntrega(VERANO)).toBe("miércoles 1 jul, 16:00–17:00 · gratis");
  });

  it("sin precio que se lea, sin precio; sin fechas, nada", () => {
    expect(textoDeHoraEntrega({ ...INVIERNO, price: null })).toBe("jueves 12 nov, 15:00–16:00");
    expect(precioDeHoraEntrega({ price: "7,21" })).toBe(7.21);
    expect(textoDeHoraEntrega({ id: "x" })).toBe("");
  });
});

describe("la forma que guarda la 0134", () => {
  it("una hora_entrega: id y dos fechas en orden", () => {
    expect(esHoraEntrega(INVIERNO)).toBe(true);
    for (const f of [null, [], { ...INVIERNO, id: "" }, { ...INVIERNO, end: INVIERNO.start }, { ...INVIERNO, start: "mañana" }]) expect(esHoraEntrega(f)).toBe(false);
  });

  it("un pedido: su id, su total y de una a cuatro horas_entrega", () => {
    expect(esPedido({ pedido_xid: "p", total: 64.1, horas_entrega: [INVIERNO] })).toBe(true);
    expect(esPedido({ pedido_xid: "p", total: null, horas_entrega: [INVIERNO, VERANO] })).toBe(true);
    expect(esPedido({ pedido_xid: "p", total: 64.1, horas_entrega: [] })).toBe(false);
    expect(esPedido({ pedido_xid: "p", total: 64.1, horas_entrega: Array(5).fill(INVIERNO) })).toBe(false);
    expect(esPedido({ pedido_xid: "", total: 1, horas_entrega: [INVIERNO] })).toBe(false);
  });
});
