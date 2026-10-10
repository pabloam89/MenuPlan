import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GRUPOS, agenteDe, avisoDeArranque, debeReabrir, etiquetas, etiquetasDeFormulario, etiquetasQueFaltan, etiquetasSobrantes,
  faltas, ficherosNombrados, fondoDeFormulario, issuesQueNombran, justificaPuntual, leerIssue, medirCasos, parecidos, resumen,
} from "./lib/issues.mjs";
import { analizarCasos } from "../.claude/hooks/casos.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLANTILLAS = join(RAIZ, ".github", "ISSUE_TEMPLATE");
const leer = (...p) => readFileSync(join(RAIZ, ...p), "utf8");

/** Desplegables de un formulario: { titulo: [primera palabra de cada opción] }. */
function desplegables(yml) {
  const out = {};
  for (const bloque of yml.split(/\n {2}- type: /).filter((b) => b.startsWith("dropdown"))) {
    const titulo = /\n\s+label: "?([^"\n]+)"?/.exec(bloque)[1].trim();
    out[titulo] = [...bloque.matchAll(/\n\s+- "([\w-]+) — /g)].map((m) => m[1]);
  }
  return out;
}

// Un nodo como lo devuelve la consulta GraphQL.
const nodo = (labels, extra = {}) => ({
  id: "x", number: 7, title: "x", state: "OPEN", createdAt: "2026-10-01T00:00:00Z", closedAt: null, body: "",
  labels: { nodes: labels.map((name) => ({ name })) },
  assignees: { nodes: [] }, reaperturas: { totalCount: 0 }, closedByPullRequestsReferences: { nodes: [] },
  comments: { nodes: [] }, parent: null, subIssues: { nodes: [] },
  ...extra,
});
const hijo = (number, labels, state = "OPEN") => ({ number, state, labels: { nodes: labels.map((name) => ({ name })) } });
const pr = (agente) => ({ closedByPullRequestsReferences: { nodes: [{ number: 1, headRefName: "r", mergedAt: "2026-10-03T00:00:00Z", body: `Agente: ${agente}`, author: null }] } });
const FONDO = ["tipo:fondo", "causa:error-silencioso", "area:datos"];

describe("clasificación y formularios", () => {
  it("cada formulario pone una etiqueta de tipo que existe, uno por tipo", () => {
    const nombres = new Set(etiquetas().map((e) => e.name));
    const ficheros = readdirSync(PLANTILLAS).filter((f) => f.endsWith(".yml") && f !== "config.yml");
    expect(ficheros.length).toBe(Object.keys(GRUPOS.tipo.valores).length);
    for (const f of ficheros) {
      const labels = JSON.parse(/\nlabels: (\[.*\])/.exec(readFileSync(join(PLANTILLAS, f), "utf8"))[1]);
      for (const l of labels) expect(nombres.has(l), `${f}: ${l}`).toBe(true);
    }
  });

  it("los desplegables tienen exactamente los valores de su grupo", () => {
    const porTitulo = Object.fromEntries(Object.entries(GRUPOS).filter(([, g]) => g.titulo).map(([k, g]) => [g.titulo, k]));
    for (const f of readdirSync(PLANTILLAS).filter((x) => x.endsWith(".yml"))) {
      for (const [titulo, valores] of Object.entries(desplegables(readFileSync(join(PLANTILLAS, f), "utf8")))) {
        const grupo = porTitulo[titulo];
        expect(grupo, `${f}: el desplegable «${titulo}» no es de ningún grupo`).toBeDefined();
        expect(valores, `${f}: «${titulo}»`).toEqual(Object.keys(GRUPOS[grupo].valores));
      }
    }
  });

  it("lee lo rellenado en un formulario: etiquetas y de qué fondo cuelga", () => {
    const body = "### Cuándo\n\n2026-10-08\n\n### Análisis\n\nabierto — Su problema…\n\n### De qué problema de fondo\n\n#154\n\n### Por qué es puntual\n\n_No response_\n\n### Causa\n\n_No response_\n\n### Área\n\nops — Git";
    expect(etiquetasDeFormulario(body)).toEqual(["analisis:abierto", "area:ops"]);
    expect(fondoDeFormulario(body)).toBe(154);
    expect(fondoDeFormulario("### De qué problema de fondo\n\n_No response_")).toBe(null);
    // El arreglo es dónde quedó: no se lee del formulario aunque alguien lo escriba.
    expect(etiquetasDeFormulario("### Arreglo\n\ntest — x")).toEqual([]);
  });

  it("solo retira etiquetas de nuestros grupos que ya no existen", () => {
    expect(etiquetasSobrantes(["tipo:leccion", "causa:limpieza", "tipo:fondo", "bug", "dependencies"])).toEqual(["tipo:leccion", "causa:limpieza"]);
  });

  it("un issue con una etiqueta que ya no existe sale para reclasificar", () => {
    const viejo = leerIssue(nodo(["tipo:leccion", "causa:entorno", "area:ops"]));
    expect(faltas(viejo)).toContain("reclasificar: tipo:leccion ya no existe");
  });

  it("control:ok y control:falla (los pone el workflow fondos, #337) son etiquetas nuestras y no piden nada", () => {
    expect(etiquetas().map((e) => e.name)).toEqual(expect.arrayContaining(["control:ok", "control:falla"]));
    expect(etiquetasSobrantes(["control:ok", "control:falla", "control:otra"])).toEqual(["control:otra"]);
    expect(faltas(leerIssue(nodo([...FONDO, "control:falla"], { body: "Arreglo general" })))).toEqual([]);
    // No sale de un desplegable: ningún formulario lo pregunta.
    expect(GRUPOS.control.titulo).toBeUndefined();
  });
});

