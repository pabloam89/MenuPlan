import { describe, it, expect } from "vitest";
import { pedidoCambiar, pedidoMenu, payloadStart, partirStart, fraseDePedido } from "./pedidoLola.js";

const CODIGO = "AbCdEfGhIjKlMnOpQr-_12"; // 22, como los de verdad (base64url)

describe("pedidoLola", () => {
  it("ida y vuelta: la app escribe, el bot lee la frase", () => {
    const p = pedidoCambiar({ fechaISO: "2026-10-02", franja: "Cena", cual: "principal" });
    expect(p).toBe("c20261002N2");
    const start = payloadStart(CODIGO, p);
    expect(start.length).toBeLessThanOrEqual(64);
    expect(start).toMatch(/^[\w-]+$/);
    expect(partirStart(start)).toEqual({ codigo: CODIGO, pedido: p });
    expect(fraseDePedido(p, "2026-09-30")).toBe("Quiero cambiar la cena del viernes 2 de octubre.");
  });

  it("hoy es «hoy», y lo de después del domingo es de la semana que viene", () => {
    expect(fraseDePedido("c20260930C1", "2026-09-30")).toBe("Quiero cambiar el primero de la comida de hoy.");
    expect(fraseDePedido("c20261005N", "2026-09-30")).toBe("Quiero cambiar la cena del lunes 5 de octubre (la semana que viene).");
  });

  it("sin sesión va solo el pedido; un código a secas sigue siendo un código", () => {
    expect(partirStart(payloadStart(null, pedidoMenu("siguiente")))).toEqual({ codigo: null, pedido: "gs" });
    expect(fraseDePedido("gs")).toBe("Hazme el menú de la semana que viene.");
    expect(partirStart(CODIGO)).toEqual({ codigo: CODIGO, pedido: null });
  });

  it("lo que no es nuestro no se toca (compartir, código del correo)", () => {
    expect(partirStart("rc_abc123")).toBeNull();
    expect(partirStart("c123456")).toBeNull();
    expect(fraseDePedido("zzz")).toBeNull();
    expect(pedidoCambiar({ fechaISO: "2026-10-02", franja: "Almuerzo" })).toBeNull();
  });
});
