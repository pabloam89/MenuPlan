import { describe, it, expect } from "vitest";
import { menuPorActivar } from "./activarSolo.js";

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
