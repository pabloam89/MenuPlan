import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GRUPOS, agenteDe, etiquetas, etiquetasDeFormulario, faltas, leerIssue, resumen } from "./lib/issues.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLANTILLAS = join(RAIZ, ".github", "ISSUE_TEMPLATE");

/** Desplegables de un formulario: { titulo: [primera palabra de cada opción] }. */
function desplegables(yml) {
  const out = {};
  for (const bloque of yml.split(/\n {2}- type: /).filter((b) => b.startsWith("dropdown"))) {
    const titulo = /\n\s+label: (.+)/.exec(bloque)[1].trim();
    out[titulo] = [...bloque.matchAll(/\n\s+- "([\w-]+) — /g)].map((m) => m[1]);
  }
  return out;
}

describe("clasificación de issues", () => {
  it("cada formulario pone una etiqueta de tipo que existe", () => {
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

  it("lee lo rellenado en un formulario, como lo deja GitHub", () => {
    const body = "### Cuándo\n\n2026-10-08\n\n### Causa\n\nvigilante-falso — Un vigilante bloqueó\n\n### Área\n\ndatos — Esquema\n\n### Dónde debería quedar\n\n_No response_";
    expect(etiquetasDeFormulario(body)).toEqual(["causa:vigilante-falso", "area:datos"]);
    // El arreglo es dónde quedó: no se lee del formulario aunque alguien lo escriba.
    expect(etiquetasDeFormulario("### Arreglo\n\ntest — x")).toEqual([]);
    expect(etiquetasDeFormulario("### Causa\n\ninventada — x")).toEqual([]);
  });

  it("una lección pide causa y área; al cerrarla, dónde quedó el arreglo", () => {
    const l = (labels, state = "OPEN") => ({ state, labels: labels.map((name) => ({ name })) });
    expect(faltas(l(["tipo:leccion"]))).toEqual(["causa", "area"]);
    expect(faltas(l(["tipo:leccion", "causa:entorno", "area:ops"]))).toEqual([]);
    expect(faltas(l(["tipo:leccion", "causa:entorno", "area:ops"], "CLOSED"))).toEqual(["arreglo"]);
    expect(faltas(l(["tipo:decision", "area:datos"]))).toEqual([]);
    expect(faltas(l([]))).toEqual(["tipo", "area"]);
  });

  it("cuenta las lecciones por causa con su mediana de días hasta cerrar", () => {
    const i = (labels, createdAt, closedAt = null) => ({ state: closedAt ? "CLOSED" : "OPEN", createdAt, closedAt, labels: labels.map((name) => ({ name })) });
    const r = resumen([
      i(["tipo:leccion", "causa:entorno", "area:ops", "arreglo:test"], "2026-10-01", "2026-10-02"),
      i(["tipo:leccion", "causa:entorno", "area:ops", "arreglo:script"], "2026-10-01", "2026-10-04"),
      i(["tipo:leccion", "causa:entorno", "area:ops"], "2026-10-05"),
      // Reabierta: conserva closedAt, pero cuenta como abierta.
      { ...i(["tipo:leccion", "causa:entorno", "area:ops", "arreglo:regla"], "2026-10-01", "2026-10-02"), state: "OPEN" },
      i(["tipo:decision", "area:datos"], "2026-10-05"),
    ]);
    expect(r.porTipo).toEqual({ leccion: 2, decision: 1 });
    expect(r.causas.entorno).toMatchObject({ total: 4, abiertas: 2, medianaDias: 2, arreglos: { test: 1, script: 1 } });
  });
});

describe("trazabilidad desde GitHub", () => {
  const nodo = (extra = {}) => ({
    number: 7, title: "x", state: "CLOSED", createdAt: "2026-10-01T00:00:00Z", closedAt: "2026-10-03T00:00:00Z", body: "",
    labels: { nodes: [{ name: "tipo:leccion" }, { name: "causa:entorno" }, { name: "area:ops" }, { name: "arreglo:test" }] },
    assignees: { nodes: [] }, reaperturas: { totalCount: 0 }, closedByPullRequestsReferences: { nodes: [] }, comments: { nodes: [] }, parent: null,
    ...extra,
  });

  it("el agente sale de la línea «Agente:» del PR; sin ella, la sesión principal", () => {
    expect(agenteDe("Arregla el PATH.\n\nAgente: gobierno\n")).toBe("gobierno");
    expect(agenteDe("Agente: `Datos`")).toBe("datos");
    expect(agenteDe("Closes #3")).toBe("sesión");
  });

  it("los PR que cierran: los fusionados con «Closes #n», o «PR #n» en un comentario al cerrar", () => {
    const conPr = leerIssue(nodo({ closedByPullRequestsReferences: { nodes: [
      { number: 150, headRefName: "ops/path", mergedAt: "2026-10-03T00:00:00Z", body: "Agente: gobierno", author: { login: "pabloam89" } },
      { number: 149, headRefName: "ops/otro", mergedAt: null, body: "", author: { login: "pabloam89" } },
    ] } }));
    expect(conPr.prs).toEqual([{ number: 150, rama: "ops/path", autor: "pabloam89", agente: "gobierno", mergedAt: "2026-10-03T00:00:00Z" }]);
    const aMano = leerIssue(nodo({ comments: { nodes: [{ body: "Queda en el PR #137." }] } }));
    expect(aMano.prs.map((p) => p.number)).toEqual([137]);
  });

  it("una lección cerrada sin PR que la arregle está sin trazar, salvo arreglo:ninguno", () => {
    expect(faltas(leerIssue(nodo()))).toEqual([expect.stringMatching(/^PR del arreglo/)]);
    const ninguno = nodo({ labels: { nodes: [{ name: "tipo:leccion" }, { name: "causa:entorno" }, { name: "area:ops" }, { name: "arreglo:ninguno" }] } });
    expect(faltas(leerIssue(ninguno))).toEqual([]);
  });

  it("cuenta por agente lo que arregló y cuántas veces se le reabrió", () => {
    const pr = (agente) => ({ closedByPullRequestsReferences: { nodes: [{ number: 1, headRefName: "r", mergedAt: "2026-10-03T00:00:00Z", body: `Agente: ${agente}`, author: null }] } });
    const r = resumen([
      leerIssue(nodo(pr("gobierno"))),
      leerIssue(nodo({ ...pr("gobierno"), reaperturas: { totalCount: 1 } })),
      // Reabierta y aún abierta: el arreglo de datos no aguantó.
      leerIssue(nodo({ ...pr("datos"), state: "OPEN", reaperturas: { totalCount: 2 } })),
    ]);
    expect(r.agentes.gobierno).toMatchObject({ arregladas: 2, reaperturas: 1, medianaDias: 2 });
    expect(r.agentes.datos).toMatchObject({ arregladas: 1, reaperturas: 2, medianaDias: null });
    expect(r.causas.entorno.reaperturas).toBe(3);
  });
});
