import { describe, expect, it } from "vitest";
import { RAMA_STAGING, banderas } from "./banderas.mjs";

describe("banderas de la app por rama", () => {
  it("staging: solver, pizarra encendida y guías apagadas", () => {
    expect(banderas(RAMA_STAGING)).toEqual({ VITE_MOTOR: "solver", VITE_PIZARRA: "on", VITE_GUIAS: "off" });
  });

  it("producción: solver, pizarra encendida y guías encendidas", () => {
    expect(banderas("main")).toEqual({ VITE_MOTOR: "solver", VITE_PIZARRA: "on", VITE_GUIAS: "on" });
  });

  it("local o preview: modelo, pizarra apagada y guías encendidas", () => {
    expect(banderas("")).toEqual({ VITE_MOTOR: "modelo", VITE_PIZARRA: "off", VITE_GUIAS: "on" });
    expect(banderas("ux/una-rama")).toEqual(banderas(""));
  });

  it("lo que trae el entorno pisa a la rama, y lo vacío no", () => {
    const entorno = { VITE_MOTOR: "modelo", VITE_PIZARRA: "" };
    expect(banderas(RAMA_STAGING, (k) => entorno[k])).toEqual({ VITE_MOTOR: "modelo", VITE_PIZARRA: "on", VITE_GUIAS: "off" });
  });
});
