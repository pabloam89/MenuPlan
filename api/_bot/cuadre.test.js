/**
 * L1: Lola solo confirma lo guardado, con los valores guardados. El código
 * compara lo que nombra al confirmar con los valores del RESULTADO (cuadre.js);
 * si no cuadra, sus frases de confirmar se quitan y entra el recibo.
 */
import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const { cuadre, menciones, CUADRE, FALLO } = await import("./cuadre.js");
const { resultado, conRecibo, ACCIONES } = await import("./resultado.js");
// El vigilante de verdad: el mismo que decide si una frase dice que guardó.
const { diceQueGuardo } = await import("./agente.js");

const opciones = { confirma: diceQueGuardo, hoy: "Mar", nombres: ["Leo", "Nat", "Ana"] };
const fuera = (valores, mas = {}) => resultado({ accion: "fuera", hecho: ["x"], valores, ...mas });
const cenaViernes = () => fuera({ dia: ["Vie"], comida: ["Cena"], persona: ["Leo"] });
const clases = (c) => c.fallos.map((f) => f.clase).sort();

describe("lo que nombra una frase, con el registro", () => {
  it("días, comidas y personas; «finde» y «hoy»/«mañana» con el día de hoy", () => {
    const m = menciones("Leo no cena en casa el finde ni mañana a mediodía", { hoy: "Mar", nombres: ["Leo"] });
    expect([...m.dia].sort()).toEqual(["Dom", "Mié", "Sáb"]);
    expect([...m.comida].sort()).toEqual(["Cena", "Comida"]);
    expect([...m.persona]).toEqual(["Leo"]);
  });

  it("lo que se nombra para dejarlo fuera no cuenta; «ni» sí (en una ausencia es el contenido)", () => {
    expect(menciones("Apuntado el viernes, no el sábado").dia).toEqual(new Set(["Vie"]));
    expect(menciones("el viernes ni comida ni cena").comida).toEqual(new Set(["Comida", "Cena"]));
  });

  it("«por la mañana» y «pasado mañana» no son el día de mañana; «semana» sola no es un día", () => {
    expect(menciones("por la mañana", { hoy: "Mar" }).dia).toBeUndefined();
    expect(menciones("pasado mañana", { hoy: "Mar" }).dia).toBeUndefined();
    expect(menciones("esta semana").dia).toBeUndefined();
  });
});

