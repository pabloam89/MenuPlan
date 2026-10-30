/**
 * El estado de cada dato de la ficha (ficha_casa v2, 0107), leído en un solo
 * sitio para Lola y el asistente de la app (plan fichas con estado, trozo 9).
 */
import { describe, it, expect } from "vitest";
import { estadosDeFichas, marcasDeLola } from "./estadoDeDato.js";
import { ESTADOS_DATO, ESTADO_DE_ORIGEN, ORIGEN_DATO } from "./vocabularios.js";

const persona = (id) => ({ tipo: "persona", id });
const CASA = { tipo: "casa", id: null };
// Un dato como lo devuelve la v2: sin sobre vigente, vacío y sin origen.
const vacio = (campo, sujeto, extra = {}) => ({ campo, sujeto, estado: "vacio", valor: null, origen: null, bloqueado: false, caduca_at: null, ...extra });
const conSobre = (campo, sujeto, origen, valor, extra = {}) => ({ campo, sujeto, estado: ESTADO_DE_ORIGEN[origen], valor, origen, bloqueado: false, caduca_at: null, ...extra });
const de = (estados, campo, personaId = null) => [...estados.values()].find((l) => l.campo === campo && l.personaId === personaId) ?? null;

describe("estadosDeFichas: lee las «fichas» de la v2 y comprueba que cuadran con el vocabulario", () => {
  it("cada dato, por (campo, persona); los de la casa, sin persona", () => {
    const estados = estadosDeFichas({
      persona: [conSobre("colegio", persona("l"), "dicho", "El Pilar"), vacio("alergias", persona("l"))],
      casa: [conSobre("etapaBebe", CASA, "supuesto", "cremas")],
    });
    expect(de(estados, "colegio", "l")).toMatchObject({ estado: "dicho", conSobre: true, valor: "El Pilar", ficha: "persona" });
    expect(de(estados, "alergias", "l")).toMatchObject({ estado: "vacio", conSobre: false });
    expect(de(estados, "etapaBebe")).toMatchObject({ estado: "supuesto", personaId: null });
    expect(estados.size).toBe(3);
  });

  it("todo origen del sobre se lee con el estado que le da ESTADO_DE_ORIGEN", () => {
    for (const origen of ORIGEN_DATO) {
      const estados = estadosDeFichas({ persona: [conSobre("sexo", persona("p"), origen, "mujer")] });
      expect(ESTADOS_DATO).toContain(de(estados, "sexo", "p").estado);
    }
  });

  it("un estado fuera de ESTADOS_DATO falla en alto", () => {
    expect(() => estadosDeFichas({ persona: [vacio("sexo", persona("p"), { estado: "caducado" })] })).toThrow(/ESTADOS_DATO/);
  });

  it("un origen con otro estado del que pide ESTADO_DE_ORIGEN falla en alto (la base y el código no dicen lo mismo)", () => {
    expect(() => estadosDeFichas({ persona: [conSobre("sexo", persona("p"), "visto", "mujer", { estado: "dicho" })] })).toThrow(/ESTADO_DE_ORIGEN/);
  });

  it("unas «fichas» que no son un objeto de listas fallan en alto", () => {
    expect(() => estadosDeFichas([])).toThrow(/objeto/);
    expect(() => estadosDeFichas({ persona: {} })).toThrow(/lista/);
    expect(() => estadosDeFichas({ persona: [{ estado: "vacio" }] })).toThrow(/sin campo/);
  });
});

describe("marcasDeLola: lo que solo vive en el sobre, con su marca", () => {
  it("dicho va a «dicho»; supuesto y aprendido, a «supuesto»; lo vacío, lo por defecto y lo que vive en el documento, nada", () => {
    const estados = estadosDeFichas({ persona: [
      conSobre("colegio", persona("l"), "dicho", "El Pilar"),
      conSobre("patronSemanas", persona("l"), "visto", "alternas"),
      conSobre("sexo", persona("m"), "supuesto", "mujer"),
      conSobre("sexo", persona("p"), "por_defecto", "hombre"),
      vacio("colegio", persona("v")),
      // Las alergias viven en el documento (y en persona_alergia): la ficha las dice en SEGURIDAD, no aquí.
      conSobre("alergias", persona("p"), "dicho", []),
    ] });
    expect(marcasDeLola(estados)).toEqual([
      { marca: "dicho", campo: "colegio", personaId: "l", valor: "El Pilar" },
      { marca: "supuesto", campo: "patronSemanas", personaId: "l", valor: "alternas" },
      { marca: "supuesto", campo: "sexo", personaId: "m", valor: "mujer" },
    ]);
  });

  it("sin estados (v1), nada", () => {
    expect(marcasDeLola(null)).toEqual([]);
  });
});
