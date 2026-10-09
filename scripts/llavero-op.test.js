import { describe, expect, it } from "vitest";
import { LLAVERO } from "./lib/env.mjs";
import { ordenGuardar, ordenLeer, pareceToken } from "./llavero-op.mjs";

// El token de la service account entra al llavero por stdin (#299): ni la
// orden de PowerShell ni ningún argumento lo llevan.
describe("llavero-op", () => {
  it("guarda y relee en el mismo sitio del que lee env.mjs", () => {
    for (const orden of [ordenGuardar(), ordenLeer()]) {
      expect(orden).toContain(`'${LLAVERO.recurso}', '${LLAVERO.usuario}'`);
    }
  });

  it("el token sale de stdin, no de la orden", () => {
    expect(ordenGuardar()).toContain("[Console]::In.ReadToEnd()");
    expect(ordenGuardar()).not.toMatch(/ops_/);
  });

  it("sustituye al que hubiera antes de añadir (si no, Add falla con uno ya guardado)", () => {
    const o = ordenGuardar();
    expect(o.indexOf("$v.Remove(")).toBeGreaterThan(-1);
    expect(o.indexOf("$v.Remove(")).toBeLessThan(o.indexOf("$v.Add("));
  });

  it("solo acepta lo que parece un token: un error de op no acaba en el llavero", () => {
    expect(pareceToken(`ops_${"a".repeat(40)}`)).toBe(true);
    expect(pareceToken("[ERROR] 2026/10/09 connecting to desktop app timed out")).toBe(false);
    expect(pareceToken("")).toBe(false);
    expect(pareceToken(`ops_${"a".repeat(10)} y algo más`)).toBe(false);
  });
});
