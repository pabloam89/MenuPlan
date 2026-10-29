/**
 * Lo hecho sale de los datos (#958, raíz 1): el resultado con forma fija y el
 * recibo que ve la familia, pintado por el código y no por Lola.
 */
import { describe, it, expect } from "vitest";
import { resultado, esResultado, paraElModelo, recibo, conRecibo, RECIBO_SIN_GUARDAR, cuentaComoGuardado, ESTADO, EN_EL_RECIBO } from "./resultado.js";

const datosDe = (t) => JSON.parse(t.split("\n")[0].replace(/^RESULTADO /, ""));

describe("el resultado de una escritura", () => {
  it("el estado sale de lo hecho y lo que no: no se escribe a mano", () => {
    expect(resultado({ accion: "despensa", hecho: ["leche"] }).estado).toBe(ESTADO.HECHO);
    expect(resultado({ accion: "despensa", hecho: ["leche"], sinHacer: [{ que: "pan", motivo: "x" }] }).estado).toBe(ESTADO.PARCIAL);
    expect(resultado({ accion: "despensa", sinHacer: ["pan"] }).estado).toBe(ESTADO.NADA);
    // Lo vacío no cuenta: «nada» aunque llegue una lista de cadenas en blanco.
    expect(resultado({ accion: "despensa", hecho: [" ", ""] }).estado).toBe(ESTADO.NADA);
  });

  it("una acción sin etiqueta en el recibo no se acepta", () => {
    expect(() => resultado({ accion: "inventada", hecho: ["x"] })).toThrow(/sin etiqueta/);
  });

  it("el modelo lee el JSON y, si no está todo, la orden de no decir «todo»", () => {
    const r = resultado({ accion: "despensa", hecho: ["leche", "pan"], sinHacer: [{ que: "atún", motivo: "no cabía" }] });
    const t = paraElModelo(r);
    expect(datosDe(t)).toEqual({ accion: "despensa", estado: "parcial", pedido: 3, hecho: ["leche", "pan"], sin_hacer: [{ que: "atún", motivo: "no cabía" }] });
    expect(t).toMatch(/NO está todo: 1 sin hacer/);
    expect(t).toMatch(/no digas «todo»/);
    expect(paraElModelo(resultado({ accion: "despensa", sinHacer: ["pan"] }))).toMatch(/No se ha guardado NADA/);
    expect(paraElModelo(resultado({ accion: "despensa", hecho: ["pan"] }))).toMatch(/no repitas la lista/);
    expect(esResultado(r)).toBe(true);
    expect(esResultado("Guardado.")).toBe(false);
    expect(esResultado({ estado: "hecho", hecho: [] })).toBe(false);
  });
});

describe("el recibo que ve la familia", () => {
  it("✅ lo hecho y ⚠️ lo que no, con su porqué; los primeros EN_EL_RECIBO y «y N más»", () => {
    const r = resultado({
      accion: "despensa",
      hecho: Array.from({ length: 38 }, (_, i) => `cosa ${i + 1}`),
      sinHacer: Array.from({ length: 28 }, (_, i) => ({ que: `otra ${i + 1}`, motivo: "no cabía en una vez" })),
    });
    const t = recibo([r]);
    expect(t.split("\n")).toHaveLength(2);
    expect(t).toMatch(new RegExp(`^✅ <b>Apuntado en la despensa</b>: cosa 1, .*cosa ${EN_EL_RECIBO} y ${38 - EN_EL_RECIBO} más\\.$`, "m"));
    expect(t).toMatch(new RegExp(`^⚠️ <b>Sin hacer</b>: otra 1, .*otra ${EN_EL_RECIBO} y ${28 - EN_EL_RECIBO} más <i>\\(no cabía en una vez\\)</i>\\.$`, "m"));
  });

  it("una línea ⚠️ por motivo, y la ✅ solo si algo se hizo", () => {
    const r = resultado({ accion: "despensa", sinHacer: [{ que: "pan", motivo: "a" }, { que: "sal", motivo: "b" }, { que: "té", motivo: "a" }] });
    expect(recibo([r])).toBe("⚠️ <b>Sin hacer</b>: pan y té <i>(a)</i>.\n⚠️ <b>Sin hacer</b>: sal <i>(b)</i>.");
  });

  it("va ENCIMA del mensaje de Lola: una pregunta suya sigue al final", () => {
    const r = resultado({ accion: "despensa", hecho: ["leche"] });
    expect(conRecibo("¿Algo más?", [r])).toBe("✅ <b>Apuntado en la despensa</b>: leche.\n\n¿Algo más?");
    expect(conRecibo("Hola", [])).toBe("Hola");
  });

  it("si Lola sigue diciendo que guardó sin guardar nada, la familia lo ve dicho", () => {
    expect(conRecibo("✅ Apuntado.", [], { sinGuardar: true })).toBe(`${RECIBO_SIN_GUARDAR}\n\n✅ Apuntado.`);
  });

  it("escapa el HTML de lo que escribe la gente", () => {
    expect(recibo([resultado({ accion: "despensa", hecho: ["<b>pan</b>"] })])).toMatch(/&lt;b&gt;pan/);
  });
});

describe("lo que cuenta como guardado para el vigilante", () => {
  it("un resultado sin nada hecho no cuenta, aunque escribiera algo", () => {
    expect(cuentaComoGuardado(true, resultado({ accion: "despensa", sinHacer: ["pan"] }))).toBe(false);
    expect(cuentaComoGuardado(true, resultado({ accion: "despensa", hecho: ["pan"] }))).toBe(true);
    expect(cuentaComoGuardado(true, "Guardado.")).toBe(true);
    expect(cuentaComoGuardado(false, "Guardado.")).toBe(false);
  });
});
