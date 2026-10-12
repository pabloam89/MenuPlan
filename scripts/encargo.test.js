import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CAMPOS_COMUNES_ENCARGO, CAMPOS_ENCARGO, ENCARGO_N1_DESDE, ESCALONES_AUTOMATICOS, conCamposN1, formatoEncargoMd, plantillaEncargo } from "./lib/issues.mjs";
import { CATALOGO as MECANISMOS, ESCALONES } from "./lib/mecanismos.mjs";
import { conTiposN1 } from "./lib/tiposDeEncargo.mjs";

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

describe("el N1 del encargo (docs/entidades/N1-encargo.md, #640)", () => {
  const n1 = leer("docs/entidades/N1-encargo.md");
  const vida = JSON.parse(leer("ops/vocabularios-vida.json"));

  it("las tablas de campos son las que genera issues.mjs", () => {
    expect(conCamposN1(n1), "Regenera con `npm run flujo -- --escribir`").toBe(n1);
    expect(() => conCamposN1("sin marcas")).toThrow(/marcas/);
  });

  it("la prosa de tipos y banderas del §4 es la que sale del JSON, y el documento no habla de idioma pendiente", () => {
    expect(conTiposN1(n1), "Regenera con `npm run flujo -- --escribir`").toBe(n1);
    expect(n1).not.toMatch(/## Idioma|pendiente de Pablo/);
  });

  it("cada campo común apunta a una clave del bloque o dice que se deduce, y no hay dos con el mismo nombre", () => {
    const claves = CAMPOS_ENCARGO.map((c) => c.clave);
    for (const c of CAMPOS_COMUNES_ENCARGO) if (c.clave !== null) expect(claves, c.campo).toContain(c.clave);
    expect(new Set(CAMPOS_COMUNES_ENCARGO.map((c) => c.campo)).size).toBe(CAMPOS_COMUNES_ENCARGO.length);
    expect(CAMPOS_COMUNES_ENCARGO.map((c) => c.campo)).toEqual(["id", "tipo", "subtipo", "ámbitos", "alcance", "complejidad", "constructor", "jueces", "estado"]);
  });

  it("los campos nuevos son opcionales para lo anterior a ENCARGO_N1_DESDE y el documento lo dice", () => {
    const nuevos = CAMPOS_ENCARGO.filter((c) => c.desde);
    expect(nuevos.map((c) => c.clave)).toEqual(["assignment_type", "subtype", "complexity"]);
    for (const c of nuevos) {
      expect(c.desde).toBe(ENCARGO_N1_DESDE);
      expect(c.obligatorio).toContain(ENCARGO_N1_DESDE);
    }
    expect(n1).toContain("opcionales para los encargos abiertos antes del");
    expect(n1).toContain("13 oct 2026");
  });

  it("ENCARGO_N1_DESDE no es anterior al día en que nació el N1 (si lo fuera, los campos serían obligatorios con carácter retroactivo)", () => {
    expect(ENCARGO_N1_DESDE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    let nacio = "";
    try {
      nacio = execFileSync("git", ["log", "--diff-filter=A", "--format=%cs", "-1", "--", "docs/entidades/N1-encargo.md"], { cwd: RAIZ, encoding: "utf8", windowsHide: true }).trim();
    } catch {
      // sin git (o sin historia): no se puede comprobar aquí
    }
    if (nacio) expect(ENCARGO_N1_DESDE >= nacio, `${ENCARGO_N1_DESDE} es anterior a ${nacio}`).toBe(true);
    // Y no es un día que ya pasó respecto a la fecha del propio campo: todo `desde` es el mismo.
    for (const c of CAMPOS_ENCARGO.filter((x) => x.desde)) expect(c.desde).toBe(ENCARGO_N1_DESDE);
  });

  it("lleva las secciones de la plantilla N1, en orden, y cita los principios de N0 por su número", () => {
    const orden = ["## 1. Qué hereda de N0", "## 2. Id", "## 3. Campos", "## 4. Vocabularios", "## 5. Ciclo de vida", "## 6. Registro", "## 7. Controles", "## 8. Plantilla para las demás entidades"];
    const posiciones = orden.map((t) => n1.indexOf(t));
    expect(posiciones.every((p) => p >= 0), orden.filter((t, i) => posiciones[i] < 0).join(", ")).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
    for (const n of [1, 3, 4, 5, 6, 7, 8, 11, 12]) expect(n1, `N0 §${n}`).toMatch(new RegExp(`\\| ${n}[ ,]|N0 §${n}\\b`));
  });

  it("cada vocabulario `encargo.*` anclado está en el documento, y los que cita existen", () => {
    for (const id of Object.keys(vida.anclados).filter((v) => v.startsWith("encargo."))) expect(n1, id).toContain(`\`${id}\``);
    const citados = [...n1.matchAll(/^\| `([a-z]+\.[a-z_]+)` \|/gm)].map((m) => m[1]);
    expect(citados.length).toBeGreaterThanOrEqual(6);
    for (const id of citados) expect(Object.keys(vida.anclados), id).toContain(id);
  });

  it("la entidad encargo de ops/entidades.json remite a su N1", () => {
    const entidades = JSON.parse(leer("ops/entidades.json"));
    expect(entidades.entities.find((e) => e.id === "assignment").note).toContain("docs/entidades/N1-encargo.md");
  });
});
