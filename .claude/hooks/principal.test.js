import { describe, expect, it } from "vitest";

import { avisoTrasAdelantar, planAdelantar } from "./principal.mjs";

describe("la carpeta principal se adelanta al arrancar (#192)", () => {
  const base = { esWorktree: false, rama: "staging", detras: "3", sucio: "" };
  it("principal en staging, limpia y atrasada: se adelanta", () => expect(planAdelantar(base)).toEqual({ adelantar: true, aviso: null }));
  it.each([
    ["un worktree", { esWorktree: true }],
    ["otra rama", { rama: "ops/x" }],
    ["al día", { detras: "0" }],
    ["sin saber el atraso", { detras: null }],
  ])("%s: ni se toca ni se avisa", (_, cambio) => expect(planAdelantar({ ...base, ...cambio })).toEqual({ adelantar: false, aviso: null }));
  it("con cambios sin guardar: no se toca y se avisa", () => {
    const r = planAdelantar({ ...base, sucio: " M src/App.jsx" });
    expect(r.adelantar).toBe(false);
    expect(r.aviso).toMatch(/cambios sin guardar/);
  });
  it("sin poder leer el estado: no se toca y se avisa", () => expect(planAdelantar({ ...base, sucio: null }).adelantar).toBe(false));

  it("dice si cambian los hooks y si hace falta abrir sesión nueva", () => {
    expect(avisoTrasAdelantar("2", ["src/App.jsx"])).toBe("Carpeta principal adelantada 2 commits hasta origin/staging.");
    expect(avisoTrasAdelantar("2", [".claude/hooks/guardia.mjs"])).toMatch(/guardia\.mjs: los hooks ya corren con la versión nueva\.$/);
    expect(avisoTrasAdelantar("2", [".claude/settings.json"])).toMatch(/próxima sesión/);
    expect(avisoTrasAdelantar("2", [".claude/hooks/guardia.test.js"])).toBe("Carpeta principal adelantada 2 commits hasta origin/staging.");
  });
});
