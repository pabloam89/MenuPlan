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

  it("con dos activos, el de updated_at más reciente, como casa.js (order=updated_at.desc)", () => {
    const filas = [
      { id: "viejo", isActive: true, updatedAt: Date.parse("2026-10-01T10:00:00Z") },
      { id: "nuevo", is_active: true, updated_at: "2026-10-05T10:00:00Z" },
      { id: "medio", isActive: true, updatedAt: Date.parse("2026-10-03T10:00:00Z") },
    ];
    expect(menuActivoDe(filas, "viejo")).toBe("nuevo");
  });

  it("sin tabla ni caché, ninguno", () => {
    expect(menuActivoDe(null, null)).toBeNull();
    expect(menuActivoDe([], undefined)).toBeNull();
  });
});
