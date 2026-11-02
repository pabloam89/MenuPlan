import { describe, it, expect } from "vitest";
import { modoDespensaAlGenerar, modoDespensaAlCargar, usaDespensa, sinUseHomeStock, MODOS_DESPENSA_MOTOR } from "./modoDespensa.js";
import { DATOS_CASA } from "./registroFicha.js";

describe("modoDespensa: cómo usa la despensa el menú al generar", () => {
  it("un modo del motor se respeta tal cual", () => {
    for (const modo of MODOS_DESPENSA_MOTOR) expect(modoDespensaAlGenerar({ pantryMode: modo })).toBe(modo);
  });

  it("sin modo, o con uno que el motor no entiende, no se asume nada: off", () => {
    expect(modoDespensaAlGenerar({})).toBe("off");
    expect(modoDespensaAlGenerar(null)).toBe("off");
    expect(modoDespensaAlGenerar({ pantryMode: "todo" })).toBe("off");
  });

  it("usaDespensa es lo que era useHomeStock: todo modo salvo off", () => {
    expect(usaDespensa({ pantryMode: "off" })).toBe(false);
    expect(usaDespensa({})).toBe(false);
    for (const modo of MODOS_DESPENSA_MOTOR.filter((m) => m !== "off")) expect(usaDespensa({ pantryMode: modo })).toBe(true);
  });

  it("al cargar (App.jsx), un modo del motor se queda, «off» incluido y sin marca: ya no hay pantryModeSet (trozo 12)", () => {
    for (const modo of MODOS_DESPENSA_MOTOR) expect(modoDespensaAlCargar(modo)).toBe(modo);
    expect(modoDespensaAlCargar("off")).toBe("off");
  });

  it("al cargar, sin modo o con uno que el motor no entiende, el defecto del registro", () => {
    for (const malo of [undefined, null, "todo"]) expect(modoDespensaAlCargar(malo)).toBe(DATOS_CASA.pantryMode.defecto);
    expect(MODOS_DESPENSA_MOTOR).toContain(DATOS_CASA.pantryMode.defecto);
  });

  it("una casa vieja pierde su useHomeStock al guardar, y lo demás queda igual", () => {
    expect(sinUseHomeStock({ pantryMode: "off", useHomeStock: true, cookLevel: "pro" })).toEqual({ pantryMode: "off", cookLevel: "pro" });
    expect(sinUseHomeStock(null)).toEqual({});
  });
});
