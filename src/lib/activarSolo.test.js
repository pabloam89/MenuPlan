import { describe, it, expect } from "vitest";
import { menuPorActivar, devolucionAlActivar } from "./activarSolo.js";
import { reconcileMenusRemoval } from "./pantryDeltas.js";

const casa = (menu) => ({ activeMenuId: "m1", menus: { m1: menu } });
const listo = { conCuenta: true, soloLectura: false, nubeLista: true };

describe("el menú se activa solo", () => {
  it("un menú nuevo sin activar se activa en cuanto la casa ha llegado de la nube", () => {
    expect(menuPorActivar({ ...listo, data: casa({ id: "m1", activatedAt: null }) })).toBe("m1");
  });

  it("uno ya activado no se vuelve a activar (descontaría dos veces)", () => {
    expect(menuPorActivar({ ...listo, data: casa({ id: "m1", activatedAt: 123 }) })).toBeNull();
  });

  it("con la copia local, antes de que llegue la nube, espera", () => {
    expect(menuPorActivar({ ...listo, nubeLista: false, data: casa({ id: "m1", activatedAt: null }) })).toBeNull();
  });

  it("ni sin cuenta (el invitado nace activado) ni en una casa de solo lectura", () => {
    expect(menuPorActivar({ ...listo, conCuenta: false, data: casa({ id: "m1", activatedAt: null }) })).toBeNull();
    expect(menuPorActivar({ ...listo, soloLectura: true, data: casa({ id: "m1", activatedAt: null }) })).toBeNull();
  });

  it("sin menú activo, o con un id que no está entre los menús, nada", () => {
    expect(menuPorActivar({ ...listo, data: { activeMenuId: null, menus: {} } })).toBeNull();
    expect(menuPorActivar({ ...listo, data: { activeMenuId: "m9", menus: {} } })).toBeNull();
  });
});

describe("lo que se devuelve a la despensa al activar", () => {
  // Un menú anterior activado: lo que descontó al generar y al cocinar un plato.
  const arroz = { name: "Arroz", normalized: "arroz", qty: 200, unit: "g" };
  const leche = { name: "Leche", normalized: "leche", qty: 1, unit: "l" };
  const casa = {
    pantryGenDeltas: { "2026-10-26": { menuId: "viejo", deltas: [leche] } },
    pantryDayDeltas: {},
    cookedDeltas: { "viejo:lun:comida:0": [arroz] },
  };

  it("solo: vuelve lo previsto al generar, no lo cocinado (ya se comió), y el menú viejo deja de descontar", () => {
    const r = devolucionAlActivar(casa, ["viejo"], { automatica: true, reconcile: reconcileMenusRemoval });
    expect(r.deltas).toEqual([leche]);
    expect(r.genOut).toEqual({});
    expect(r.cookedOut).toEqual({});
  });

  it("a mano (el rayo) sigue devolviendo todo lo de los otros menús, como antes", () => {
    const r = devolucionAlActivar(casa, ["viejo"], { automatica: false, reconcile: reconcileMenusRemoval });
    expect(r.deltas).toHaveLength(2);
    expect(r.cookedOut).toEqual({});
  });
});

describe("un menú desactivado a mano", () => {
  it("no se vuelve a activar solo", () => {
    expect(menuPorActivar({ ...listo, data: casa({ id: "m1", activatedAt: null, desactivadoAt: 123 }) })).toBeNull();
  });
});
