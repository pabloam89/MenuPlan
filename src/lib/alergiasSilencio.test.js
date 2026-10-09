import { describe, it, expect } from "vitest";
import {
  alergiasParaMenu, aplicarAlergias, marcarRevisadas, marcarPorSilencio, alergiasPorSilencio,
  conRecordatorioDeSilencio, pendientesDeAlergias,
} from "./alergias.js";
import { ORIGEN_ALERGIAS, VOCABULARIOS } from "./vocabularios.js";

/**
 * «Por silencio» (#229, Pablo 9 oct 2026): Lola pregunta por alergias avisando
 * («si no me dices nada, entiendo que ninguna») y no contestan a eso. Cuenta
 * como «ninguna» para el MENÚ, pero queda marcado como no confirmado.
 */
const casa = () => ({
  members: [
    { id: "a", name: "Ana", allergies: [], alergiasRevisadas: false },
    { id: "b", name: "Pablo", allergies: [], alergiasRevisadas: false },
    { id: "c", name: "Leo", allergies: ["Huevos"], alergiasRevisadas: true },
  ],
  allergiesReviewed: false,
});

describe("el vocabulario del origen", () => {
  it("es cerrado y está en VOCABULARIOS", () => {
    expect(ORIGEN_ALERGIAS).toEqual(["dicha", "por_silencio"]);
    expect(VOCABULARIOS.origen_alergias).toBe(ORIGEN_ALERGIAS);
  });
});

describe("marcarPorSilencio", () => {
  it("marca a los sin revisar como revisados POR SILENCIO y el menú deja de esquivar los 14", () => {
    const antes = casa();
    expect(alergiasParaMenu(antes, antes.members[0])).toHaveLength(14);
    const { data, ids } = marcarPorSilencio(antes);
    expect(ids).toEqual(["a", "b"]);
    expect(data.members.map((m) => m.alergiasOrigen ?? null)).toEqual(["por_silencio", "por_silencio", null]);
    expect(data.allergiesReviewed).toBe(true);
    expect(pendientesDeAlergias(data)).toEqual([]);
    expect(alergiasParaMenu(data, data.members[0])).toEqual([]);
    expect(alergiasPorSilencio(data, data.members[0])).toBe(true);
    // Leo ya estaba dicho: no se toca.
    expect(alergiasPorSilencio(data, data.members[2])).toBe(false);
    expect(alergiasParaMenu(data, data.members[2])).toEqual(["Huevos"]);
  });

  it("sin nadie pendiente no cambia nada (mismo objeto)", () => {
    const d = marcarRevisadas(casa(), null);
    const r = marcarPorSilencio(d);
    expect(r.ids).toEqual([]);
    expect(r.data).toBe(d);
  });

  it("una alergia dicha después gana y quita la marca de silencio", () => {
    const { data } = marcarPorSilencio(casa());
    const r = aplicarAlergias(data, { memberId: "a", ids: ["gluten"], confirmado: true });
    const ana = r.data.members[0];
    expect(ana.allergies).toEqual(["Gluten"]);
    expect(ana.alergiasOrigen).toBeUndefined();
    expect(alergiasPorSilencio(r.data, ana)).toBe(false);
    expect(alergiasParaMenu(r.data, ana)).toEqual(["Gluten"]);
    // Pablo sigue por silencio.
    expect(alergiasPorSilencio(r.data, r.data.members[1])).toBe(true);
  });

  it("un «nadie tiene» dicho después lo deja como dicho", () => {
    const { data } = marcarPorSilencio(casa());
    const d = marcarRevisadas(data, ["b"]);
    expect(d.members[1].alergiasOrigen).toBeUndefined();
    expect(d.members[0].alergiasOrigen).toBe("por_silencio");
  });
});

describe("el recordatorio del primer menú", () => {
  it("sale una vez y no dos", () => {
    const { data } = marcarPorSilencio(casa());
    const r1 = conRecordatorioDeSilencio(data);
    expect(r1.recordar).toBe(true);
    const r2 = conRecordatorioDeSilencio(r1.data);
    expect(r2.recordar).toBe(false);
    expect(r2.data).toBe(r1.data);
  });

  it("sin nadie por silencio no sale", () => {
    const d = marcarRevisadas(casa(), null);
    expect(conRecordatorioDeSilencio(d).recordar).toBe(false);
  });
});
