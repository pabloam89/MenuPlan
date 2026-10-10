import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PENDIENTES_ADMITIDOS, agentesEnDisco, conSeccion, contar, extraerSeccion, leerEstandares,
  problemasDeEstandares, renderSeccion, textoDeTarea,
} from "../scripts/lib/estandaresAgentes.mjs";

/**
 * Un estándar por tarea de cada agente (#413, fondo #416). El catálogo es
 * ops/estandares-agentes.json; la sección «Tareas y su estándar» de cada agente
 * se genera de él. Falla si una tarea no tiene estándar, si un estándar no
 * tiene tarea, si un agente nuevo no trae su lista o si los cuatro primeros
 * vuelven a tener pendientes.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datos = leerEstandares(RAIZ);
const agentes = agentesEnDisco(RAIZ);
const PENDIENTES_CONGELADOS = ["diseno", "lola", "qa", "evaluador", "auditor-datos"]; // 10 oct 2026: solo se quitan, no se añaden
const PRIMEROS_CUATRO = ["gobierno", "datos", "revisor", "seguridad"];
const clon = () => JSON.parse(JSON.stringify(datos));
const textoAgente = (n) => readFileSync(join(RAIZ, ".claude", "agents", `${n}.md`), "utf8").replace(/\r\n/g, "\n");

describe("ops/estandares-agentes.json", () => {
  it("el catálogo cumple todas las reglas", () => {
    expect(problemasDeEstandares(datos, agentes, RAIZ)).toEqual([]);
  });

  it("los cuatro primeros agentes tienen todos sus estándares, sin pendientes", () => {
    for (const n of PRIMEROS_CUATRO) {
      expect(datos.agentes[n].estado, `${n} sigue pendiente`).toBe("completo");
      expect(PENDIENTES_ADMITIDOS).not.toContain(n);
      for (const t of datos.agentes[n].tareas) {
        expect(t.estandar?.length, `${n}/${t.id}: sin estándar`).toBeGreaterThan(60);
        expect(t.comprueba?.length, `${n}/${t.id}: sin «comprueba»`).toBeGreaterThan(0);
        expect(t.no_hace?.length, `${n}/${t.id}: sin «no_hace»`).toBeGreaterThan(0);
        expect(t.fuentes?.length, `${n}/${t.id}: sin fuente`).toBeGreaterThan(0);
      }
    }
  });

  it("la lista de pendientes solo baja: son los que el catálogo marca pendientes, ni uno más", () => {
    const marcados = Object.entries(datos.agentes).filter(([, a]) => a.estado === "pendiente").map(([n]) => n).sort();
    expect(marcados).toEqual([...PENDIENTES_ADMITIDOS].sort());
  });

  it("la lista de pendientes solo baja: es un subconjunto del conjunto congelado de hoy", () => {
    // Añadir un agente pendiente exige tocar ESTA lista a ojos de quien revisa, no solo PENDIENTES_ADMITIDOS.
    expect(PENDIENTES_ADMITIDOS.filter((n) => !PENDIENTES_CONGELADOS.includes(n))).toEqual([]);
  });

  it("la cifra: tareas con estándar sobre tareas", () => {
    const c = contar(datos);
    expect(c.total).toBe(Object.values(datos.agentes).reduce((s, a) => s + a.tareas.length, 0));
    expect(c.conEstandar).toBe(PRIMEROS_CUATRO.reduce((s, n) => s + datos.agentes[n].tareas.length, 0));
    expect(c.pendientes).toBe(c.total - c.conEstandar);
  });
});

describe("las reglas se ven fallar (cada una con un catálogo estropeado a propósito)", () => {
  const falla = (cambia, trozo, ags = agentes) => {
    const d = clon();
    cambia(d);
    expect(problemasDeEstandares(d, ags, RAIZ).join("\n")).toContain(trozo);
  };

  it("una tarea sin estándar", () => falla((d) => { delete d.agentes.datos.tareas[0].estandar; }, "datos/modelar-antes-de-sql: sin estándar"));
  it("una tarea sin «comprueba»", () => falla((d) => { d.agentes.revisor.tareas[0].comprueba = []; }, "revisor/revisar-diff: «comprueba»"));
  it("una tarea sin «no_hace»", () => falla((d) => { delete d.agentes.seguridad.tareas[1].no_hace; }, "«no_hace»"));
  it("una tarea sin fuente", () => falla((d) => { d.agentes.gobierno.tareas[0].fuentes = []; }, "gobierno/flujo-rama-pr-staging: sin fuente citada"));
  it("una fuente que no está en el catálogo", () => falla((d) => { d.agentes.gobierno.tareas[0].fuentes = ["no-existe"]; }, "la fuente «no-existe» no está"));
  it("una tarea sin descripción de lo que se hace", () => falla((d) => { d.agentes.datos.tareas[0].tarea = ""; }, "«tarea» dice qué se hace"));
  it("un estándar a medias en un agente pendiente", () => falla((d) => { d.agentes.lola.tareas[0].estandar = "x".repeat(80); }, "lola/herramienta-de-lola: campo «estandar» no admitido en un agente pendiente"));
  it("un agente nuevo sin su lista de tareas", () => falla(() => {}, "agente-nuevo: el agente existe y no tiene su lista", [...agentes, "agente-nuevo"]));
  it("un agente nuevo con tareas pero pendiente", () => falla((d) => { d.agentes["agente-nuevo"] = { estado: "pendiente", tareas: d.agentes.qa.tareas }; }, "agente-nuevo: pendiente, y un agente nuevo nace con sus estándares completos", [...agentes, "agente-nuevo"]));
  it("una entrada sin su agente", () => falla((d) => { d.agentes.fantasma = d.agentes.datos; }, "fantasma: está en ops/estandares-agentes.json y no existe"));
  it("uno de los cuatro primeros que vuelve a pendiente", () => falla((d) => { d.agentes.revisor = { estado: "pendiente", tareas: d.agentes.revisor.tareas.map(({ id, tarea, origen }) => ({ id, tarea, origen })) }; }, "revisor: pendiente, y un agente nuevo nace"));
  it("un agente completo que sigue en la lista de pendientes", () => falla((d) => {
    d.agentes.qa = { estado: "completo", tareas: d.agentes.gobierno.tareas };
  }, "qa: ya está completo; quítalo de PENDIENTES_ADMITIDOS"));
  it("menos de tres tareas", () => falla((d) => { d.agentes.datos.tareas = d.agentes.datos.tareas.slice(0, 2); }, "datos: la lista de tareas tiene al menos tres"));
  it("un id repetido", () => falla((d) => { d.agentes.datos.tareas[1].id = d.agentes.datos.tareas[0].id; }, "id repetido"));
  it("un origen que no es una sección del agente", () => falla((d) => { d.agentes.datos.tareas[0].origen = "Identidad"; }, "origen «Identidad»"));
  it("un estado fuera del vocabulario", () => falla((d) => { d.agentes.datos.estado = "casi"; }, "estado «casi»"));
  it("una fuente en una web que no es documentación admitida", () => falla((d) => { d.fuentes["gg-estandar"].url = "https://blog.example.com/x"; }, "blog.example.com no es una documentación admitida"));
  it("una fuente en http", () => falla((d) => { d.fuentes["gg-estandar"].url = "http://google.github.io/eng-practices/"; }, "la url va en https"));
  it("una fuente de la casa con una ruta que no existe", () => falla((d) => { d.fuentes["casa-claude"].ruta = "no/existe.md"; }, "la ruta no/existe.md no existe en el repo"));
  it("una fuente de la casa sin ruta o con url", () => falla((d) => { d.fuentes["casa-claude"].url = "https://x.org"; }, "lleva ruta y no url"));
  it("una fuente que ninguna tarea cita", () => falla((d) => { d.fuentes.sobra = { nombre: "Una fuente que sobra en el catálogo", url: "https://sre.google/x" }; }, "fuente «sobra»: ninguna tarea la cita"));
});

describe("la sección «Tareas y su estándar» de cada agente sale del catálogo", () => {
  it.each(agentes)("%s: su sección es la generada y no hay tarea sin estándar ni estándar sin tarea", (n) => {
    const seccion = extraerSeccion(textoAgente(n));
    expect(seccion, `${n}: falta «## Tareas y su estándar» (npm run estandar -- --escribir)`).not.toBeNull();
    const enMd = [...seccion.matchAll(/^- `([a-z0-9-]+)` — /gm)].map((m) => m[1]);
    const enJson = datos.agentes[n].tareas.map((t) => t.id);
    expect(enMd.filter((x) => !enJson.includes(x)), `${n}: tareas en el agente que no están en el catálogo`).toEqual([]);
    expect(enJson.filter((x) => !enMd.includes(x)), `${n}: tareas del catálogo que el agente no lista`).toEqual([]);
    expect(seccion, `${n}: la sección no coincide con la generada (npm run estandar -- --escribir)`).toBe(renderSeccion(n, datos));
  });

  it("generar es idempotente y sustituye sin duplicar", () => {
    const base = "## 10. Hecho\n\nalgo\n";
    const una = conSeccion(base, renderSeccion("gobierno", datos));
    expect(conSeccion(una, renderSeccion("gobierno", datos))).toBe(una);
    expect(una.match(/## Tareas y su estándar/g)).toHaveLength(1);
    expect(conSeccion(una, "## Tareas y su estándar\n\ncambiada")).toContain("cambiada");
  });
});

describe("npm run estandar", () => {
  it("está en package.json y da el estándar con la línea que pega /orquestar", () => {
    const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
    expect(pkg.scripts.estandar).toMatch(/scripts\/estandares-agentes\.mjs/);
    const out = execFileSync("node", ["scripts/estandares-agentes.mjs", "gobierno", "flujo-rama-pr-staging"], { cwd: RAIZ, encoding: "utf8" });
    expect(out).toContain("ESTÁNDAR A CUMPLIR: gobierno/flujo-rama-pr-staging");
    expect(out).toMatch(/Comprueba:/);
    expect(out).toMatch(/No hace:/);
    expect(out).toMatch(/https:\/\//);
  });

  it("de un agente pendiente dice que el estándar está pendiente, y de una tarea que no existe, nada", () => {
    expect(textoDeTarea("lola", "herramienta-de-lola", datos)).toMatch(/pendiente de escribir/);
    expect(textoDeTarea("gobierno", "no-existe", datos)).toBeNull();
    expect(textoDeTarea("nadie", "x", datos)).toBeNull();
  });
});
