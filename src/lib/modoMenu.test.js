import { describe, it, expect } from "vitest";
import { usaTablero } from "./modoMenu.js";

const conMenu = (menu) => ({ activeMenuId: "m1", menus: { m1: menu } });

describe("un solo modo de menú", () => {
  it("un menú de Lola (generado, sin origen) se maneja con el tablero", () => {
    expect(usaTablero(conMenu({ id: "m1", weeks: {} }))).toBe(true);
  });

  it("un menú en blanco de la pizarra, también", () => {
    expect(usaTablero(conMenu({ id: "m1", origin: "pizarra", weeks: {} }))).toBe(true);
  });

  it("sin menú activo no hay tablero", () => {
    expect(usaTablero({ activeMenuId: null, menus: {} })).toBe(false);
    expect(usaTablero({ activeMenuId: "otro", menus: { m1: {} } })).toBe(false);
    expect(usaTablero(undefined)).toBe(false);
  });
});
