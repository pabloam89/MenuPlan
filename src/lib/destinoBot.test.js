import { describe, it, expect } from "vitest";
import { interpretarDestino } from "./destinoBot.js";

describe("interpretarDestino", () => {
  it("hoy, semana y compra", () => {
    expect(interpretarDestino("hoy")).toEqual({ pantalla: "menu", vista: "dia", dia: null });
    expect(interpretarDestino("semana")).toEqual({ pantalla: "menu", vista: "semana" });
    expect(interpretarDestino("compra")).toEqual({ pantalla: "shopping" });
  });

  it("un día, con o sin tilde y en cualquier caja", () => {
    expect(interpretarDestino("dia:Jue")).toEqual({ pantalla: "menu", vista: "dia", dia: "Jue" });
    expect(interpretarDestino("dia:mie")).toEqual({ pantalla: "menu", vista: "dia", dia: "Mié" });
    expect(interpretarDestino("dia:SÁB")).toEqual({ pantalla: "menu", vista: "dia", dia: "Sáb" });
  });

  it("una receta, sin el prefijo de grupo", () => {
    expect(interpretarDestino("receta:legumbres_031")).toEqual({ pantalla: "receta", id: "legumbres_031" });
    expect(interpretarDestino("receta:uck1a48c__legumbres_031")).toEqual({ pantalla: "receta", id: "legumbres_031" });
  });

  it("lo que no entiende es null, no una pantalla cualquiera", () => {
    for (const v of ["", null, "dia:", "dia:juernes", "receta:", "ajustes", "javascript:alert(1)"]) {
      expect(interpretarDestino(v)).toBe(null);
    }
  });
});
