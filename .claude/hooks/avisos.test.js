import { describe, expect, it } from "vitest";

import { avisoDe } from "./avisos.mjs";

describe("avisos al editar (#205)", () => {
  const issues = [
    { number: 174, title: "[fondo] Los vigilantes deciden leyendo el texto", state: "OPEN", body: "la guardia (`guardia.mjs`)" },
    { number: 159, title: "[lección] cerrada", state: "CLOSED", body: "guardia.mjs" },
  ];
  it("nombra los abiertos que hablan del fichero", () => {
    const a = avisoDe(issues, "C:/dev/MenuPlan-x/.claude/hooks/guardia.mjs");
    expect(a).toMatch(/#174/);
    expect(a).not.toMatch(/#159/);
  });
  it("de un fichero que nadie nombra, nada", () => expect(avisoDe(issues, "C:/dev/MenuPlan-x/src/App.jsx")).toBe(null));
});
