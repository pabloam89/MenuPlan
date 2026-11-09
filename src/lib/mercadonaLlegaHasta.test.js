// Hasta dónde llega el bot (0133): el orden de los tres pasos, una fila de antes y lo que pide cada paso a la cuenta.
import { describe, expect, it } from "vitest";
import { LLEGA_HASTA_MERCADONA, LLEGA_HASTA, deUnaCuenta, faltaPara, llegaHastaDe, llegaA } from "./mercadonaLlegaHasta.js";

describe("hasta dónde llega el bot en Mercadona", () => {
  it("los tres pasos van en orden: lista, reservar, pagar", () => {
    expect(LLEGA_HASTA_MERCADONA).toEqual(["lista", "reservar", "pagar"]);
    expect(LLEGA_HASTA.PAGAR).toBe("pagar");
  });

  it("cada paso lleva los de antes, y no los de después", () => {
    expect(llegaA("pagar", "reservar")).toBe(true);
    expect(llegaA("pagar", "lista")).toBe(true);
    expect(llegaA("reservar", "reservar")).toBe(true);
    expect(llegaA("reservar", "pagar")).toBe(false);
    expect(llegaA("lista", "reservar")).toBe(false);
  });

  it("sin dato, o con uno que no es de la lista, es `lista`: el bot no pasa del primer paso", () => {
    for (const raro of [null, undefined, "", "todo", "PAGAR"]) {
      expect(llegaHastaDe(raro)).toBe("lista");
      expect(llegaA(raro, "reservar")).toBe(false);
      expect(llegaA(raro, "lista")).toBe(true);
    }
  });
});

describe("lo que le falta a la cuenta para cada paso", () => {
  const TODO = { tiene_direccion: true, tiene_telefono: true, tiene_pago: true };
  it("la lista no pide nada", () => {
    expect(faltaPara({}, "lista")).toEqual([]);
  });
  it("reservar pide dirección y teléfono; pagar, además, medio de pago", () => {
    expect(faltaPara({}, "reservar")).toEqual(["direccion", "telefono"]);
    expect(faltaPara({}, "pagar")).toEqual(["direccion", "telefono", "pago"]);
    expect(faltaPara({ ...TODO, tiene_pago: false }, "reservar")).toEqual([]);
    expect(faltaPara({ ...TODO, tiene_pago: false }, "pagar")).toEqual(["pago"]);
    expect(faltaPara(TODO, "pagar")).toEqual([]);
  });
  it("sin mirar (null) cuenta como falta", () => {
    expect(faltaPara({ ...TODO, tiene_direccion: null }, "reservar")).toEqual(["direccion"]);
  });
});

describe("lo que se dice de una cuenta", () => {
  it("sin revisión, «sin mirar» aunque la fila diga false", () => {
    expect(deUnaCuenta({ revisada_at: null, tiene_direccion: false, tiene_pago: false })).toMatchObject({ tiene_direccion: null, tiene_pago: null });
  });
  it("con revisión, lo que vio el trabajador", () => {
    expect(deUnaCuenta({ revisada_at: "2026-11-08T20:00:00Z", tiene_direccion: true, tiene_pago: false })).toMatchObject({ tiene_direccion: true, tiene_pago: false });
  });
  it("del teléfono solo si está, nunca el sello", () => {
    const r = deUnaCuenta({ telefono_sellado: "{\"v\":1}" });
    expect(r.tiene_telefono).toBe(true);
    expect(JSON.stringify(r)).not.toContain("v\\\":1");
  });
});
