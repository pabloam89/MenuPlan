import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { decidirWorkflows, nombraASeguridad, workflowsDelPr } from "./workflows-pr.mjs";

const SCRIPT = fileURLToPath(new URL("./workflows-pr.mjs", import.meta.url));

describe("workflows-pr: un PR que cambia un workflow lleva a seguridad en «Jueces:» (#878)", () => {
  it("solo cuentan las rutas de .github/workflows/", () => {
    expect(workflowsDelPr([".github/workflows/vigia-lola.yml", ".github/dependabot.yml", "scripts/vigia.mjs", ""])).toEqual([".github/workflows/vigia-lola.yml"]);
  });

  it("sin workflows en el PR, pasa sin mirar el cuerpo", () => {
    expect(decidirWorkflows({ rutas: ["src/App.jsx"], cuerpo: "", autor: "homenu-sesiones[bot]" }).resultado).toBe("ok");
  });

  it("con un workflow y sin seguridad, falla", () => {
    expect(decidirWorkflows({ rutas: [".github/workflows/tests.yml"], cuerpo: "Jueces: revisor", autor: "homenu-sesiones[bot]" }).resultado).toBe("falla");
    expect(decidirWorkflows({ rutas: [".github/workflows/tests.yml"], cuerpo: "", autor: "pabloam89" }).resultado).toBe("falla");
  });

  it("con un workflow y seguridad en «Jueces:», pasa", () => {
    expect(decidirWorkflows({ rutas: [".github/workflows/tests.yml"], cuerpo: "Agente: constructor\nJueces: revisor, seguridad", autor: "homenu-sesiones[bot]" }).resultado).toBe("ok");
  });

  it("solo Dependabot queda fuera; la App de las sesiones, no", () => {
    expect(decidirWorkflows({ rutas: [".github/workflows/tests.yml"], cuerpo: "", autor: "dependabot[bot]" }).resultado).toBe("exento");
    expect(decidirWorkflows({ rutas: [".github/workflows/tests.yml"], cuerpo: "", autor: "homenu-sesiones[bot]" }).resultado).toBe("falla");
    expect(decidirWorkflows({ rutas: [".github/workflows/tests.yml"], cuerpo: "", autor: "dependabot" }).resultado).toBe("falla");
  });

  it("el nombre dentro de otra palabra, de un comentario o de un bloque de código no cuenta", () => {
    expect(nombraASeguridad("Jueces: revisor (no seguridad)")).toBe(false);
    expect(nombraASeguridad("Jueces: inseguridad")).toBe(false);
    expect(nombraASeguridad("<!-- Jueces: seguridad -->\nJueces: revisor")).toBe(false);
    expect(nombraASeguridad("<!-- sin cerrar\nJueces: seguridad")).toBe(false);
    expect(nombraASeguridad("```\nJueces: seguridad\n```\nJueces: revisor")).toBe(false);
    expect(nombraASeguridad("~~~\nJueces: seguridad\n~~~\nJueces: revisor")).toBe(false);
    expect(nombraASeguridad("Los jueces: seguridad lo mira")).toBe(false);
    expect(nombraASeguridad("Jueces: seguridadx")).toBe(false);
  });

  it("un juez pendiente no es un visto bueno", () => {
    expect(nombraASeguridad("Jueces: revisor, seguridad (pendiente)")).toBe(false);
    expect(nombraASeguridad("Jueces: seguridad — falta")).toBe(false);
    expect(nombraASeguridad("Jueces: seguridad sin juzgar")).toBe(false);
  });

  it("la nota se mira en toda la línea «Jueces:» y en plural: falla cerrado (juicio del revisor del PR #880)", () => {
    expect(nombraASeguridad("Jueces: seguridad, sin juzgar")).toBe(false);
    expect(nombraASeguridad("Jueces: revisor y seguridad (pendientes)")).toBe(false);
    expect(nombraASeguridad("Jueces: revisor y seguridad, pendientes")).toBe(false);
    expect(nombraASeguridad("Jueces: revisor, seguridad; faltan los dos")).toBe(false);
    expect(nombraASeguridad("Jueces: revisor y seguridad — falta")).toBe(false);
    // Otra línea «Jueces:» sin nota sí cuenta: cada línea se juzga entera, por su cuenta.
    expect(nombraASeguridad("Jueces: seguridad (pendiente)\nJueces: revisor, seguridad")).toBe(true);
  });

  it("los scripts de estas dos comprobaciones también piden a seguridad (si no, el PR podría desactivarlas)", () => {
    expect(workflowsDelPr(["scripts/workflows-pr.mjs", "scripts/migraciones-pr.mjs", "scripts/workflows-pr.test.js"])).toEqual(["scripts/workflows-pr.mjs", "scripts/migraciones-pr.mjs"]);
    expect(decidirWorkflows({ rutas: ["scripts/workflows-pr.mjs"], cuerpo: "Jueces: revisor", autor: "homenu-sesiones[bot]" }).resultado).toBe("falla");
    expect(decidirWorkflows({ rutas: ["scripts/migraciones-pr.mjs"], cuerpo: "Jueces: revisor, seguridad", autor: "homenu-sesiones[bot]" }).resultado).toBe("ok");
  });

  it("las formas de siempre cuentan", () => {
    expect(nombraASeguridad("Jueces: revisor y seguridad")).toBe(true);
    expect(nombraASeguridad("- Jueces: Seguridad; revisor")).toBe(true);
    expect(nombraASeguridad("**Jueces:** revisor, `seguridad`")).toBe(true);
    expect(nombraASeguridad("Jueces: revisor y seguridad.")).toBe(true);
    expect(nombraASeguridad("Jueces: seguridad (OK, 19 oct)")).toBe(true);
    expect(nombraASeguridad("Jueces: revisor\r\nJueces: seguridad")).toBe(true);
  });

  it("la línea de comandos sale con 1 y su línea contable cuando falta", () => {
    const dir = mkdtempSync(join(tmpdir(), "workflows-pr-"));
    const lista = join(dir, "ficheros.txt");
    writeFileSync(lista, ".github/workflows/vigia-lola.yml\nscripts/vigia.mjs\n");
    const corre = (cuerpo) => spawnSync(process.execPath, [SCRIPT, lista], { encoding: "utf8", env: { ...process.env, PR_BODY: cuerpo, PR_AUTOR: "homenu-sesiones[bot]" } });
    const mal = corre("Jueces: revisor");
    expect(mal.status).toBe(1);
    expect(mal.stdout).toContain("workflows-pr resultado: falla");
    const bien = corre("Jueces: revisor, seguridad");
    expect(bien.status).toBe(0);
    expect(bien.stdout).toContain("workflows-pr resultado: ok");
  });
});
