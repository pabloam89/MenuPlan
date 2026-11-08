/**
 * El nivel de cocina en el modo básico (trozo 12 de #1037): sin la marca cookLevelManual, el que llega es el dicho
 * o el defecto del registro. Con la 0112, leído de ficha_casa v2 como lo leen la app (casaDatos.js) y Lola
 * (casa.js); sin ella, del documento.
 */
import { describe, it, expect } from "vitest";
import { resolveModeData } from "./prepararGeneracion.js";
import { estadosDeFichas, datosConSobre } from "./estadoDeDato.js";

const sobre = (campo, valor) => ({
  campo, sujeto: { tipo: "casa", id: null }, estado: "dicho", valor, origen: "dicho",
  bloqueado: false, peso: null, confirmado_el: null, caduca_at: null, cambiado_at: null, dicho_por: null, canal: "app", operacion_id: null,
});
const porDefecto = (campo, valor) => ({ ...sobre(campo, valor), estado: "por_defecto", origen: null });
/** Los datos de la casa con lo leído de su ficha, como conCasaLeida (casaDatos.js). */
const conFicha = (data, ...ficha) => ({ ...data, ...Object.fromEntries(datosConSobre(estadosDeFichas({ casa: ficha })).map((l) => [l.campo, l.valor])) });
const BASICO = { expertMode: false, cookLevel: "pro" };

describe("el nivel de cocina en el modo básico", () => {
  it("con la 0112, el dicho en su sobre manda aunque el documento no traiga marca", () => {
    expect(resolveModeData(conFicha(BASICO, sobre("cookLevel", "basic"))).cookLevel).toBe("basic");
  });

  it("con la 0112 y nadie lo dijo, el defecto del registro («normal»), no lo que quedó en el documento", () => {
    expect(resolveModeData(conFicha(BASICO, porDefecto("cookLevel", "normal"))).cookLevel).toBe("normal");
  });

  it("sin la 0112 (la ficha no lo trae), el del documento; sin nivel, «normal»", () => {
    expect(resolveModeData(conFicha(BASICO)).cookLevel).toBe("pro");
    expect(resolveModeData({ expertMode: false }).cookLevel).toBe("normal");
  });
});
