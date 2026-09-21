import { describe, expect, it } from "vitest";
import { NUTRIENTES, CAMPOS_NUTRICION, CAMPOS_DUROS, CAMPOS_SECUNDARIOS } from "./nutrientes.js";
import { CONST_CODES } from "../../scripts/lib/ciqualParse.mjs";
import { NUTRIENT_IDS } from "../../scripts/lib/usdaParse.mjs";
import alimentos from "./alimentos.json";

describe("la declaracion de nutrientes", () => {
  it("cada campo declara unidad, nombre por racion y decimales", () => {
    for (const [campo, n] of Object.entries(NUTRIENTES)) {
      expect(["kcal", "g", "mg", "ug"], campo).toContain(n.unidad);
      expect(typeof n.porRacion, campo).toBe("string");
      expect(Number.isInteger(n.decimales), campo).toBe(true);
    }
  });

  it("los nombres por racion no chocan entre si", () => {
    const nombres = CAMPOS_NUTRICION.map((c) => NUTRIENTES[c].porRacion);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it("duros y secundarios parten el total sin solaparse", () => {
    expect(CAMPOS_DUROS.length + CAMPOS_SECUNDARIOS.length).toBe(CAMPOS_NUTRICION.length);
    expect(CAMPOS_DUROS.filter((c) => CAMPOS_SECUNDARIOS.includes(c))).toEqual([]);
  });

  // Los dos parsers tienen que hablar de campos que EXISTEN. Un typo en un mapa
  // de codigos escribiria una propiedad que nadie lee y el hueco parecerìa de
  // la fuente y no del codigo.
  it.each([["CIQUAL", CONST_CODES], ["USDA", NUTRIENT_IDS]])(
    "el parser de %s solo produce campos declarados",
    (_tabla, mapa) => {
      const desconocidos = Object.values(mapa).filter(
        (campo) => campo !== "kj100g" && !CAMPOS_NUTRICION.includes(campo),
      );
      expect(desconocidos).toEqual([]);
    },
  );

  // El sufijo del nombre por racion tiene que decir la MISMA unidad que la
  // declaracion. Es barato y es exactamente la comprobacion que no existia
  // cuando el sodio estuvo en gramos en 30 filas y en miligramos en 292.
  it("el nombre por racion lleva su unidad y coincide", () => {
    const sufijo = { g: "_g", mg: "_mg", ug: "_ug" };
    for (const [campo, n] of Object.entries(NUTRIENTES)) {
      if (n.unidad === "kcal") continue;
      expect(n.porRacion.endsWith(sufijo[n.unidad]), `${campo} → ${n.porRacion} (${n.unidad})`).toBe(true);
    }
  });
});

describe("el catalogo no se sale de la declaracion", () => {
  it("ningun alimento trae un campo de nutricion que nadie declaro", () => {
    const sobrantes = new Set();
    for (const a of alimentos) {
      for (const c of Object.keys(a.nutricion ?? {})) {
        if (!CAMPOS_NUTRICION.includes(c)) sobrantes.add(c);
      }
    }
    expect([...sobrantes]).toEqual([]);
  });

  it("los cuatro duros estan en todas las filas con nutricion", () => {
    const cojas = alimentos
      .filter((a) => a.nutricion && CAMPOS_DUROS.some((c) => a.nutricion[c] == null))
      .map((a) => a.id);
    expect(cojas).toEqual([]);
  });
});
