import { describe, it, expect } from "vitest";
import { aplicarAlergias, pareceAlergia, FAMILIA } from "./alergias.js";

const casa = () => ({
  members: [
    { id: "a", name: "Ana", allergies: ["Gluten"] },
    { id: "b", name: "Leo", allergies: [] },
  ],
});

describe("aplicarAlergias", () => {
  it("sin confirmación no escribe nada", () => {
    const data = casa();
    for (const confirmado of [undefined, false, "true", 1]) {
      const r = aplicarAlergias(data, { memberId: "b", ids: ["huevos"], confirmado });
      expect(r.escrito).toBe(false);
      expect(r.data).toBe(data);
    }
  });

  it("añade con la etiqueta de la app y marca la revisión", () => {
    const r = aplicarAlergias(casa(), { memberId: "b", ids: ["huevos"], confirmado: true });
    expect(r.escrito).toBe(true);
    expect(r.data.members[1].allergies).toEqual(["Huevos"]);
    expect(r.data.allergiesReviewed).toBe(true);
  });

  it("entiende los alias: «frutos secos» es frutos de cáscara", () => {
    const r = aplicarAlergias(casa(), { memberId: "b", ids: ["frutos secos"], confirmado: true });
    expect(r.aplicados).toEqual(["frutos_cascara"]);
    expect(r.data.members[1].allergies).toEqual(["Frutos de cáscara"]);
  });

  it("quitar borra aunque esté guardada con otra forma (id vs etiqueta)", () => {
    const r = aplicarAlergias(casa(), { memberId: "a", ids: ["gluten"], quitar: true, confirmado: true });
    expect(r.data.members[0].allergies).toEqual([]);
  });

  it("no duplica una que ya tiene con otra forma", () => {
    const r = aplicarAlergias(casa(), { memberId: "a", ids: ["gluten"], confirmado: true });
    expect(r.data.members[0].allergies).toEqual(["Gluten"]);
  });

  it("lo que no es uno de los 14 va a ignorados y no se escribe", () => {
    const r = aplicarAlergias(casa(), { memberId: "b", ids: ["coliflor", "leche"], confirmado: true });
    expect(r.ignorados).toEqual(["coliflor"]);
    expect(r.data.members[1].allergies).toEqual(["Leche"]);
  });

  it("si no queda ninguno válido, no escribe", () => {
    const data = casa();
    const r = aplicarAlergias(data, { memberId: "b", ids: ["coliflor"], confirmado: true });
    expect(r.escrito).toBe(false);
    expect(r.data).toBe(data);
  });

  it("FAMILIA aplica a todos", () => {
    const r = aplicarAlergias(casa(), { memberId: FAMILIA, ids: ["soja"], confirmado: true });
    expect(r.data.members.map((m) => m.allergies)).toEqual([["Gluten", "Soja"], ["Soja"]]);
  });

  it("un miembro que no existe no escribe", () => {
    const data = casa();
    const r = aplicarAlergias(data, { memberId: "zz", ids: ["soja"], confirmado: true });
    expect(r.escrito).toBe(false);
    expect(r.data).toBe(data);
  });
});

describe("pareceAlergia (movida desde panelParser)", () => {
  it("detecta las formas habituales, con y sin tildes", () => {
    for (const f of ["soy alérgico a las nueces", "mi hija es celíaca", "intolerante a la lactosa", "sin gluten"]) {
      expect(pareceAlergia(f)).toBe(true);
    }
  });
  it("no salta con preferencias", () => {
    expect(pareceAlergia("menos pescado")).toBe(false);
  });
});