describe("el análisis de cada caso acaba en una de cuatro respuestas", () => {
  it("todo caso lleva su análisis", () => {
    expect(faltas(leerIssue(nodo(["tipo:caso", "area:ops"])))).toContain("analisis");
  });

  it("un caso que no es puntual cuelga de un problema de fondo", () => {
    const suelto = leerIssue(nodo(["tipo:caso", "analisis:abierto", "area:ops"]));
    expect(faltas(suelto)).toEqual([expect.stringMatching(/^su problema de fondo/)]);
    const colgado = leerIssue(nodo(["tipo:caso", "analisis:abierto", "area:ops"], { parent: hijo(154, FONDO) }));
    expect(faltas(colgado)).toEqual([]);
    // Colgar de algo que no es un fondo no vale.
    const deEncargo = leerIssue(nodo(["tipo:caso", "analisis:abierto", "area:ops"], { parent: hijo(9, ["tipo:encargo", "area:ops"]) }));
    expect(faltas(deEncargo)).toEqual([expect.stringMatching(/^su problema de fondo/)]);
  });

  it("puntual se justifica y lleva causa, para que la revisión pueda agruparlos", () => {
    const sinPorque = leerIssue(nodo(["tipo:caso", "analisis:puntual", "causa:entorno", "area:ops"], { body: "gh se colgó" }));
    expect(faltas(sinPorque)).toEqual([expect.stringMatching(/^por qué es puntual/)]);
    const conPorque = leerIssue(nodo(["tipo:caso", "analisis:puntual", "causa:entorno", "area:ops"], { body: "Puntual porque fue una caída de la red de GitHub." }));
    expect(faltas(conPorque)).toEqual([]);
    expect(faltas(leerIssue(nodo(["tipo:caso", "analisis:puntual", "area:ops"], { body: "Puntual porque x" })))).toEqual(["causa"]);
    expect(justificaPuntual("### Por qué es puntual\n\n_No response_")).toBe(false);
    expect(justificaPuntual("### Por qué es puntual\n\nLa migración de datos ya se hizo y no se repite.")).toBe(true);
  });
});

