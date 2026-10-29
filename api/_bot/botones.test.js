import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BOTONES, esNoEsAsi, esEligeTu, leerBotonRehacer, textoRehacer } from "./botones.js";
import { botonRehacer, esBotonRehacer, desdeDelBoton } from "./semanaPedida.js";
import { eleccionDe } from "./turno.js";

// Los botones que el código reconoce, en los dos idiomas (#958).
describe("botones en castellano y en inglés", () => {
  it("cada botón de la tabla se reconoce en sus dos formas", () => {
    for (const lengua of ["es", "en"]) {
      expect(esNoEsAsi(BOTONES.noEsAsi[lengua]), lengua).toBe(true);
      expect(esEligeTu(BOTONES.eligeTu[lengua]), lengua).toBe(true);
      expect(esBotonRehacer(BOTONES.rehacer[lengua]), lengua).toBe(true);
    }
  });

  it("«Redo the week of 26 Oct» rehace la misma semana que «Rehacer la del 26 oct»", () => {
    expect(desdeDelBoton("Redo the week of 26 Oct", "2026-10-29")).toBe("2026-10-26");
    expect(desdeDelBoton("Rehacer la del 26 oct", "2026-10-29")).toBe("2026-10-26");
    expect(desdeDelBoton("Rehacer la del 3 ene", "2026-12-29")).toBe("2027-01-03");
    expect(leerBotonRehacer("Redo it")).toBeNull();
  });

  it("lo que escribe textoRehacer se lee igual, los doce meses y en los dos idiomas", () => {
    for (let mes = 1; mes <= 12; mes++) {
      const iso = `2027-${String(mes).padStart(2, "0")}-15`;
      for (const lengua of ["es", "en"]) {
        expect(leerBotonRehacer(textoRehacer(iso, lengua)), `${iso} ${lengua}`).toEqual({ dia: 15, mes: mes - 1 });
      }
    }
  });

  it("el botón que pone botonRehacer tras un ajuste rehace esa misma semana", () => {
    const del26 = { weekStart: "2026-10-26", weekEnd: "2026-11-01", startDayIdx: 0 };
    const boton = botonRehacer([del26], "2026-10-24");
    expect(boton).toBe(BOTONES.rehacer.es);
    expect(desdeDelBoton(boton, "2026-10-24")).toBe("2026-10-26");
  });

  it("los botones que nombra el prompt de Lola son los de la tabla", () => {
    const prompt = readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
    expect(prompt).toContain(`[[${BOTONES.noEsAsi.es}]]`);
    expect(prompt).toContain(`[[${BOTONES.eligeTu.es}]]`);
    expect(prompt).toContain(`[[${BOTONES.rehacer.es}]]`);
  });

  it("«You choose» elige entre las opciones ofrecidas", () => {
    const propuesta = { opciones: [{ id: "a", nombre: "Lentejas" }, { id: "b", nombre: "Tortilla" }] };
    expect(eleccionDe("You choose", propuesta)).toEqual({ eligeTu: true });
    expect(eleccionDe("Elige tú", propuesta)).toEqual({ eligeTu: true });
    expect(eleccionDe("elige tú, la que sea", propuesta)).toEqual({ eligeTu: true });
  });

  it("la puntuación y los apóstrofos no cuentan («No es así.», «thats not right»)", () => {
    expect(esNoEsAsi("No es así.")).toBe(true);
    expect(esNoEsAsi("thats not right")).toBe(true);
    expect(esNoEsAsi("No, así no")).toBe(true);
  });

  it("lo que no es el botón no se confunde", () => {
    expect(esNoEsAsi("no es así de fácil")).toBe(false);
    expect(esNoEsAsi("That's right")).toBe(false);
    expect(esEligeTu("cualquieras")).toBe(false);
  });
});
