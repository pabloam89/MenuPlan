import { describe, it, expect } from "vitest";
import { minimosQueFaltan, sePuedeGenerar, MINIMO, MINIMOS_PARA_GENERAR } from "./minimosParaGenerar.js";

const casa = (members, extra = {}) => ({ members, groups: [{ id: "g1", memberIds: members.map((m) => m.id) }], ...extra });

describe("mínimos para generar: sin alergias dichas (o por silencio) no se genera (decisión B, 30 oct 2026)", () => {
  it("con alguien sin revisar, falta «alergias» y se nombra a quién", () => {
    const d = casa([
      { id: "a", name: "Ana", allergies: [], alergiasRevisadas: true },
      { id: "b", name: "Leo", allergies: [] },
      { id: "c", name: "Mar", allergies: ["Huevos"], alergiasRevisadas: false },
    ]);
    expect(minimosQueFaltan(d)).toEqual([{ minimo: MINIMO.alergias, personas: ["Leo", "Mar"] }]);
    expect(sePuedeGenerar(d)).toBe(false);
  });

  it("con todos revisados se puede generar, aunque alguien tenga alergias", () => {
    const d = casa([
      { id: "a", name: "Ana", allergies: ["Gluten"], alergiasRevisadas: true },
      { id: "b", name: "Leo", allergies: [], alergiasRevisadas: true },
    ]);
    expect(minimosQueFaltan(d)).toEqual([]);
    expect(sePuedeGenerar(d)).toBe(true);
  });

  it("la marca antigua de la casa entera (allergiesReviewed) también vale", () => {
    const d = casa([{ id: "a", name: "Ana", allergies: [] }], { allergiesReviewed: true });
    expect(sePuedeGenerar(d)).toBe(true);
  });

  it("una persona sin nombre no deja la lista vacía ni rompe", () => {
    expect(minimosQueFaltan(casa([{ id: "x", allergies: [] }]))).toEqual([{ minimo: "alergias", personas: ["alguien de la casa"] }]);
  });

  it("sin personas no falta «alergias»: eso lo exige quien pide gente", () => {
    expect(minimosQueFaltan(casa([]))).toEqual([]);
  });

  it("los mínimos son una lista cerrada", () => {
    expect(MINIMOS_PARA_GENERAR).toEqual(Object.values(MINIMO));
    expect(MINIMOS_PARA_GENERAR).toEqual(["alergias"]);
  });
});
