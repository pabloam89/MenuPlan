/**
 * Lo hecho sale de los datos (#958, raíz 1): el resultado con forma fija y el
 * recibo que ve la familia, pintado por el código y no por Lola.
 */
import { describe, it, expect } from "vitest";

// menu.js (resultadoDeAusencia) pide estas dos al cargarse; aquí no se usa la base.
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
// Al cargar el fichero y no dentro del test: menu.js tarda en frío más que el plazo de un test.
const { resultadoDeAusencia } = await import("./menu.js");
import { resultado, esResultado, paraElModelo, recibo, conRecibo, RECIBO_SIN_GUARDAR, cuentaComoGuardado, ESTADO, EN_EL_RECIBO, ORDEN_CON_VALORES } from "./resultado.js";

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

describe("una duda no es un fallo", () => {
  it("sin nada hecho ni motivo, Lola pregunta lo que falta y no promete un recibo que no sale", () => {
    const duda = resultado({ accion: "fuera", nota: "¿Qué día no estáis?" });
    expect(recibo([duda])).toBe("");
    const t = paraElModelo(duda);
    expect(t).toMatch(/pregúntalo/);
    expect(t).not.toMatch(/recibo/);
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

describe("los valores de lo guardado (L1)", () => {
  const fuera = (valores, mas = {}) => resultado({ accion: "fuera", hecho: ["Leo fuera el viernes 6 (cena)"], valores, ...mas });

  it("un eje o un valor fuera de su lista no se acepta; los repetidos y vacíos se quitan", () => {
    expect(() => fuera({ hora: ["10"] })).toThrow(/Eje sin vocabulario/);
    expect(() => fuera({ dia: ["Viernes"] })).toThrow(/fuera del eje dia/);
    expect(() => fuera({ comida: ["Merendola"] })).toThrow(/fuera del eje comida/);
    expect(fuera({ dia: ["Vie", "Vie", " "], comida: [] }).valores).toEqual({ dia: ["Vie"] });
    expect(resultado({ accion: "despensa", hecho: ["pan"] }).valores).toBeNull();
  });

  it("el modelo lee lo guardado con la etiqueta del registro y la orden de nombrarlo", () => {
    const t = paraElModelo(fuera({ dia: ["Vie"], comida: ["Cena"], persona: ["Leo"] }));
    expect(datosDe(t).guardado).toEqual({ dia: ["viernes"], comida: ["cena"], persona: ["Leo"] });
    expect(t).toContain(ORDEN_CON_VALORES);
    // A medias: la orden de lo que falta y la de nombrar lo guardado.
    const parcial = paraElModelo(fuera({ dia: ["Vie"] }, { sinHacer: [{ que: "la comida", motivo: "x" }] }));
    expect(parcial).toMatch(/NO está todo: 1 sin hacer/);
    expect(parcial).toContain(ORDEN_CON_VALORES);
    // Sin valores, o sin nada hecho: lo de siempre, sin «guardado».
    const sin = paraElModelo(resultado({ accion: "despensa", hecho: ["pan"] }));
    expect(sin).not.toContain(ORDEN_CON_VALORES);
    expect(datosDe(sin).guardado).toBeUndefined();
    expect(datosDe(paraElModelo(resultado({ accion: "fuera", sinHacer: ["x"], valores: { dia: ["Vie"] } }))).guardado).toBeUndefined();
  });
});

describe("fuera_de_casa devuelve lo guardado con sus valores", () => {
  it("lo apuntado: hecho y valores; una duda: sin línea en el recibo; un fallo al guardar: ⚠️", () => {
    const ok = resultadoDeAusencia({ texto: "Apuntado: Leo fuera el viernes 6 (cena).", hecho: "Leo fuera el viernes 6 (cena)", valores: { dia: ["Vie"], comida: ["Cena"], persona: ["Leo"] } });
    expect(ok.estado).toBe(ESTADO.HECHO);
    expect(ok.hecho).toEqual(["Leo fuera el viernes 6 (cena)"]);
    expect(ok.valores).toEqual({ dia: ["Vie"], comida: ["Cena"], persona: ["Leo"] });
    expect(resultadoDeAusencia({ ...ok, texto: "x", hecho: "y", valores: ok.valores, aMedias: true }).estado).toBe(ESTADO.PARCIAL);
    expect(recibo([resultadoDeAusencia({ texto: "¿Qué día?", error: "dia" })])).toBe("");
    expect(resultadoDeAusencia({ texto: "No he podido guardarlo: x.", error: "guardar" }).sinHacer).toHaveLength(1);
  });
});
