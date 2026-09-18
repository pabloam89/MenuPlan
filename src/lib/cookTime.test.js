import { describe, expect, it } from "vitest";
import {
  TANDA_MIN, TANDA_MAX, TANDA_POR_DEFECTO, minutosDeTanda, enHoras,
} from "./cookTime.js";

describe("el presupuesto de la tanda", () => {
  it("por defecto, una hora", () => {
    expect(minutosDeTanda(undefined)).toBe(TANDA_POR_DEFECTO);
    expect(minutosDeTanda({})).toBe(TANDA_POR_DEFECTO);
  });

  it("respeta lo guardado y lo recorta al recorrido del deslizador", () => {
    expect(minutosDeTanda({ tandaMinutos: 90 })).toBe(90);
    expect(minutosDeTanda({ tandaMinutos: 5 })).toBe(TANDA_MIN);
    expect(minutosDeTanda({ tandaMinutos: 999 })).toBe(TANDA_MAX);
  });

  it("los minutos se dicen como los diría una persona", () => {
    expect(enHoras(30)).toBe("30 min");
    expect(enHoras(59)).toBe("59 min");
    expect(enHoras(60)).toBe("1 h");
    expect(enHoras(90)).toBe("1 h 30");
    expect(enHoras(240)).toBe("4 h");
    expect(enHoras(0)).toBe("0 min");
  });
});
