/**
 * Lo hecho sale de los datos (#958, raíz 1): el resultado con forma fija, el
 * recibo que ve la familia y el vigilante de «dice que lo guardó».
 */
import { describe, it, expect } from "vitest";
import { resultado, esResultado, paraElModelo, recibo, conRecibo, RECIBO_SIN_GUARDAR, diceQueGuardo, cuentaComoGuardado, ESTADOS_RESULTADO } from "./resultado.js";

describe("el resultado de una escritura", () => {
  it("el estado sale de lo hecho y lo que no: no se escribe a mano", () => {
    expect(resultado({ accion: "despensa", hecho: ["leche"] }).estado).toBe("hecho");
    expect(resultado({ accion: "despensa", hecho: ["leche"], sinHacer: [{ que: "pan", motivo: "x" }] }).estado).toBe("parcial");
    expect(resultado({ accion: "despensa", sinHacer: ["pan"] }).estado).toBe("nada");
    for (const e of ["hecho", "parcial", "nada"]) expect(ESTADOS_RESULTADO).toContain(e);
  });

  it("el modelo lee el JSON y la orden de no decir «todo» si no lo es", () => {
    const r = resultado({ accion: "despensa", hecho: ["leche", "pan"], sinHacer: [{ que: "atún", motivo: "no cabía" }] });
    const t = paraElModelo(r);
    expect(JSON.parse(t.split("\n")[0].replace(/^RESULTADO /, ""))).toMatchObject({ estado: "parcial", pedido: 3, hecho: ["leche", "pan"], sin_hacer: [{ que: "atún", motivo: "no cabía" }] });
    expect(t).toMatch(/no digas «todo»/);
    expect(esResultado(r)).toBe(true);
    expect(esResultado("Guardado.")).toBe(false);
  });
});

describe("el recibo que ve la familia", () => {
  it("✅ lo hecho y ⚠️ lo que no, con su porqué, agrupado", () => {
    const r = resultado({
      accion: "despensa",
      hecho: Array.from({ length: 38 }, (_, i) => `cosa ${i + 1}`),
      sinHacer: Array.from({ length: 28 }, (_, i) => ({ que: `otra ${i + 1}`, motivo: "no cabía en una vez" })),
    });
    const t = recibo([r]);
    expect(t).toMatch(/^✅ <b>Apuntado en la despensa<\/b>: cosa 1, .* y 30 más\.$/m);
    expect(t).toMatch(/^⚠️ <b>Sin hacer<\/b>: otra 1, .* y 20 más <i>\(no cabía en una vez\)<\/i>\.$/m);
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

describe("el vigilante, con las frases que se le escapaban (#958)", () => {
  it("«He cambiado…», «Te he añadido…», «He borrado…», «Ya está: …»", () => {
    expect(diceQueGuardo("He cambiado la cena del jueves por merluza.")).toBe(true);
    expect(diceQueGuardo("Te he añadido el pan a la lista.")).toBe(true);
    expect(diceQueGuardo("He borrado los yogures de la compra.")).toBe(true);
    expect(diceQueGuardo("Ya está: el lunes cenáis crema de calabacín.")).toBe(true);
    expect(diceQueGuardo("¡Ya está! Os he quitado el pescado.")).toBe(true);
    expect(diceQueGuardo("Os hemos marcado la leche como comprada.")).toBe(true);
  });

  it("lo negado, preguntado o de cocina sigue sin contar", () => {
    expect(diceQueGuardo("No he cambiado nada todavía.")).toBe(false);
    expect(diceQueGuardo("No te he añadido nada.")).toBe(false);
    expect(diceQueGuardo("¿Quieres que te lo cambie?")).toBe(false);
    expect(diceQueGuardo("El arroz ya está.")).toBe(false);
    expect(diceQueGuardo("Te he puesto los botones para mandarlo.")).toBe(false);
    expect(diceQueGuardo("Aún no lo he borrado, ¿cuál quito?")).toBe(false);
  });

  it("un resultado sin nada hecho no cuenta como guardado, aunque escribiera algo", () => {
    expect(cuentaComoGuardado(true, resultado({ accion: "despensa", sinHacer: ["pan"] }))).toBe(false);
    expect(cuentaComoGuardado(true, resultado({ accion: "despensa", hecho: ["pan"] }))).toBe(true);
    expect(cuentaComoGuardado(true, "Guardado.")).toBe(true);
    expect(cuentaComoGuardado(false, "Guardado.")).toBe(false);
  });
});
