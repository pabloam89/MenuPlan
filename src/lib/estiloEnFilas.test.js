/** El estilo de comida de cada menú (`mealStyleByGroup`) en filas de preferencia (trozo 14 de #1037). */
import { describe, it, expect } from "vitest";
import { estilosDeFilas, cambiosDeEstilos, CLAVE_CASA, FORMA_ESTILO } from "./estiloEnFilas.js";
import { PreferenciaInvalida } from "./preferencias.js";
import { EJES } from "../data/axisRegistry.js";

const NINOS = "00000000-0000-4000-8000-0000000000b1";
const GRUPOS = [{ id: NINOS, tipo: "ninos" }];
const fila = (id, grupo, valor) => ({ id, ...FORMA_ESTILO, persona_id: null, grupo_id: grupo, plan_id: null, valor, cantidad: null });

describe("el estilo de comida en filas", () => {
  it("su eje es de la 0117 (EJES) y de tipo enum", () => {
    expect(EJES.find((e) => e.id === FORMA_ESTILO.eje)?.tipo).toBe("enum");
  });

  it("se lee de las filas: el de un grupo, por su id; el de toda la casa, por __global__; sin filas, ninguno", () => {
    expect(estilosDeFilas([fila("f1", NINOS, "ligero"), fila("f2", null, "equilibrado")])).toEqual({ [NINOS]: "ligero", [CLAVE_CASA]: "equilibrado" });
    expect(estilosDeFilas([])).toEqual({});
    // Otra fila del mismo eje con ámbito no es el estilo de un menú.
    expect(estilosDeFilas([{ ...fila("f3", null, "ligero"), dias: ["Lun"] }])).toEqual({});
  });

  it("dos estilos para el mismo menú no se leen: falla en alto", () => {
    expect(() => estilosDeFilas([fila("f1", NINOS, "ligero"), fila("f2", NINOS, "de_todo")])).toThrow(PreferenciaInvalida);
  });

  it("elegir un estilo crea su fila; cambiarlo cambia la misma fila; quitarlo la borra; lo que no cambia no se manda", () => {
    expect(cambiosDeEstilos({}, { [NINOS]: "ligero" }, [], GRUPOS)).toEqual([
      { ...FORMA_ESTILO, grupo_id: NINOS, valor: "ligero", cantidad: null, origen: "dicho" }]);
    const filas = [fila("f1", NINOS, "ligero"), fila("f2", null, "equilibrado")];
    const antes = estilosDeFilas(filas);
    expect(cambiosDeEstilos(antes, { ...antes, [NINOS]: "personalizado" }, filas, GRUPOS)).toEqual([
      { id: "f1", ...FORMA_ESTILO, grupo_id: NINOS, valor: "personalizado", cantidad: null, origen: "dicho" }]);
    expect(cambiosDeEstilos(antes, { [NINOS]: "ligero" }, filas, GRUPOS)).toEqual([{ id: "f2", borrar: true }]);
    expect(cambiosDeEstilos(antes, { ...antes }, filas, GRUPOS)).toEqual([]);
    expect(cambiosDeEstilos(antes, undefined, filas, GRUPOS)).toEqual([]);
  });

  it("un estilo de un menú que no es de la casa, o que no es un id, no se guarda: falla en alto", () => {
    expect(() => cambiosDeEstilos({}, { otro: "ligero" }, [], GRUPOS)).toThrow(/no es de la casa/);
    expect(() => cambiosDeEstilos({}, { [CLAVE_CASA]: 3 }, [], GRUPOS)).toThrow(PreferenciaInvalida);
  });
});
