import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CAMPOS_ENCARGO, ESCALONES_AUTOMATICOS, formatoEncargoMd, plantillaEncargo } from "./lib/issues.mjs";
import { CATALOGO as MECANISMOS, ESCALONES } from "./lib/mecanismos.mjs";

/**
 * El formato de un encargo (#338): una sola fuente (`CAMPOS_ENCARGO` de
 * scripts/lib/issues.mjs) y tres sitios que la enseñan sin copiarla a mano:
 *   - docs/ops/ENCARGO.md, generado (`npm run flujo -- --escribir`);
 *   - el formulario .github/ISSUE_TEMPLATE/3-encargo.yml, con la misma plantilla;
 *   - las skills de oficio, que citan ENCARGO.md y no repiten su tabla.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => readFileSync(join(RAIZ, r), "utf8").replace(/\r\n/g, "\n");
const SKILLS_DE_OFICIO = ["causa-raiz", "plan-de-arreglo"];

describe("la referencia común del encargo", () => {
  it("docs/ops/ENCARGO.md es lo que genera issues.mjs", () => {
    expect(leer("docs/ops/ENCARGO.md"), "Regenera con `npm run flujo -- --escribir`").toBe(formatoEncargoMd());
  });

  it("el formulario de encargo lleva la misma plantilla", () => {
    const form = leer(".github/ISSUE_TEMPLATE/3-encargo.yml");
    const sangrada = plantillaEncargo().split("\n").map((l) => `        ${l}`).join("\n");
    expect(form, "Copia la plantilla de plantillaEncargo() en el campo «ficha» de 3-encargo.yml").toContain(sangrada);
  });

  it("los escalones automáticos son de la escalera y los dos primeros", () => {
    expect(ESCALONES_AUTOMATICOS).toEqual(ESCALONES.slice(0, ESCALONES_AUTOMATICOS.length));
  });

  it("las claves no repiten lo que se deduce (el escalón sale del mecanismo)", () => {
    const claves = CAMPOS_ENCARGO.map((c) => c.clave);
    expect(claves).not.toContain("escalon");
    expect(claves).not.toContain("automatico");
    expect(new Set(claves).size).toBe(claves.length);
    // Y lo que cita existe: el catálogo de mecanismos del que sale el escalón.
    expect(MECANISMOS.mecanismos.length).toBeGreaterThan(0);
  });

  it.each(SKILLS_DE_OFICIO)("la skill %s cita ENCARGO.md y no copia su tabla", (nombre) => {
    const ruta = `.claude/skills/${nombre}/SKILL.md`;
    const texto = existsSync(join(RAIZ, ruta)) ? leer(ruta) : "";
    expect(texto).toContain("docs/ops/ENCARGO.md");
    const filas = formatoEncargoMd().split("\n").filter((l) => l.startsWith("| `"));
    expect(filas.filter((f) => texto.includes(f)), "La tabla vive en docs/ops/ENCARGO.md: cítala").toEqual([]);
    expect(texto.includes(plantillaEncargo()), "La plantilla vive en docs/ops/ENCARGO.md: cítala").toBe(false);
  });

  it("ninguna otra skill copia la plantilla", () => {
    const skills = readdirSync(join(RAIZ, ".claude/skills"));
    const copian = skills.filter((s) => existsSync(join(RAIZ, ".claude/skills", s, "SKILL.md")) && leer(`.claude/skills/${s}/SKILL.md`).includes(plantillaEncargo()));
    expect(copian).toEqual([]);
  });
});