describe("¿cuadra lo que confirma Lola con lo guardado?", () => {
  it("nombra lo guardado: cuadra, y su ✅ no se repite", () => {
    const r = cenaViernes();
    const c = cuadre("✅ Apuntado: Leo no cena en casa el viernes. ¿Le preparo algo para llevar?", [r], opciones);
    expect(c.estado).toBe(CUADRE.CUADRA);
    expect(c.dichos).toEqual([r]);
    expect(conRecibo("Hecho: la cena del viernes, Leo fuera.", [r], { cuadre: cuadre("Hecho: la cena del viernes, Leo fuera.", [r], opciones) })).toBe("Hecho: la cena del viernes, Leo fuera.");
  });

  it("dice «comida y cena» y se guardó «cena»: no cuadra, se quita su frase y entra el recibo", () => {
    const r = cenaViernes();
    const texto = "✅ Apuntado: el viernes Leo no está ni en la comida ni en la cena. ¿Algo más?";
    const c = cuadre(texto, [r], opciones);
    expect(c.estado).toBe(CUADRE.NO_CUADRA);
    expect(c.fallos).toEqual([{ eje: "comida", valor: "Comida", clase: FALLO.OTRO_VALOR }]);
    expect(conRecibo(texto, [r], { cuadre: c })).toBe(`✅ <b>${ACCIONES.fuera}</b>: x.\n\n¿Algo más?`);
  });

  it("dice «cena» y se guardaron comida y cena: falta un valor, no cuadra", () => {
    const r = fuera({ dia: ["Vie"], comida: ["Comida", "Cena"] });
    const c = cuadre("Apuntado: el viernes no cenáis en casa, nada de cena.", [r], opciones);
    expect(clases(c)).toEqual([FALLO.FALTA_VALOR]);
    expect(c.quitar).toHaveLength(1);
  });

  it("otro día, u otra persona: no cuadra", () => {
    expect(clases(cuadre("Apuntado: el sábado Leo cena fuera.", [cenaViernes()], opciones))).toEqual([FALLO.FALTA_VALOR, FALLO.OTRO_VALOR]);
    expect(clases(cuadre("Apuntado: el viernes Nat cena fuera.", [cenaViernes()], opciones))).toEqual([FALLO.FALTA_VALOR, FALLO.OTRO_VALOR]);
  });

  it("confirma un eje que no se tocó: no cuadra, si todo lo hecho trae valores", () => {
    const r = fuera({ persona: ["Leo"], comida: ["Cena"] });
    expect(clases(cuadre("Apuntado: Leo cena fuera el viernes.", [r], opciones))).toEqual([FALLO.EJE_NO_TOCADO]);
    // Con otro resultado sin valores en el turno (la despensa), no se sabe todo lo guardado: no se juzga ese eje.
    const otro = resultado({ accion: "despensa", hecho: ["leche"] });
    expect(cuadre("Apuntado: Leo cena fuera el viernes.", [r, otro], opciones).fallos).toEqual([]);
  });

  it("no nombra el día o la comida: su frase se queda y el recibo dice lo que calló", () => {
    const r = cenaViernes();
    const texto = "Apuntado: Leo cena fuera.";
    const c = cuadre(texto, [r], opciones);
    expect(clases(c)).toEqual([FALLO.FALTA_EJE]);
    expect(c.quitar).toEqual([]);
    expect(conRecibo(texto, [r], { cuadre: c })).toBe(`✅ <b>${ACCIONES.fuera}</b>: x.\n\n${texto}`);
  });

  it("«¡Hecho!» suelto se lee con la frase siguiente", () => {
    expect(cuadre("¡Hecho! Leo no cena en casa el viernes.", [cenaViernes()], opciones).estado).toBe(CUADRE.CUADRA);
  });

  it("la persona puede ir implícita; «hoy» vale por el día de hoy", () => {
    const r = fuera({ dia: ["Mar"], comida: ["Cena"], persona: ["Leo", "Nat", "Ana"] });
    expect(cuadre("Apuntado: hoy cenáis fuera, nada de cena en casa.", [r], opciones).estado).toBe(CUADRE.CUADRA);
  });

  it("sin confirmar, sin nombrar nada o sin valores: el recibo de siempre", () => {
    expect(cuadre("El viernes Leo cena fuera, ¿verdad?", [cenaViernes()], opciones).estado).toBe(CUADRE.NO_LO_DICE);
    expect(cuadre("✅ Listo, apuntado.", [cenaViernes()], opciones).estado).toBe(CUADRE.SIN_NOMBRAR);
    expect(cuadre("Apuntado el viernes.", [resultado({ accion: "despensa", hecho: ["leche"] })], opciones).estado).toBe(CUADRE.SIN_VALORES);
    for (const c of [cuadre("✅ Listo, apuntado.", [cenaViernes()], opciones)]) expect(c.dichos).toEqual([]);
  });

  it("lo que no se hizo (⚠️) sale siempre, aunque cuadre", () => {
    const r = fuera({ dia: ["Vie"], comida: ["Cena"] }, { sinHacer: [{ que: "quitar el plato", motivo: "no se ha podido guardar" }] });
    const texto = "Apuntado: la cena del viernes fuera.";
    const c = cuadre(texto, [r], opciones);
    expect(c.estado).toBe(CUADRE.CUADRA);
    expect(conRecibo(texto, [r], { cuadre: c })).toBe(`⚠️ <b>Sin hacer</b>: quitar el plato <i>(no se ha podido guardar)</i>.\n\n${texto}`);
  });
});
