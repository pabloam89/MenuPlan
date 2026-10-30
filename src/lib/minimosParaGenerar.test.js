import { describe, it, expect } from "vitest";
import { minimosQueFaltan, MINIMO } from "./minimosParaGenerar.js";
import { DATOS_PERSONA } from "./registroFicha.js";

const casa = (members, extra = {}) => ({ members, groups: [{ id: "g1", memberIds: members.map((m) => m.id) }], ...extra });

describe("mínimos para generar: sin alergias dichas (o por silencio) no se genera (decisión B, 30 oct 2026)", () => {
  it("con alguien sin revisar, falta «alergias» y se nombra a quién", () => {
    const d = casa([
      { id: "a", name: "Ana", allergies: [], alergiasRevisadas: true },
      { id: "b", name: "Leo", allergies: [] },
      { id: "c", name: "Mar", allergies: ["Huevos"], alergiasRevisadas: false },
    ]);
    expect(minimosQueFaltan(d)).toEqual([{ minimo: MINIMO.alergias, personas: ["Leo", "Mar"] }]);
  });

  it("con todos revisados no falta nada, aunque alguien tenga alergias", () => {
    const d = casa([
      { id: "a", name: "Ana", allergies: ["Gluten"], alergiasRevisadas: true },
      { id: "b", name: "Leo", allergies: [], alergiasRevisadas: true },
    ]);
    expect(minimosQueFaltan(d)).toEqual([]);
  });

  it("la marca antigua de la casa entera (allergiesReviewed) también vale", () => {
    expect(minimosQueFaltan(casa([{ id: "a", name: "Ana", allergies: [] }], { allergiesReviewed: true }))).toEqual([]);
  });

  it("una persona sin nombre no deja la lista vacía ni rompe", () => {
    expect(minimosQueFaltan(casa([{ id: "x", allergies: [] }]))).toEqual([{ minimo: MINIMO.alergias, personas: ["alguien de la casa"] }]);
  });

  it("sin personas no falta «alergias»: eso lo exige quien pide gente", () => {
    expect(minimosQueFaltan(casa([]))).toEqual([]);
  });

  it("lo que se mira aquí es un mínimo del registro de la ficha, por su misma clave", () => {
    // Una sola fuente de «qué es mínimo»: el registro (minimo_para_generar). Esto solo elige cuál mira.
    expect(MINIMO.alergias).toBe("members.allergies");
    expect(DATOS_PERSONA.allergies.minimo_para_generar).toBe(true);
  });

  it("los mínimos son una lista cerrada y cada uno sale de minimosQueFaltan", () => {
    expect(Object.keys(MINIMO)).toEqual(["alergias"]);
    const faltan = minimosQueFaltan(casa([{ id: "x", name: "Leo" }])).map((f) => f.minimo);
    expect(faltan).toEqual(Object.values(MINIMO));
  });
});