describe("el problema de fondo", () => {
  it("dice su arreglo general y su causa", () => {
    expect(faltas(leerIssue(nodo(["tipo:fondo", "area:ops"])))).toEqual(["causa", "el arreglo general en el cuerpo"]);
    expect(faltas(leerIssue(nodo(FONDO, { body: "### Arreglo general\n\nUna pieza común." })))).toEqual([]);
  });

  it("no se cierra sin dónde quedó, sin PR y con encargos abiertos", () => {
    const cerrado = leerIssue(nodo(FONDO, {
      state: "CLOSED", closedAt: "2026-10-03T00:00:00Z", body: "Arreglo general: x",
      subIssues: { nodes: [hijo(20, ["tipo:encargo", "area:datos"], "OPEN"), hijo(21, ["tipo:caso", "area:datos"], "OPEN")] },
    }));
    expect(faltas(cerrado)).toEqual(["arreglo", expect.stringMatching(/^PR del arreglo/), "encargos abiertos (#20)"]);
  });

  it("cuenta casos, encargos y si su arreglo no aguantó, y por qué", () => {
    const f = leerIssue(nodo(FONDO, {
      number: 154, title: "[fondo] errores tragados", body: "Arreglo general", reaperturas: { totalCount: 1 },
      subIssues: { nodes: [
        hijo(1, ["tipo:caso", "analisis:abierto"], "CLOSED"),
        hijo(2, ["tipo:caso", "analisis:no-aguanto-corto"]),
        hijo(3, ["tipo:encargo"], "CLOSED"),
        hijo(4, ["tipo:encargo"]),
      ] },
      ...pr("datos"),
    }));
    const [ficha] = resumen([f]).fondos;
    expect(ficha).toMatchObject({ casos: 2, casosAbiertos: 1, encargos: 2, encargosHechos: 1, reaperturas: 1, noAguanto: { roto: 0, corto: 1 }, agente: "datos" });
  });

  it("ordena los abiertos primero y, dentro, por cuántos casos tienen", () => {
    const f = (number, n, state = "OPEN") => leerIssue(nodo(FONDO, { number, state, body: "Arreglo general",
      subIssues: { nodes: Array.from({ length: n }, (_, i) => hijo(100 + i, ["tipo:caso"])) } }));
    expect(resumen([f(1, 1), f(2, 5, "CLOSED"), f(3, 3)]).fondos.map((x) => x.number)).toEqual([3, 1, 2]);
  });
});

