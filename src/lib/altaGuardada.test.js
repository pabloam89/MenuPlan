import { describe, it, expect, vi } from "vitest";
import { cerrarAlta, MOTIVO, MOTIVOS_NO_GUARDADO } from "./altaGuardada.js";

const casa = () => ({
  members: [
    { id: "a", name: "Ana", allergies: ["Gluten"], alergiasRevisadas: false },
    { id: "b", name: "Leo", allergies: [] },
  ],
  allergiesReviewed: false,
});

describe("cerrarAlta: la marca de alergias se guarda al momento y Lola se entera después", () => {
  it("guarda con todas las personas revisadas y avisa SOLO cuando el guardado ha ido bien", async () => {
    const orden = [];
    const guardar = vi.fn(async () => { orden.push("guardar"); return { ok: true, botRev: 7 }; });
    const avisar = vi.fn(async () => { orden.push("avisar"); return true; });
    const r = await cerrarAlta({ data: casa(), guardar, avisar });
    expect(r).toMatchObject({ ok: true, motivo: null, avisado: true });
    // Lo que se guarda lleva la marca en cada persona y en el resumen de la casa.
    const guardado = guardar.mock.calls[0][0];
    expect(guardado.members.map((m) => m.alergiasRevisadas)).toEqual([true, true]);
    expect(guardado.allergiesReviewed).toBe(true);
    // El aviso sale DESPUÉS de que la base conteste, nunca a la vez.
    expect(orden).toEqual(["guardar", "avisar"]);
  });

  it("si la base dice que chocó con otro cambio, no avisa y lo dice (choque)", async () => {
    const avisar = vi.fn(async () => true);
    const r = await cerrarAlta({ data: casa(), guardar: async () => ({ ok: false, conflict: true, botRev: 9 }), avisar });
    expect(r).toMatchObject({ ok: false, motivo: MOTIVO.choque, avisado: false });
    expect(avisar).not.toHaveBeenCalled();
  });

  it("un guardado descartado (la nube se recargó entretanto) tampoco avisa", async () => {
    const r = await cerrarAlta({ data: casa(), guardar: async () => ({ ok: false, descartado: true }), avisar: async () => true });
    expect(r).toMatchObject({ ok: false, motivo: MOTIVO.descartado, avisado: false });
  });

  it("si guardar falla (sin red) no se traga el error: motivo error y sin aviso", async () => {
    const avisar = vi.fn(async () => true);
    const r = await cerrarAlta({ data: casa(), guardar: async () => { throw new Error("fetch failed"); }, avisar });
    expect(r).toMatchObject({ ok: false, motivo: MOTIVO.error, avisado: false });
    expect(avisar).not.toHaveBeenCalled();
  });

  it("si el aviso a Lola no llega, el alta sigue hecha y se sabe que no se avisó", async () => {
    const r = await cerrarAlta({ data: casa(), guardar: async () => ({ ok: true }), avisar: async () => false });
    expect(r).toMatchObject({ ok: true, avisado: false });
  });

  it("sin avisar (alta que no viene de Lola) guarda igual", async () => {
    const r = await cerrarAlta({ data: casa(), guardar: async () => ({ ok: true }) });
    expect(r).toMatchObject({ ok: true, avisado: false });
  });

  it("los motivos son una lista cerrada y cada uno sale de cerrarAlta", async () => {
    expect(MOTIVOS_NO_GUARDADO).toEqual(Object.values(MOTIVO));
    const motivos = await Promise.all([
      cerrarAlta({ data: casa(), guardar: async () => ({ ok: false, conflict: true }) }),
      cerrarAlta({ data: casa(), guardar: async () => ({ ok: false, descartado: true }) }),
      cerrarAlta({ data: casa(), guardar: async () => ({ ok: false }) }),
    ]);
    expect(motivos.map((r) => r.motivo)).toEqual(MOTIVOS_NO_GUARDADO);
  });
});
