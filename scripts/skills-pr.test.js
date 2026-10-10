import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AVISO_ANTES_DIAS, PLAZO_COMPROBADO_DIAS, RAIZ, caducidad, caducidades, comprobarSkillsPr, skillsTocadas,
} from "./lib/skills.mjs";

/**
 * La caducidad de las skills (#336): falla solo en el PR que toca una skill
 * caducada (paso «Skills del PR» del CI), avisa en local y se mide cada semana.
 */

const conFecha = (f) => `---\nname: x\ndescription: d\nmetadata:\n  tipo: herramienta\n  comprobado: ${f}\n---\n# X\n`;
const HOY = new Date("2026-10-10T12:00:00Z");
const haceDias = (n) => new Date(HOY.getTime() - n * 86_400_000).toISOString().slice(0, 10);

describe("caducidad", () => {
  it("vigente, próxima a menos de 14 días, caducada pasado el plazo", () => {
    expect(caducidad(conFecha(haceDias(0)), HOY).estado).toBe("vigente");
    expect(caducidad(conFecha(haceDias(PLAZO_COMPROBADO_DIAS - AVISO_ANTES_DIAS)), HOY).estado).toBe("vigente");
    expect(caducidad(conFecha(haceDias(PLAZO_COMPROBADO_DIAS - AVISO_ANTES_DIAS + 1)), HOY).estado).toBe("proxima");
    expect(caducidad(conFecha(haceDias(PLAZO_COMPROBADO_DIAS)), HOY).estado).toBe("proxima");
    expect(caducidad(conFecha(haceDias(PLAZO_COMPROBADO_DIAS + 1)), HOY).estado).toBe("caducada");
  });
  it("sin fecha o con una fecha mal escrita, «sin_fecha»", () => {
    expect(caducidad("# sin frontmatter", HOY).estado).toBe("sin_fecha");
    expect(caducidad(conFecha("9 oct"), HOY).estado).toBe("sin_fecha");
  });
  it("las skills del repo, hoy, están todas vigentes", () => {
    expect(caducidades(RAIZ).filter((e) => e.estado !== "vigente")).toEqual([]);
  });
});

describe("el PR", () => {
  const estados = [
    { nombre: "vieja", comprobado: "2026-01-01", dias: 282, estado: "caducada" },
    { nombre: "casi", comprobado: "2026-07-10", dias: 80, estado: "proxima" },
    { nombre: "nueva", comprobado: "2026-10-09", dias: 1, estado: "vigente" },
    { nombre: "rota", comprobado: null, dias: null, estado: "sin_fecha" },
  ];
  it("saca las skills tocadas de las rutas, también con barras de Windows", () => {
    expect(skillsTocadas([".claude/skills/vieja/SKILL.md", ".claude\\skills\\casi\\casos.json", ".claude/skills.test.js", "src/x.js"])).toEqual(["casi", "vieja"]);
  });
  it("una caducada que el PR no toca no cuenta", () => {
    expect(comprobarSkillsPr(["src/App.jsx", ".claude/skills/nueva/SKILL.md"], estados).ok).toBe(true);
  });
  it("una caducada o sin fecha que el PR toca, falla; una próxima, no", () => {
    expect(comprobarSkillsPr([".claude/skills/vieja/referencias/a.md"], estados).faltas.map((f) => f.regla)).toEqual(["caducada"]);
    expect(comprobarSkillsPr([".claude/skills/rota/SKILL.md"], estados).ok).toBe(false);
    expect(comprobarSkillsPr([".claude/skills/casi/SKILL.md"], estados).ok).toBe(true);
  });
  it("una skill que el PR borra no falla", () => {
    expect(comprobarSkillsPr([".claude/skills/borrada/SKILL.md"], estados).ok).toBe(true);
  });
});

describe("el script", () => {
  const correr = (...a) => spawnSync(process.execPath, [join(RAIZ, "scripts/skills-pr.mjs"), ...a], { encoding: "utf8" });
  const lista = (lineas) => {
    const f = join(mkdtempSync(join(tmpdir(), "skills-pr-")), "ficheros.txt");
    writeFileSync(f, lineas.join("\n"));
    return f;
  };
  it("sin lista (en local) avisa y no falla", () => {
    const r = correr();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Sin lista de ficheros no falla");
  });
  it("con la lista de un PR que toca skills vigentes, ok y una línea por skill", () => {
    const r = correr(lista([".claude/skills/github/SKILL.md", "src/App.jsx"]));
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toMatch(/skills-pr skill: github comprobado: \d{4}-\d{2}-\d{2} dias: \d+ estado: vigente/);
  });
  it("una lista vacía (no se pudo listar) no bloquea", () => {
    expect(correr(lista([])).status).toBe(0);
  });
});
