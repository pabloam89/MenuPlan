import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { conEstadosDieta } from "./estadosDieta.js";

describe("conEstadosDieta (#958): lista de estados y su meta dicen lo mismo", () => {
  it("al quitar un estado se va su `hasta`", () => {
    const m = { id: "a", dietaryStates: ["blanda", "embarazo"], dietaryStatesMeta: { blanda: { hasta: "2026-11-01" }, embarazo: { hasta: "2027-03-01" } } };
    expect(conEstadosDieta(m, ["embarazo"])).toEqual({ id: "a", dietaryStates: ["embarazo"], dietaryStatesMeta: { embarazo: { hasta: "2027-03-01" } } });
  });

  it("sin estados no queda meta vacía", () => {
    const m = { id: "a", dietaryStates: ["blanda"], dietaryStatesMeta: { blanda: { hasta: "2026-11-01" } } };
    expect(conEstadosDieta(m, [])).toEqual({ id: "a", dietaryStates: [] });
  });

  it("al añadir, la meta de los demás se queda", () => {
    const m = { id: "a", dietaryStates: ["blanda"], dietaryStatesMeta: { blanda: { hasta: "2026-11-01" } } };
    expect(conEstadosDieta(m, ["blanda", "embarazo"]).dietaryStatesMeta).toEqual({ blanda: { hasta: "2026-11-01" } });
  });

  it("la pantalla de la app desmarca con esta función", () => {
    expect(readFileSync(new URL("../screens/Onboarding.jsx", import.meta.url), "utf8")).toMatch(/conEstadosDieta\(m, list\)/);
  });
});
