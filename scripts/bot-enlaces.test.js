import { describe, it, expect } from "vitest";
import { contar, leerDias, DIAS_POR_DEFECTO } from "./bot-enlaces.mjs";
import { CAMINO_ENLACE, RESULTADO_ENLACE, CAMINOS_ENLACE, RESULTADOS_ENLACE } from "../src/lib/vocabularios.js";

const f = (cuenta, en, camino, resultado) => ({ cuenta, en, camino, resultado });

describe("bot-enlaces: los intentos de conectar un chat (#1238)", () => {
  it("cuenta por camino y por resultado, con todos los valores de su lista", () => {
    const c = contar([
      f("a", 1, CAMINO_ENLACE.APP, RESULTADO_ENLACE.NUEVO),
      f("b", 2, CAMINO_ENLACE.APP, RESULTADO_ENLACE.OCUPADO),
      f("c", 3, CAMINO_ENLACE.INVITACION, RESULTADO_ENLACE.YA_ESTABA),
    ]);
    expect(c.intentos).toBe(3);
    expect(Object.keys(c.porCamino)).toEqual(CAMINOS_ENLACE);
    expect(Object.keys(c.porResultado)).toEqual(RESULTADOS_ENLACE);
    expect(c.porCamino.app).toBe(2);
    expect(c.porResultado.ocupado).toBe(1);
  });

  it("se queda fuera la cuenta cuyo último intento es un rechazo; si enlazó después, no", () => {
    const c = contar([
      // b: rechazada dos veces, nunca enlaza → fuera.
      f("b", 1, CAMINO_ENLACE.APP, RESULTADO_ENLACE.OCUPADO),
      f("b", 5, CAMINO_ENLACE.APP, RESULTADO_ENLACE.OCUPADO),
      // d: rechazada y luego enlazada (en otro orden en la lista) → dentro.
      f("d", 9, CAMINO_ENLACE.APP, RESULTADO_ENLACE.NUEVO),
      f("d", 2, CAMINO_ENLACE.APP, RESULTADO_ENLACE.CADUCADO),
      // Sin cuenta: no cuenta como persona.
      f(null, 3, CAMINO_ENLACE.APP, RESULTADO_ENLACE.CADUCADO),
    ]);
    expect(c.fuera).toBe(1);
  });

  it("un valor fuera de la lista es un error, no un cero", () => {
    expect(() => contar([f("a", 1, "otro", RESULTADO_ENLACE.NUEVO)])).toThrow(/camino fuera de la lista/);
    expect(() => contar([f("a", 1, CAMINO_ENLACE.APP, "raro")])).toThrow(/resultado fuera de la lista/);
  });

  it("--dias: sin él, 30; un valor que no vale es un error", () => {
    expect(leerDias([])).toBe(DIAS_POR_DEFECTO);
    expect(leerDias(["--dias", "7"])).toBe(7);
    expect(() => leerDias(["--dias", "x"])).toThrow(/entero positivo/);
  });
});