describe("reordenar no inventa fallos (notas del revisor, PR #173)", () => {
  const fondoCerrado = leerIssue(nodo(FONDO, { number: 154, state: "CLOSED", closedAt: "2026-10-08T15:39:00Z", body: "Arreglo general" }));
  const caso = (createdAt, analisis = "abierto") => leerIssue(nodo(["tipo:caso", `analisis:${analisis}`, "area:ops"], { createdAt }));

  it("colgar un caso viejo de un fondo cerrado no lo reabre; uno posterior al cierre, sí", () => {
    expect(debeReabrir(caso("2026-10-08T15:30:00Z"), fondoCerrado)).toBe(false);
    expect(debeReabrir(caso("2026-10-09T10:00:00Z"), fondoCerrado)).toBe(true);
    // Ya analizado como «no aguantó»: reabre aunque sea anterior (alguien lo decidió).
    expect(debeReabrir(caso("2026-10-08T15:30:00Z", "no-aguanto-corto"), fondoCerrado)).toBe(true);
    // Un encargo nunca reabre; un fondo abierto no se reabre.
    expect(debeReabrir(leerIssue(nodo(["tipo:encargo", "area:ops"], { createdAt: "2026-10-09T10:00:00Z" })), fondoCerrado)).toBe(false);
    expect(debeReabrir(caso("2026-10-09T10:00:00Z"), leerIssue(nodo(FONDO, { body: "Arreglo general" })))).toBe(false);
  });

  it("--ordenar solo rellena los grupos que faltan: no pisa un análisis cambiado a mano", () => {
    const body = "### Análisis\n\nnuevo — x\n\n### Área\n\nops — x";
    const retocado = leerIssue(nodo(["tipo:caso", "analisis:no-aguanto-roto"], { body }));
    expect(etiquetasQueFaltan(retocado)).toEqual(["area:ops"]);
  });

  it("dos análisis, o un puntual colgado de un fondo, salen como error", () => {
    expect(faltas(leerIssue(nodo(["tipo:caso", "analisis:nuevo", "analisis:no-aguanto-roto", "area:ops"], { parent: hijo(1, FONDO) })))).toContain("analisis (más de uno)");
    const puntualColgado = leerIssue(nodo(["tipo:caso", "analisis:puntual", "causa:entorno", "area:ops"], { body: "Puntual porque x", parent: hijo(154, FONDO) }));
    expect(faltas(puntualColgado)).toEqual([expect.stringMatching(/^puntual pero cuelga de #154/)]);
  });

  it("quién arregló un fondo cerrado a mano sale del PR de su último encargo", () => {
    const encargo = (n, agente) => ({ ...hijo(n, ["tipo:encargo"], "CLOSED"), closedByPullRequestsReferences: { nodes: [{ mergedAt: "2026-10-09T00:00:00Z", body: `Agente: ${agente}` }] } });
    const f = leerIssue(nodo(FONDO, { state: "CLOSED", closedAt: "2026-10-10T00:00:00Z", body: "Arreglo general",
      comments: { nodes: [{ body: "Cerrado: queda en el PR #200." }] }, subIssues: { nodes: [encargo(1, "datos"), encargo(2, "gobierno")] } }));
    expect(resumen([f]).fondos[0].agente).toBe("gobierno");
  });

  it("el arranque avisa de lo que hay que reclasificar", () => {
    expect(avisoDeArranque([leerIssue(nodo(["tipo:leccion", "area:ops"]))]).join("\n")).toMatch(/1 issues con etiquetas que ya no existen/);
  });
});

describe("trazabilidad desde GitHub", () => {
  it("el agente sale de la línea «Agente:» del PR; sin ella, la sesión principal", () => {
    expect(agenteDe("Arregla el PATH.\n\nAgente: gobierno\n")).toBe("gobierno");
    expect(agenteDe("Agente: `Datos`")).toBe("datos");
    expect(agenteDe("Closes #3")).toBe("sesión");
  });

  it("los PR que cierran: los fusionados con «Closes #n», o «PR #n» en un comentario al cerrar", () => {
    const conPr = leerIssue(nodo(FONDO, { state: "CLOSED", closedByPullRequestsReferences: { nodes: [
      { number: 150, headRefName: "ops/path", mergedAt: "2026-10-03T00:00:00Z", body: "Agente: gobierno", author: { login: "pabloam89" } },
      { number: 149, headRefName: "ops/otro", mergedAt: null, body: "", author: { login: "pabloam89" } },
    ] } }));
    expect(conPr.prs).toEqual([{ number: 150, rama: "ops/path", autor: "pabloam89", agente: "gobierno", mergedAt: "2026-10-03T00:00:00Z" }]);
    const aMano = leerIssue(nodo(FONDO, { state: "CLOSED", comments: { nodes: [{ body: "Queda en el PR #137." }] } }));
    expect(aMano.prs.map((p) => p.number)).toEqual([137]);
  });

  it("por agente: fondos que cerró y cuántos no aguantaron, rotos o cortos", () => {
    const f = (casos) => leerIssue(nodo(FONDO, { state: "CLOSED", closedAt: "2026-10-03T00:00:00Z", body: "Arreglo general",
      subIssues: { nodes: casos.map((a, i) => hijo(i, ["tipo:caso", `analisis:${a}`])) }, ...pr("gobierno") }));
    const r = resumen([f(["abierto"]), f(["no-aguanto-roto", "no-aguanto-corto", "no-aguanto-corto"])]);
    expect(r.agentes.gobierno).toMatchObject({ fondos: 2, roto: 1, corto: 2, medianaDias: 2 });
  });
});

describe("el arranque", () => {
  it("enseña lo que espera y los problemas de fondo que más se repiten", () => {
    const f = leerIssue(nodo(FONDO, { number: 154, title: "[fondo] errores tragados", body: "Arreglo general",
      subIssues: { nodes: [hijo(1, ["tipo:caso"]), hijo(2, ["tipo:caso"])] } }));
    const suelto = leerIssue(nodo(["tipo:caso", "analisis:abierto", "area:ops"], { number: 9 }));
    const lineas = avisoDeArranque([f, suelto]);
    expect(lineas[0]).toMatch(/1 problemas de fondo/);
    expect(lineas[1]).toMatch(/#154 errores tragados \(2 casos\)/);
    expect(lineas[2]).toMatch(/1 casos sin colgar/);
  });
});

describe("la norma está escrita donde se lee", () => {
  // Si alguien la quita de CLAUDE.md, de /orquestar o de la skill, el sistema
  // vuelve a apuntar casos sueltos sin que nadie se dé cuenta.
  it("CLAUDE.md, /orquestar y la skill issues piden analizar hasta el problema de fondo", () => {
    for (const f of ["CLAUDE.md", ".claude/commands/orquestar.md", ".claude/skills/issues/SKILL.md"]) {
      const t = leer(f);
      expect(t, f).toMatch(/problema de fondo/i);
      expect(t, f).toMatch(/puntual/i);
    }
    const skill = leer(".claude/skills/issues/SKILL.md");
    for (const a of Object.keys(GRUPOS.analisis.valores)) expect(skill, `la skill explica analisis:${a}`).toContain(a);
  });

  // #185: la norma no es solo texto; la cumple un mecanismo, y ninguna de sus
  // piezas se puede quitar sin que esto falle.
  it("la línea «Casos:» está en la plantilla del PR, en el CI, en CLAUDE.md, en /orquestar y en la skill", () => {
    expect(leer(".github", "pull_request_template.md")).toMatch(/^Casos:/m);
    expect(leer(".github", "workflows", "tests.yml")).toMatch(/scripts\/casos-pr\.mjs/);
    expect(leer(".github", "workflows", "tests.yml")).toMatch(/issues: read/);
    for (const f of ["CLAUDE.md", ".claude/commands/orquestar.md", ".claude/skills/github/SKILL.md"]) {
      expect(leer(f), f).toMatch(/Casos:/);
    }
    expect(leer(".claude", "hooks", "guardia.mjs")).toMatch(/analizarCasos/);
    expect(leer(".claude", "hooks", "pendientes.mjs")).toMatch(/senalesDeFallo/);
  });

  it("hay revisión periódica que mira el conjunto", () => {
    expect(leer(".claude/commands/revision-issues.md")).toMatch(/puntual/i);
  });
});

describe("antes de crear: los parecidos (#204)", () => {
  // Los tres títulos reales del 8 oct 2026: el mismo fallo, abierto tres veces.
  const T153 = "[lección] la guardia de rama atrasada mira la carpeta de la sesión, no la del comando";
  const T154 = "[lección] La guardia mide el atraso del PR desde la carpeta de la sesión, no desde la rama del PR";
  const T159 = "[lección] La guardia mira la carpeta de la sesión, no la del cd del comando";
  const otros = [
    { number: 145, title: "[lección] la guardia de --pablo salta con la carpeta de usuario", state: "OPEN", body: "" },
    { number: 193, title: "[encargo] Dependabot: lo pequeño entra solo, lo grande lo mira una sesión", state: "OPEN", body: "" },
    { number: 190, title: "[caso] Exigir la rama al día para fusionar dejaba los PR sin poder entrar nunca", state: "OPEN", body: "" },
  ];
  const issues = [{ number: 153, title: T153, state: "CLOSED", body: "" }, { number: 154, title: T154, state: "OPEN", body: "" }, ...otros];

  it("el tercero encuentra a los dos primeros, y nada más", () =>
    expect(parecidos(issues, { titulo: T159 }).map((p) => p.number)).toEqual([153, 154]));
  it("uno sin relación no encuentra nada", () =>
    expect(parecidos(issues, { titulo: "Lola no entiende las alergias al kiwi" })).toEqual([]));
  it("nombrar el mismo fichero empuja", () => {
    const con = [{ number: 1, title: "Avisos raros al editar", state: "OPEN", body: "toca `.claude/hooks/guardia.mjs`" }];
    const sin = parecidos(con, { titulo: "Avisos raros de la guardia", cuerpo: "" });
    const empuja = parecidos(con, { titulo: "Avisos raros de la guardia", cuerpo: "en guardia.mjs" }, { minimo: 0 });
    expect(empuja[0].parecido).toBeGreaterThan(sin[0]?.parecido ?? 0);
  });
});

describe("los ficheros que nombra un issue (#205)", () => {
  it("por su nombre, sin la ruta, y sin los comunes", () =>
    expect([...ficherosNombrados("mira `.claude/hooks/guardia.mjs`, CLAUDE.md y scripts/podar.mjs")]).toEqual(["guardia.mjs", "podar.mjs"]));
  it("los abiertos que nombran el fichero que tocas", () => {
    const issues = [
      { number: 1, title: "x", state: "OPEN", body: "en guardia.mjs" },
      { number: 2, title: "y", state: "CLOSED", body: "en guardia.mjs" },
      { number: 3, title: "z", state: "OPEN", body: "en podar.mjs" },
    ];
    expect(issuesQueNombran(issues, String.raw`C:\dev\MenuPlan-x\.claude\hooks\guardia.mjs`).map((i) => i.number)).toEqual([1]);
    expect(issuesQueNombran(issues, "C:/dev/MenuPlan-x/CLAUDE.md")).toEqual([]);
  });
});

describe("medida de la línea «Casos:» en los PR fusionados (#185)", () => {
  const pr = (body, login = "pabloam89") => ({ number: 1, body, author: { login } });
  it("cuenta con casos, con «ninguno», sin línea, y se salta a los bots", () => {
    const m = medirCasos(
      [
        pr("Casos: #5, #6"),
        pr("Casos: #7"),
        pr("Casos: ninguno — solo mueve ficheros, no ha habido ningún fallo"),
        pr("Closes #1"),
        pr(null),
        pr("", "dependabot[bot]"),
      ],
      analizarCasos,
    );
    expect(m).toEqual({ total: 5, conCasos: 2, ninguno: 1, sinLinea: 2, casosCitados: 3 });
  });
});
