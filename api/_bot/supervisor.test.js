import { describe, it, expect } from "vitest";
import { supervisar } from "./supervisor.js";

describe("supervisor: lo que quita protección necesita a la persona", () => {
  it("quitar una alergia: sí con un «sí», no con una duda", () => {
    const args = { persona: "Leo", alergenos: ["huevos"], quitar: true, confirmado: true };
    expect(supervisar("ajustar_alergias", args, "Sí")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "vale, quítalo")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "quítale el huevo a Leo, ya lo tolera")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "¿y si probamos a darle huevo?")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "el pediatra dice que igual lo supera")).toMatch(/No se ha guardado/);
  });

  it("«nadie tiene alergias»: dicho o confirmado", () => {
    const args = { ninguna: true, confirmado: true };
    expect(supervisar("ajustar_alergias", args, "no, nadie tiene alergias")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "sí, confirmo")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "somos cuatro, dos adultos y dos niños")).toMatch(/No se ha guardado/);
  });

  it("lo que parece un sí y no lo es", () => {
    const args = { persona: "Leo", alergenos: ["huevos"], quitar: true, confirmado: true };
    expect(supervisar("ajustar_alergias", args, "si le damos huevo, ¿qué pasa?")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "Claro que no, sigue siendo alérgico")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "Vale, pero no quites nada todavía")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", { ninguna: true, confirmado: true }, "no hay manera de que coma huevo")).toMatch(/No se ha guardado/);
  });

  it("y los síes de verdad, escritos de cualquier manera", () => {
    const args = { persona: "Leo", alergenos: ["huevos"], quitar: true, confirmado: true };
    expect(supervisar("ajustar_alergias", args, "si")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "¡Sí!")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "[Ana]: sí, quítalo")).toBe(null);
    expect(supervisar("ajustar_alergias", { ninguna: true, confirmado: true }, "No, no tiene alergias nadie")).toBe(null);
    expect(supervisar("ajustar_alergias", { ninguna: true, confirmado: true }, "no hay alergias en casa")).toBe(null);
  });

  it("apuntar una alergia no se frena (añade protección)", () => {
    expect(supervisar("ajustar_alergias", { persona: "Leo", alergenos: ["huevos"], confirmado: true }, "Leo es alérgico al huevo")).toBe(null);
  });

  it("quitar a alguien: si lo pide con su nombre, o con un sí", () => {
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "quita a Leo, ya no come aquí")).toBe(null);
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "sí")).toBe(null);
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "Leo esta semana está de campamentos")).toMatch(/No se ha quitado/);
    expect(supervisar("quitar_comensal", { nombre: "Isa" }, "quita a Leo")).toMatch(/No se ha quitado/);
  });

  it("lo demás pasa sin mirar", () => {
    expect(supervisar("cambiar_plato", { dia: "jueves" }, "")).toBe(null);
  });
});
