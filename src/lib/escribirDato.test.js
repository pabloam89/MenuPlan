// escribirDato, lo común a la app y a Lola (plan fichas con estado, trozo 8): el
// dato contra el registro y sus vocabularios, la operación de tipo dato y lo que
// se devuelve de ella (sin pedido ni inversa, que llevan salud).
import { describe, it, expect } from "vitest";
import {
  datoValido, operacionDeDato, resultadoDeOperacion, DatoInvalido, CAMPOS_RESULTADO,
} from "./escribirDato.js";
import { ESTADO_OPERACION, SEXO, CANAL_DATO, REF_OPERACION } from "./vocabularios.js";
import { REGISTRO_CAMPOS } from "./registroCampos.js";

const CASA = "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c";
const DATO = { campo: "sexo", persona_id: "p1", valor: SEXO[0], origen: "dicho" };
const PEDIDO = { casa: CASA, accion: "ver_ajustes", dato: DATO };
const HECHA = { operacion_id: "op1", estado: ESTADO_OPERACION.HECHA, repetida: false, hecho: [{ campo: "sexo" }], sin_hacer: [], choques: [], rev: 7 };

describe("datoValido", () => {
  it("pasa un dato del registro con su valor de vocabulario", () => {
    expect(datoValido(DATO)).toEqual(DATO);
  });
  it("un campo fuera del registro no entra", () => {
    expect(REGISTRO_CAMPOS.noEsUnCampo).toBeUndefined();
    expect(() => datoValido({ ...DATO, campo: "noEsUnCampo" })).toThrow(DatoInvalido);
  });
  it("un origen fuera de ORIGEN_DATO no entra", () => {
    expect(() => datoValido({ ...DATO, origen: "inventado" })).toThrow(/origen/);
  });
  it("un valor fuera del vocabulario del campo no entra", () => {
    expect(SEXO).not.toContain("otro_valor");
    expect(() => datoValido({ ...DATO, valor: "otro_valor" })).toThrow(DatoInvalido);
  });
  it("sin dato, o con un campo heredado de Object (__proto__), no entra", () => {
    expect(() => datoValido(null)).toThrow(DatoInvalido);
    expect(() => datoValido({ ...DATO, campo: "__proto__" })).toThrow(DatoInvalido);
    expect(() => datoValido({ ...DATO, campo: "constructor" })).toThrow(DatoInvalido);
  });
  it("un valor demasiado largo no entra", () => {
    expect(() => datoValido({ campo: "colegio", persona_id: "p1", valor: "x".repeat(5000), origen: "dicho" })).toThrow(/caracteres/);
  });
});

describe("operacionDeDato", () => {
  const base = { ...PEDIDO, clave: "k1", canal: CANAL_DATO.APP, ref: { tipo: REF_OPERACION.PANTALLA, id: "ajustes" }, autor: { user_id: "u1" } };
  it("arma la operación de un solo dato que espera aplicar_operacion", () => {
    expect(operacionDeDato(base)).toEqual({
      casa: CASA, clave: "k1", accion: "ver_ajustes", canal: "app", ref_tipo: "pantalla", ref_id: "ajustes",
      autor_user_id: "u1", autor_persona_id: null, datos: [DATO],
    });
  });
  it("sin clave, con un canal o una ref fuera de su vocabulario, no hay operación", () => {
    expect(() => operacionDeDato({ ...base, clave: "" })).toThrow(/clave/);
    expect(() => operacionDeDato({ ...base, canal: "fax" })).toThrow(/canal/);
    expect(() => operacionDeDato({ ...base, ref: { tipo: "carta", id: "x" } })).toThrow(/referencia/);
    // La forma del CHECK operacion_accion_forma (0105): se para antes de llegar a la base.
    expect(() => operacionDeDato({ ...base, accion: "Ver Ajustes" })).toThrow(/capacidad/);
  });
});

describe("lo que vuelve del servidor", () => {
  it("resultadoDeOperacion deja fuera pedido e inversa (llevan salud)", () => {
    const r = resultadoDeOperacion({ ...HECHA, pedido: { datos: [DATO] }, inversa: { datos: [] } });
    expect(Object.keys(r).sort()).toEqual(["guardado", ...CAMPOS_RESULTADO].sort());
    expect(r.guardado).toBe(true);
    expect(resultadoDeOperacion({ ...HECHA, estado: ESTADO_OPERACION.RECHAZADA }).guardado).toBe(false);
  });
});
