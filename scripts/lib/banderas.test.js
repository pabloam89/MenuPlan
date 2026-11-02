import { describe, expect, it } from "vitest";
import { RAMA_STAGING, banderas } from "./banderas.mjs";

describe("banderas de la app por rama", () => {
  it("staging: solver, pizarra encendida, guías apagadas y Apple en la web", () => {
    expect(banderas(RAMA_STAGING)).toEqual({ VITE_MOTOR: "solver", VITE_PIZARRA: "on", VITE_GUIAS: "off", VITE_APPLE_WEB: "on" });
  });

  it("producción: solver, pizarra encendida, guías encendidas y sin Apple en la web", () => {
    expect(banderas("main")).toEqual({ VITE_MOTOR: "solver", VITE_PIZARRA: "on", VITE_GUIAS: "on", VITE_APPLE_WEB: "off" });
  });

  it("local o preview: modelo, pizarra apagada, guías encendidas y sin Apple en la web", () => {
    expect(banderas("")).toEqual({ VITE_MOTOR: "modelo", VITE_PIZARRA: "off", VITE_GUIAS: "on", VITE_APPLE_WEB: "off" });
    expect(banderas("ux/una-rama")).toEqual(banderas(""));
  });

  it("lo que trae el entorno pisa a la rama, y lo vacío no", () => {
    const entorno = { VITE_MOTOR: "modelo", VITE_PIZARRA: "" };
    expect(banderas(RAMA_STAGING, (k) => entorno[k])).toEqual({ VITE_MOTOR: "modelo", VITE_PIZARRA: "on", VITE_GUIAS: "off", VITE_APPLE_WEB: "on" });
  });
});
