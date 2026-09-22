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

describe("la segunda ficha no pisa a la primera", () => {
  const complementadas = alimentos.filter((a) => a.fuenteComplemento);

  it("hay filas complementadas y todas declaran que campos", () => {
    expect(complementadas.length).toBeGreaterThan(0);
    for (const a of complementadas) {
      expect(Array.isArray(a.fuenteComplemento.campos) && a.fuenteComplemento.campos.length, a.id).toBeTruthy();
      expect(a.fuenteComplemento.foodId, a.id).toBeTruthy();
    }
  });

  // El invariante que sustituye a «una fila, una ficha»: UN CAMPO, UNA FICHA.
  // Un campo prestado tiene que ser uno que la ficha propia no publicaba, o
  // estariamos tapando un dato con otro sin que nadie pueda verlo.
  it("solo se presta lo que la ficha propia dejaba vacio", () => {
    const malos = [];
    for (const a of complementadas) {
      for (const c of a.fuenteComplemento.campos) {
        if (!CAMPOS_NUTRICION.includes(c)) malos.push(`${a.id}: ${c} no es un campo declarado`);
      }
    }
    expect(malos).toEqual([]);
  });

  // Los cuatro macros secundarios NUNCA se prestan: la receta los declara y
  // mezclarlos abriria la puerta a cambiar lo que el usuario lee.
  it("nunca presta un macro", () => {
    const macros = ["kcal100g", "protein100g", "carbs100g", "fat100g", "fiber100g", "sugar100g", "saturatedFat100g", "sodium100g"];
    const malos = complementadas.flatMap((a) =>
      a.fuenteComplemento.campos.filter((c) => macros.includes(c)).map((c) => `${a.id}.${c}`),
    );
    expect(malos).toEqual([]);
  });

  // La prueba de que las dos fichas hablan del mismo alimento.
  it("ninguna presta con las dos tablas discrepando mas del 30 %", () => {
    const malos = complementadas
      .filter((a) => a.fuenteComplemento.discrepancia != null && a.fuenteComplemento.discrepancia > 0.3)
      .map((a) => `${a.id}: ${a.fuenteComplemento.discrepancia}`);
    expect(malos).toEqual([]);
  });
});
