import { describe, it, expect } from "vitest";
import { menuActivoDe } from "./menuActivo.js";

describe("menuActivoDe: manda user_menus.is_active, data.activeMenuId es caché", () => {
  it("si la tabla tiene uno activo, gana aunque la caché diga otro", () => {
    const filas = [{ id: "viejo", isActive: false }, { id: "nuevo", isActive: true }];
    expect(menuActivoDe(filas, "viejo")).toBe("nuevo");
  });

  it("acepta filas crudas de la tabla (is_active)", () => {
    expect(menuActivoDe([{ id: "a", is_active: true }], "b")).toBe("a");
  });

  it("si la tabla no tiene ninguno activo, se queda la caché (menú recién generado sin subir)", () => {
    expect(menuActivoDe([{ id: "a", isActive: false }], "local")).toBe("local");
  });

  it("sin tabla ni caché, ninguno", () => {
    expect(menuActivoDe(null, null)).toBeNull();
    expect(menuActivoDe([], undefined)).toBeNull();
  });
});
