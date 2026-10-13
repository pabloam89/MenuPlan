import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ACTORES, DIAGNOSTICAN } from "../scripts/lib/flujo.mjs";
import { agentesDe } from "../scripts/lib/agentes.mjs";

/**
 * Los actores del flujo que son un agente (flujo.actores y flujo.diagnostican) salen de la cabecera de
 * .claude/agents/, no de una lista aparte (línea #652): decir «analista» en el flujo sin que exista el
 * agente, o dejar a un agente fuera del vocabulario, separaría las dos fuentes.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Ids del vocabulario que no son un agente suelto: un rol genérico, una persona, un script o un reparto.
const NO_AGENTE = ["agente_dominio", "juez", "persona", "automatico", "orquestador_con_diagnosticadores"];

/** Los ids de un vocabulario de actores que no son un rol conocido y tampoco existen en .claude/agents/. */
export const actoresSinAgente = (vocabulario, agentes) => Object.keys(vocabulario).filter((k) => !NO_AGENTE.includes(k) && !(k in agentes));

describe("el vocabulario del flujo y la cabecera de los agentes", () => {
  const agentes = agentesDe(RAIZ);

  it("cada actor del flujo que es un agente existe en .claude/agents/ y quien diagnostica es el analista", () => {
    expect(actoresSinAgente(ACTORES, agentes)).toEqual([]);
    expect(actoresSinAgente(DIAGNOSTICAN, agentes)).toEqual([]);
    expect(agentes.analista).toBe("constructor");
    expect(Object.keys(DIAGNOSTICAN)).toContain("analista");
    expect(Object.keys(DIAGNOSTICAN)).not.toContain("agente_dominio");
  });

  it("los roles genéricos se definen por la cabecera: juez es «Tipo: juez» y el constructor del dominio «Tipo: constructor»", () => {
    expect(ACTORES.juez).toContain("Tipo: juez");
    expect(ACTORES.agente_dominio).toContain("Tipo: constructor");
  });

  it("el flujo pone al analista en la primera mitad (caso, triaje, diagnóstico, fondo y plan) y deja construir al constructor del dominio", () => {
    const flujo = JSON.parse(readFileSync(join(RAIZ, "ops", "flujo.json"), "utf8"));
    const lista = flujo.pasos ?? Object.values(flujo).find(Array.isArray);
    const quien = (id) => lista.find((p) => p.id === id).quien;
    for (const id of ["registrar_caso", "triaje", "diagnosticar", "fondo", "plan"]) expect(quien(id), id).toContain("analista");
    expect(quien("ejecutar")).toContain("agente_dominio");
    expect(quien("ejecutar")).not.toContain("analista");
  });

  it("el detector ve fallar un actor que no es agente ni rol conocido", () => {
    expect(actoresSinAgente({ analista: "x", el_becario: "y", persona: "z" }, agentes)).toEqual(["el_becario"]);
    expect(actoresSinAgente({ analista: "x" }, { revisor: "juez" })).toEqual(["analista"]);
  });
});
