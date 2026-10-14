import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ficherosDeGit } from "./ficherosGit.js";
import { cargarSkill } from "../scripts/lib/skills.mjs";
import {
  CAPAS_DE_LADOS,
  RUTA_LADOS,
  capaDe,
  cargarLados,
  citasDeHorizontalAVertical,
  fallosDeRegistro,
  ladoDe,
  verticales,
} from "../scripts/lib/ladosFicheros.mjs";

/**
 * El lado de cada skill, regla por carpeta, comando, spec y documento (#710, PR 8 del programa #652). Horizontal: vale
 * para cualquier proyecto; vertical: solo para HoMenu. El registro es ops/lados-ficheros.json y este test lo cruza con los
 * ficheros del repo (todo fichero de esas capas tiene su lado, y no sobra ninguno) y vigila que ninguna pieza horizontal
 * cite una vertical. Las funciones son puras y se prueban abajo con datos rotos: un test que nunca ha fallado no mide.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ficheros = ficherosDeGit(RAIZ);
const registro = cargarLados(RAIZ);
const leer = (ruta) => readFileSync(join(RAIZ, ruta), "utf8");

describe("el registro de lados, sobre el repo de hoy", () => {
  it("todo fichero de las cinco capas tiene su lado y ninguna entrada sobra", () => {
    expect(fallosDeRegistro(registro, ficheros)).toEqual([]);
  });

  it("las skills, reglas y comandos horizontales no citan nada vertical", () => {
    const citas = citasDeHorizontalAVertical(registro, ficheros, leer).filter((c) => capaDe(c.split(" → ")[0]) !== "documentos");
    expect(citas).toEqual([]);
  });

  it("la única duda es CLAUDE.md, y dice por qué (se parte en el PR 9 de #710)", () => {
    const dudas = Object.values(registro.capas).flatMap((l) => Object.entries(l)).filter(([, e]) => (typeof e === "string" ? e : e.lado) === "duda");
    expect(dudas.map(([r]) => r)).toEqual(["CLAUDE.md"]);
    expect(dudas[0][1].razon).toMatch(/PR 9/);
  });

  it("toda skill de servicio horizontal tiene su ficha de proyecto en cada proyecto con fichas", () => {
    const proyectos = readdirSync(join(RAIZ, "ops", "proyectos")).filter((p) => existsSync(join(RAIZ, "ops", "proyectos", p, "servicios")));
    expect(proyectos.length).toBeGreaterThan(0);
    const servicio = ficheros.filter((f) => capaDe(f) === "skills" && ladoDe(f, registro).lado === "horizontal")
      .map((f) => f.split("/")[2]).filter((n) => /^\s{2}tipo:\s*servicio\s*$/m.test(leer(`.claude/skills/${n}/SKILL.md`)));
    expect(servicio.length).toBeGreaterThanOrEqual(6);
    for (const p of proyectos) for (const s of servicio) expect(existsSync(join(RAIZ, "ops", "proyectos", p, "servicios", `${s}.md`)), `${s} sin ficha en ${p}`).toBe(true);
  });

  it("cada capa del proyecto de una skill la cita su ficha, y su SKILL.md no", () => {
    for (const r of registro.capas_de_skill_del_proyecto) {
      const s = r.split("/")[2];
      const skill = cargarSkill(s, RAIZ);
      expect(skill.texto, `${s} cita ${r}`).not.toContain(r);
      expect(Object.values(skill.fichas).join("\n"), `ninguna ficha de ${s} cita ${r}`).toContain(r);
    }
  });

  it("las seis skills de servicio que Pablo mandó partir (decisión 4A) son horizontales, y telegram, vertical", () => {
    for (const s of ["1password", "github", "hetzner", "tailscale", "vercel", "supabase"]) expect(ladoDe(`.claude/skills/${s}/SKILL.md`, registro).lado).toBe("horizontal");
    expect(ladoDe(".claude/skills/telegram/SKILL.md", registro).lado).toBe("vertical");
  });
});

// ---- Las funciones puras, con datos buenos y con datos rotos ---------------------------------------------------------

const REPO = [
  ".claude/skills/a/SKILL.md", ".claude/skills/a/referencias/x.md", ".claude/skills/a/referencias/proyecto.md", ".claude/skills/t/SKILL.md",
  ".claude/rules/r.md", ".claude/commands/c.md", "specs/s.md", "docs/d.md", "README.md", "ops/proyectos/p/servicios/a.md",
];
const bueno = () => ({
  capas: {
    skills: { ".claude/skills/a/SKILL.md": "horizontal", ".claude/skills/t/SKILL.md": "vertical" },
    reglas: { ".claude/rules/r.md": "vertical" },
    comandos: { ".claude/commands/c.md": "horizontal" },
    specs: { "specs/s.md": "vertical" },
    documentos: { "docs/d.md": "horizontal", "README.md": { lado: "duda", razon: "mezcla las dos cosas hasta que se parta" }, "ops/proyectos/p/servicios/a.md": "vertical" },
  },
  capas_de_skill_del_proyecto: [".claude/skills/a/referencias/proyecto.md"],
});

describe("fallosDeRegistro", () => {
  it("un registro bueno no falla", () => {
    expect(fallosDeRegistro(bueno(), REPO)).toEqual([]);
  });

  const roto = (cambia) => { const r = bueno(); cambia(r); return fallosDeRegistro(r, REPO); };
  it.each([
    ["un fichero sin lado", (r) => { delete r.capas.specs["specs/s.md"]; }, /specs\/s\.md: sin lado/],
    ["una entrada de un fichero que ya no existe", (r) => { r.capas.specs["specs/borrado.md"] = "vertical"; }, /specs\/borrado\.md.*ya no existe/],
    ["una entrada en la capa que no es", (r) => { r.capas.reglas["specs/s.md"] = "vertical"; delete r.capas.specs["specs/s.md"]; }, /en la capa «reglas»/],
    ["un lado fuera del vocabulario", (r) => { r.capas.specs["specs/s.md"] = "mixto"; }, /lado «mixto» no válido/],
    ["una duda sin razón", (r) => { r.capas.documentos["README.md"] = { lado: "duda", razon: "" }; }, /duda sin razón/],
    ["una capa desconocida", (r) => { r.capas.otras = {}; }, /capa «otras» desconocida/],
    ["una capa del proyecto que no existe", (r) => { r.capas_de_skill_del_proyecto.push(".claude/skills/a/referencias/nada.md"); }, /capa del proyecto que ya no existe/],
    ["una capa del proyecto que es SKILL.md", (r) => { r.capas_de_skill_del_proyecto.push(".claude/skills/a/SKILL.md"); }, /no es una capa/],
    ["una capa del proyecto en una skill vertical", (r) => { r.capas_de_skill_del_proyecto.push(".claude/skills/t/SKILL.md"); }, /no es una capa/],
    ["una ficha que no es vertical", (r) => { r.capas.documentos["ops/proyectos/p/servicios/a.md"] = "horizontal"; }, /una ficha de proyecto es vertical/],
  ])("falla con %s", (_que, cambia, esperado) => {
    expect(roto(cambia).join("\n")).toMatch(esperado);
  });

  it("falla con una ficha de una skill que no existe o que no es horizontal", () => {
    const f = fallosDeRegistro(bueno(), [...REPO, "ops/proyectos/p/servicios/zzz.md", "ops/proyectos/p/servicios/t.md"]);
    expect(f.join("\n")).toMatch(/zzz\.md: sin lado|no hay skill «zzz»/);
    const r = bueno();
    r.capas.documentos["ops/proyectos/p/servicios/t.md"] = "vertical";
    expect(fallosDeRegistro(r, [...REPO, "ops/proyectos/p/servicios/t.md"]).join("\n")).toMatch(/la skill t no es horizontal/);
  });
});

describe("citasDeHorizontalAVertical", () => {
  const textos = (m) => (f) => m[f] ?? "";
  it("una horizontal sin citas verticales no da nada, y una vertical puede citar lo que quiera", () => {
    const t = textos({ ".claude/skills/a/SKILL.md": "Método. Mira `docs/d.md`.", "specs/s.md": "cita `docs/d.md` y `.claude/rules/r.md`" });
    expect(citasDeHorizontalAVertical(bueno(), REPO, t)).toEqual([]);
  });

  it("una skill, un comando o un documento horizontal que cita un fichero vertical se detecta", () => {
    const t = textos({ ".claude/skills/a/SKILL.md": "Lee `specs/s.md`.", ".claude/commands/c.md": "ver .claude/rules/r.md", "docs/d.md": "ver specs/s.md" });
    expect(citasDeHorizontalAVertical(bueno(), REPO, t)).toEqual([
      ".claude/commands/c.md → .claude/rules/r.md",
      ".claude/skills/a/SKILL.md → specs/s.md",
      "docs/d.md → specs/s.md",
    ]);
  });

  it("una referencia vertical dentro de una skill horizontal cuenta como vertical, y la skill no puede citarla", () => {
    const t = textos({ ".claude/skills/a/SKILL.md": "Detalle: .claude/skills/a/referencias/proyecto.md" });
    expect(citasDeHorizontalAVertical(bueno(), REPO, t)).toEqual([".claude/skills/a/SKILL.md → .claude/skills/a/referencias/proyecto.md"]);
  });

  it("citar una skill vertical por su nombre también cuenta; su ficha, al ser vertical, puede citar lo que sea", () => {
    const t = textos({ ".claude/skills/a/referencias/x.md": "Antes, la skill `t`.", "ops/proyectos/p/servicios/a.md": "ver specs/s.md y .claude/skills/a/referencias/proyecto.md" });
    expect(citasDeHorizontalAVertical(bueno(), REPO, t)).toEqual([".claude/skills/a/referencias/x.md → skill t"]);
  });

  it("verticales() reúne las capas, las capas del proyecto y las fichas", () => {
    expect([...verticales(bueno())].sort()).toEqual([".claude/rules/r.md", ".claude/skills/a/referencias/proyecto.md", ".claude/skills/t/SKILL.md", "ops/proyectos/p/servicios/a.md", "specs/s.md"]);
  });
});

describe("las capas", () => {
  it("capaDe reconoce las cinco capas y deja fuera lo demás", () => {
    expect(CAPAS_DE_LADOS).toEqual(["skills", "reglas", "comandos", "specs", "documentos"]);
    expect(capaDe(".claude/skills/x/SKILL.md")).toBe("skills");
    expect(capaDe(".claude/skills/x/referencias/y.md")).toBeNull();
    expect(capaDe(".claude/rules/x.md")).toBe("reglas");
    expect(capaDe(".claude/commands/x.md")).toBe("comandos");
    expect(capaDe("specs/x.md")).toBe("specs");
    expect(capaDe("docs/ops/x.md")).toBe("documentos");
    expect(capaDe("README.md")).toBe("documentos");
    expect(capaDe("ops/proyectos/homenu/servicios/github.md")).toBe("documentos");
    expect(capaDe("ops/proyectos/homenu/normas.json")).toBeNull();
    expect(capaDe("src/App.jsx")).toBeNull();
  });

  it("el registro existe donde dicen los demás", () => {
    expect(RUTA_LADOS).toBe("ops/lados-ficheros.json");
  });
});
