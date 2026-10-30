/**
 * El estado de cada dato de la ficha (ficha_casa v2, 0107), leído en un solo
 * sitio para Lola y el asistente de la app (plan fichas con estado, trozo 9).
 */
import { describe, it, expect } from "vitest";
import { estadosDeFichas, leidoDe, estadoParaLibreta, marcasDeLola } from "./estadoDeDato.js";
import { ESTADOS_DATO, ESTADO_DE_ORIGEN, ORIGEN_DATO } from "./vocabularios.js";
import { ESTADOS as ESTADOS_LIBRETA } from "./notepad.js";

const AHORA = new Date("2026-10-30T10:00:00Z");

const persona = (id) => ({ tipo: "persona", id });
const CASA = { tipo: "casa", id: null };
// Un dato como lo devuelve la v2: sin sobre vigente, vacío y sin origen.
const vacio = (campo, sujeto, extra = {}) => ({ campo, sujeto, estado: "vacio", valor: null, origen: null, bloqueado: false, caduca_at: null, ...extra });
const conSobre = (campo, sujeto, origen, valor, extra = {}) => ({ campo, sujeto, estado: ESTADO_DE_ORIGEN[origen], valor, origen, bloqueado: false, caduca_at: null, ...extra });

describe("estadosDeFichas: lee las «fichas» de la v2 y comprueba que cuadran con el vocabulario", () => {
  it("cada dato, por (campo, persona); los de la casa, sin persona", () => {
    const estados = estadosDeFichas({
      persona: [conSobre("colegio", persona("l"), "dicho", "El Pilar"), vacio("alergias", persona("l"))],
      casa: [conSobre("etapaBebe", CASA, "supuesto", "cremas")],
    });
    expect(leidoDe(estados, "colegio", "l")).toMatchObject({ estado: "dicho", conSobre: true, valor: "El Pilar", ficha: "persona" });
    expect(leidoDe(estados, "alergias", "l")).toMatchObject({ estado: "vacio", conSobre: false });
    expect(leidoDe(estados, "etapaBebe")).toMatchObject({ estado: "supuesto", personaId: null });
    expect(estados.size).toBe(3);
  });

  it("todo origen del sobre se lee con el estado que le da ESTADO_DE_ORIGEN", () => {
    for (const origen of ORIGEN_DATO) {
      const estados = estadosDeFichas({ persona: [conSobre("sexo", persona("p"), origen, "mujer")] });
      expect(ESTADOS_DATO).toContain(leidoDe(estados, "sexo", "p").estado);
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

describe("caducado: el sobre vencido se ve, aunque el estado sea vacío", () => {
  it("vacío (sin origen) con un caduca_at ya pasado; uno vigente o sin sobre, no", () => {
    const estados = estadosDeFichas({ persona: [
      vacio("colegio", persona("a"), { caduca_at: "2026-10-29T00:00:00Z" }),
      vacio("colegio", persona("b")),
      conSobre("colegio", persona("c"), "dicho", "X", { caduca_at: "2026-11-30T00:00:00Z" }),
    ] }, AHORA);
    expect(["a", "b", "c"].map((id) => leidoDe(estados, "colegio", id).caducado)).toEqual([true, false, false]);
    expect(leidoDe(estados, "colegio", "otra")).toBeNull();
  });
});

describe("estadoParaLibreta: el sobre afina y no borra lo que sabe el documento", () => {
  const leer = (...datos) => [...estadosDeFichas({ persona: datos }, AHORA).values()];

  it("sin ningún sobre, manda el documento: la v2 vacía no deja una alergia dicha sin decir", () => {
    expect(estadoParaLibreta(leer(vacio("alergias", persona("p")), vacio("alergias", persona("m"))), "fijado")).toBe("fijado");
    expect(estadoParaLibreta([], "fijado")).toBe("fijado");
    expect(estadoParaLibreta([null, null], "vacio")).toBe("vacio");
  });

  it("con sobre, cada estado de la ficha cae en uno de los de la libreta", () => {
    for (const origen of ORIGEN_DATO) {
      expect(ESTADOS_LIBRETA).toContain(estadoParaLibreta(leer(conSobre("alergias", persona("p"), origen, [])), "fijado"));
    }
  });

  it("dicho es fijado; supuesto y aprendido, inferido; delegado, delegado; bloqueado, fijado", () => {
    const uno = (origen, extra) => estadoParaLibreta(leer(conSobre("alergias", persona("p"), origen, [], extra)), "vacio");
    expect(uno("dicho")).toBe("fijado");
    expect(uno("supuesto")).toBe("inferido");
    expect(uno("visto")).toBe("inferido");
    expect(uno("delegado")).toBe("delegado");
    expect(uno("supuesto", { bloqueado: true })).toBe("fijado");
  });

  it("manda el más débil: una persona con la alergia supuesta deja el dato en inferido aunque el documento lo dé por contestado", () => {
    const leidos = leer(conSobre("alergias", persona("p"), "dicho", []), conSobre("alergias", persona("m"), "supuesto", ["huevos"]));
    expect(estadoParaLibreta(leidos, "fijado")).toBe("inferido");
  });

  it("si el documento no lo sabe y alguna persona no tiene sobre, sigue vacío", () => {
    const leidos = leer(conSobre("alergias", persona("p"), "dicho", []), vacio("alergias", persona("m")));
    expect(estadoParaLibreta(leidos, "vacio")).toBe("vacio");
  });

  it("un sobre caducado deja lo del documento como mucho en inferido: hay que confirmar si sigue", () => {
    const caducado = leer(vacio("alergias", persona("p"), { caduca_at: "2026-10-01T00:00:00Z" }));
    expect(estadoParaLibreta(caducado, "fijado")).toBe("inferido");
    expect(estadoParaLibreta(caducado, "vacio")).toBe("vacio");
  });

  it("una base que no es de la libreta falla en alto", () => {
    expect(() => estadoParaLibreta([], "dicho")).toThrow(/libreta/);
  });
});
