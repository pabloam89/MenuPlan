import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ficherosDeGit } from "./ficherosGit.js";
import { cargarSkill } from "../scripts/lib/skills.mjs";
import {
  CAPAS_DE_LADOS,
  RUTA_LADOS,
  capaDe,
  capasDelProyectoConId,
  cargarLados,
  citasDeHorizontalAVertical,
  fallosDeRegistro,
  fallosDeServicios,
  ladoDe,
  skillDe,
  skillsDeServicio,
  skillsVerticales,
  verticales,
} from "../scripts/lib/ladosFicheros.mjs";

/**
 * El lado de cada skill, regla por carpeta, comando, spec y documento (#710, PR 8 del programa #652). Horizontal: vale
 * para cualquier proyecto; vertical: solo para un proyecto, que dice con `project: <id>` (un id de la lista única). El registro es ops/lados-ficheros.json y este test lo cruza con los
 * ficheros del repo (todo fichero de esas capas tiene su lado, y no sobra ninguno) y vigila que ninguna pieza horizontal
 * cite una vertical. Las funciones son puras y se prueban abajo con datos rotos: un test que nunca ha fallado no mide.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ficheros = ficherosDeGit(RAIZ);
const registro = cargarLados(RAIZ);
const leer = (ruta) => readFileSync(join(RAIZ, ruta), "utf8");

// Los proyectos salen de la lista única (`projects` de ops/entidades.json): ningún test de este fichero escribe un id.
const proyectos = JSON.parse(readFileSync(join(RAIZ, "ops", "entidades.json"), "utf8")).projects;
const ids = proyectos.map((p) => p.id);
const servicio = skillsDeServicio(registro, ficheros, leer);

describe("el registro de lados, sobre el repo de hoy", () => {
  it("todo fichero de las cinco capas tiene su lado, ninguna entrada sobra y todo vertical dice de qué proyecto es", () => {
    expect(fallosDeRegistro(registro, ficheros, ids)).toEqual([]);
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

  it("cada proyecto de la lista tiene la ficha de cada servicio que declara, sin fichas ni skills de servicio huérfanas", () => {
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(servicio.length).toBeGreaterThanOrEqual(6);
    expect(fallosDeServicios(proyectos, ficheros, servicio)).toEqual([]);
    // Recorre todos los proyectos: una carpeta de ops/proyectos que no es de la lista también es un fallo.
    const carpetas = readdirSync(join(RAIZ, "ops", "proyectos"));
    expect(carpetas.filter((c) => !ids.includes(c))).toEqual([]);
  });

  it("cada capa del proyecto de una skill la cita la ficha de SU proyecto, y su SKILL.md no", () => {
    for (const [r, id] of Object.entries(capasDelProyectoConId(registro))) {
      const s = skillDe(r);
      const skill = cargarSkill(s, RAIZ);
      expect(skill.texto, `${s} cita ${r}`).not.toContain(r);
      const ficha = skill.fichas[`ops/proyectos/${id}/servicios/${s}.md`];
      expect(ficha, `${s} no tiene ficha en el proyecto ${id}, dueño de ${r}`).toBeTypeOf("string");
      expect(ficha, `la ficha de ${s} en ${id} no cita ${r}`).toContain(r);
    }
  });

  it("las skills de servicio son horizontales; las verticales no son de servicio", () => {
    for (const s of servicio) expect(ladoDe(`.claude/skills/${s}/SKILL.md`, registro).lado).toBe("horizontal");
    for (const s of skillsVerticales(registro)) expect(servicio, s).not.toContain(s);
  });
});

// ---- Las funciones puras, con datos buenos y con datos rotos ---------------------------------------------------------

const REPO = [
  ".claude/skills/a/SKILL.md", ".claude/skills/a/referencias/x.md", ".claude/skills/a/referencias/proyecto.md", ".claude/skills/t/SKILL.md",
  ".claude/rules/r.md", ".claude/commands/c.md", "specs/s.md", "docs/d.md", "README.md", "ops/proyectos/p/servicios/a.md",
];
const V = { lado: "vertical", project: "p" };
const bueno = () => ({
  capas: {
    skills: { ".claude/skills/a/SKILL.md": "horizontal", ".claude/skills/t/SKILL.md": V },
    reglas: { ".claude/rules/r.md": V },
    comandos: { ".claude/commands/c.md": "horizontal" },
    specs: { "specs/s.md": V },
    documentos: { "docs/d.md": "horizontal", "README.md": { lado: "duda", razon: "mezcla las dos cosas hasta que se parta" } },
  },
  capas_de_skill_del_proyecto: { ".claude/skills/a/referencias/proyecto.md": "p" },
});
const IDS = ["p", "q"];

describe("fallosDeRegistro", () => {
  it("un registro bueno no falla", () => {
    expect(fallosDeRegistro(bueno(), REPO, IDS)).toEqual([]);
  });

  const roto = (cambia) => { const r = bueno(); cambia(r); return fallosDeRegistro(r, REPO, IDS); };
  it.each([
    ["un fichero sin lado", (r) => { delete r.capas.specs["specs/s.md"]; }, /specs\/s\.md: sin lado/],
    ["una entrada de un fichero que ya no existe", (r) => { r.capas.specs["specs/borrado.md"] = V; }, /specs\/borrado\.md.*ya no existe/],
    ["una entrada en la capa que no es", (r) => { r.capas.reglas["specs/s.md"] = V; delete r.capas.specs["specs/s.md"]; }, /en la capa «reglas»/],
    ["un lado fuera del vocabulario", (r) => { r.capas.specs["specs/s.md"] = "mixto"; }, /lado «mixto» no válido/],
    ["una duda sin razón", (r) => { r.capas.documentos["README.md"] = { lado: "duda", razon: "" }; }, /duda sin razón/],
    ["una capa desconocida", (r) => { r.capas.otras = {}; }, /capa «otras» desconocida/],
    ["una capa del proyecto que no existe", (r) => { r.capas_de_skill_del_proyecto[".claude/skills/a/referencias/nada.md"] = "p"; }, /capa del proyecto que ya no existe/],
    ["una capa del proyecto que es SKILL.md", (r) => { r.capas_de_skill_del_proyecto[".claude/skills/a/SKILL.md"] = "p"; }, /no es una capa/],
    ["una capa del proyecto en una skill vertical", (r) => { r.capas_de_skill_del_proyecto[".claude/skills/t/SKILL.md"] = "p"; }, /no es una capa/],
    ["un vertical sin project", (r) => { r.capas.specs["specs/s.md"] = { lado: "vertical" }; }, /vertical sin `project`/],
    ["un vertical de un proyecto que no está en la lista", (r) => { r.capas.specs["specs/s.md"] = { lado: "vertical", project: "zzz" }; }, /project «zzz» no está en la lista de proyectos/],
    ["un horizontal con project", (r) => { r.capas.documentos["docs/d.md"] = { lado: "horizontal", project: "p" }; }, /solo lo vertical es de un proyecto/],
    ["una capa del proyecto de un proyecto que no existe", (r) => { r.capas_de_skill_del_proyecto[".claude/skills/a/referencias/proyecto.md"] = "zzz"; }, /capa del proyecto «zzz», que no está en la lista/],
    ["una ficha listada en el registro (se deduce de la ruta)", (r) => { r.capas.documentos["ops/proyectos/p/servicios/a.md"] = V; }, /una ficha de proyecto no se lista/],
  ])("falla con %s", (_que, cambia, esperado) => {
    expect(roto(cambia).join("\n")).toMatch(esperado);
  });

  it("falla con una ficha de una skill que no existe, que no es horizontal o de una carpeta que no es un proyecto", () => {
    const f = fallosDeRegistro(bueno(), [...REPO, "ops/proyectos/p/servicios/zzz.md", "ops/proyectos/p/servicios/t.md"], IDS);
    expect(f.join("\n")).toMatch(/no hay skill «zzz»/);
    expect(f.join("\n")).toMatch(/la skill t no es horizontal/);
    expect(fallosDeRegistro(bueno(), [...REPO, "ops/proyectos/otro/servicios/a.md"], IDS).join("\n")).toMatch(/la carpeta «otro» no es un proyecto de la lista/);
  });
});

describe("fallosDeServicios: recorre TODOS los proyectos de la lista", () => {
  const FICHAS = ["ops/proyectos/p/servicios/a.md", "ops/proyectos/q/servicios/a.md", "ops/proyectos/q/servicios/b.md"];
  const buenos = () => [{ id: "p", servicios: ["a"] }, { id: "q", servicios: ["a", "b"] }];
  it("proyectos con sus fichas no fallan, y un proyecto sin servicios tampoco", () => {
    expect(fallosDeServicios(buenos(), FICHAS, ["a", "b"])).toEqual([]);
    expect(fallosDeServicios([...buenos(), { id: "r" }], FICHAS, ["a", "b"])).toEqual([]);
  });
  it.each([
    ["un servicio declarado sin su ficha (en el segundo proyecto, no en el primero)", (p) => { p[1].servicios.push("c"); }, ["a", "b", "c"], FICHAS, /proyecto q: el servicio «c» no tiene su ficha/],
    ["un proyecto nuevo de la lista que declara un servicio sin ficha", (p) => { p.push({ id: "r", servicios: ["a"] }); }, ["a", "b"], FICHAS, /proyecto r: el servicio «a» no tiene su ficha/],
    ["una ficha sin servicio declarado", (p) => { p[1].servicios = ["a"]; }, ["a", "b"], FICHAS, /servicios\/b\.md: ficha sin servicio declarado/],
    ["una ficha en una carpeta que no es un proyecto", () => {}, ["a", "b"], [...FICHAS, "ops/proyectos/z/servicios/a.md"], /la carpeta «z» no es un proyecto de la lista/],
    ["un servicio declarado que no es una skill de servicio", (p) => { p[0].servicios.push("zzz"); }, ["a", "b"], FICHAS, /declara el servicio «zzz»/],
    ["una skill de servicio que ningún proyecto usa", () => {}, ["a", "b", "c"], FICHAS, /skill de servicio «c»: ningún proyecto la usa/],
    ["servicios repetidos", (p) => { p[0].servicios = ["a", "a"]; }, ["a", "b"], FICHAS, /sin repetidos/],
  ])("falla con %s", (_que, cambia, servicio, ficheros, esperado) => {
    const p = buenos();
    cambia(p);
    expect(fallosDeServicios(p, ficheros, servicio).join("\n")).toMatch(esperado);
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
    expect([...verticales(bueno(), REPO)].sort()).toEqual([".claude/rules/r.md", ".claude/skills/a/referencias/proyecto.md", ".claude/skills/t/SKILL.md", "ops/proyectos/p/servicios/a.md", "specs/s.md"]);
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
    expect(capaDe("ops/proyectos/p/servicios/github.md")).toBe("documentos");
    expect(capaDe("ops/proyectos/p/normas.json")).toBeNull();
    expect(capaDe("src/App.jsx")).toBeNull();
  });

  it("el registro existe donde dicen los demás", () => {
    expect(RUTA_LADOS).toBe("ops/lados-ficheros.json");
  });
});

describe("ladoDe de una ficha", () => {
  it("una ficha es vertical y su proyecto es el de su carpeta, sin estar en el registro", () => {
    expect(ladoDe("ops/proyectos/p/servicios/a.md", bueno())).toMatchObject({ lado: "vertical", project: "p" });
    expect(ladoDe("specs/s.md", bueno())).toMatchObject({ lado: "vertical", project: "p" });
    expect(ladoDe("docs/d.md", bueno())).toMatchObject({ lado: "horizontal", project: undefined });
  });
});
