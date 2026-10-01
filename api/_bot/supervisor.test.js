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

  it("un «no» o un «nada» a secas también es la respuesta (Pablo, 1 oct 2026)", () => {
    const args = { ninguna: true, confirmado: true };
    expect(supervisar("ajustar_alergias", args, "Nada nada, feel free")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "no")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "No, tranquila")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "nada que yo sepa")).toBe(null);
    // Con algo más dentro, ya no es un «no» a secas.
    expect(supervisar("ajustar_alergias", args, "no hay manera de que coma huevo")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "nada de marisco para Leo")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "no sé, déjame preguntar")).toMatch(/No se ha guardado/);
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

  it("lo que llega en audio se mira igual (sin el «[nota de voz]» que se le pone a Lola)", () => {
    expect(supervisar("ajustar_alergias", { ninguna: true, confirmado: true }, "[nota de voz] Nada nada, feel free")).toBe(null);
    expect(supervisar("ajustar_alergias", { persona: "Leo", alergenos: ["huevos"], quitar: true, confirmado: true }, "[nota de voz] Sí")).toBe(null);
  });

  it("lo demás pasa sin mirar", () => {
    expect(supervisar("cambiar_plato", { dia: "jueves" }, "")).toBe(null);
  });
});
