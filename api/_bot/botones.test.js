import { describe, it, expect } from "vitest";
import { BOTONES, esNoEsAsi, ELIGE_TU, leerBotonRehacer } from "./botones.js";
import { esBotonRehacer, desdeDelBoton, fechaCorta } from "./semanaPedida.js";
import { eleccionDe } from "./turno.js";

// Los botones que el código reconoce, en los dos idiomas (#958).
describe("botones en castellano y en inglés", () => {
  it("cada botón de la tabla se reconoce en sus dos formas", () => {
    for (const lengua of ["es", "en"]) {
      expect(esNoEsAsi(BOTONES.noEsAsi[lengua]), lengua).toBe(true);
      expect(ELIGE_TU.test(BOTONES.eligeTu[lengua]), lengua).toBe(true);
      expect(esBotonRehacer(BOTONES.rehacer[lengua]), lengua).toBe(true);
    }
  });

  it("«Redo the week of 26 Oct» rehace la misma semana que «Rehacer la del 26 oct»", () => {
    expect(desdeDelBoton("Redo the week of 26 Oct", "2026-10-29")).toBe("2026-10-26");
    expect(desdeDelBoton("Redo week of Oct 26", "2026-10-29")).toBe("2026-10-26");
    expect(desdeDelBoton("Rehacer la del 26 oct", "2026-10-29")).toBe("2026-10-26");
    expect(desdeDelBoton("Rehacer la del 3 ene", "2026-12-29")).toBe("2027-01-03");
    expect(leerBotonRehacer("Redo it")).toBeNull();
  });

  it("el botón que escribe semanaPedida se lee igual, los doce meses", () => {
    for (let mes = 1; mes <= 12; mes++) {
      const iso = `2027-${String(mes).padStart(2, "0")}-15`;
      expect(leerBotonRehacer(`Rehacer la del ${fechaCorta(iso)}`), iso).toEqual({ dia: 15, mes: mes - 1 });
    }
  });

  it("«You choose» elige entre las opciones ofrecidas", () => {
    const propuesta = { opciones: [{ id: "a", nombre: "Lentejas" }, { id: "b", nombre: "Tortilla" }] };
    expect(eleccionDe("You choose", propuesta)).toEqual({ eligeTu: true });
    expect(eleccionDe("Elige tú", propuesta)).toEqual({ eligeTu: true });
  });

  it("lo que no es el botón no se confunde", () => {
    expect(esNoEsAsi("no es así de fácil")).toBe(false);
    expect(esNoEsAsi("That's right")).toBe(false);
  });
});

