// Las líneas «Tipo:», «Jueces:» y «Agente:» del PR (#642): una sola lectura para la guardia y el CI.
import { describe, expect, it } from "vitest";

import { REGLAS, agentesDeLineas, analizarTipoYJueces } from "./tipo-y-jueces.mjs";

const ok = (c, o) => analizarTipoYJueces(c, o);

describe("analizarTipoYJueces", () => {
  it("lee el tipo, los jueces y los agentes", () => {
    const r = ok("Agente: constructor\nTipo: operate\nJueces: seguridad, revisor");
    expect(r).toEqual({ valida: true, tipo: "operate", jueces: ["seguridad", "revisor"], agentes: ["constructor"] });
  });
  it("admite un subtipo, negritas, comillas invertidas, «y» y texto tras el tipo", () => {
    const r = ok("**Tipo:** `operate-reversible` — cambia la guardia\n**Jueces:** `revisor` y `seguridad`");
    expect(r.valida).toBe(true);
    expect(r.tipo).toBe("operate-reversible");
    expect(r.jueces).toEqual(["revisor", "seguridad"]);
  });
  it.each([
    ["sin Tipo", "Jueces: revisor", /Falta la línea «Tipo:»/],
    ["sin Jueces", "Tipo: fix", /Falta la línea «Jueces:»/],
    ["Jueces vacía", "Tipo: fix\nJueces:", /vacía/],
    ["Tipo vacío", "Tipo:\nJueces: revisor", /no es un tipo/],
    ["dos tipos", "Tipo: fix\nTipo: create\nJueces: revisor", /dos tipos/],
    ["la sesión como juez", "Tipo: fix\nJueces: sesión", /no es un juez/],
    ["un nombre raro", "Tipo: fix\nJueces: rev!sor", /no es el nombre de un juez/],
  ])("%s: no vale", (_, cuerpo, motivo) => {
    const r = ok(cuerpo);
    expect(r.valida).toBe(false);
    expect(r.regla).toBe(REGLAS.forma);
    expect(r.motivo).toMatch(motivo);
  });
  it("quien construye no juzga: el Agente en Jueces no vale, con su propia regla", () => {
    const r = ok("Agente: revisor\nTipo: audit\nJueces: revisor, seguridad");
    expect(r.valida).toBe(false);
    expect(r.regla).toBe(REGLAS.construyeYJuzga);
    expect(r.jueces).toEqual(["revisor", "seguridad"]);
  });
  it("lo de los comentarios y los bloques de código no cuenta (la plantilla explica las líneas)", () => {
    expect(ok("<!-- Tipo: fix\nJueces: revisor -->").valida).toBe(false);
    expect(ok("```\nTipo: fix\nJueces: revisor\n```").valida).toBe(false);
  });
  it("en un comando (`gh pr create --body \"…\"`) también, y sin comerse las comillas", () => {
    const r = ok('gh pr create --body "Agente: constructor\nTipo: create\nJueces: revisor"', { enComando: true });
    expect(r).toMatchObject({ valida: true, tipo: "create", jueces: ["revisor"], agentes: ["constructor"] });
    expect(ok('gh pr create --body "Casos: #1"', { enComando: true }).valida).toBe(false);
  });
  it("en un comando, «tipo:» a mitad de una frase no es la línea «Tipo:» (sí tras la comilla o un \\n escrito)", () => {
    const mitad = ok('gh pr create --body "Arregla el tipo: de la línea\nJueces: revisor"', { enComando: true });
    expect(mitad.valida).toBe(false);
    expect(mitad.motivo).toMatch(/Falta la línea «Tipo:»/);
    expect(ok('gh pr create --body "Cambia el tipo: create y más\nTipo: fix\nJueces: revisor"', { enComando: true })).toMatchObject({ valida: true, tipo: "fix" });
    expect(ok("gh pr create --body $'Agente: constructor\\nTipo: fix\\nJueces: revisor, qa'", { enComando: true })).toMatchObject({ valida: true, tipo: "fix", jueces: ["revisor", "qa"], agentes: ["constructor"] });
  });
  it("una línea de Jueces enorme no vale", () => {
    expect(ok(`Tipo: fix\nJueces: ${"revisor, ".repeat(60)}`).motivo).toMatch(/demasiado larga/);
  });
});

describe("agentesDeLineas (la lee también fondos-pr.mjs)", () => {
  it("normaliza mayúsculas, sesion y adornos", () => {
    expect(agentesDeLineas("Agente: Constructor\n**Agente:** `qa`\nAgente: sesion")).toEqual(["constructor", "qa", "sesión"]);
    expect(agentesDeLineas("Agente:")).toEqual([""]);
  });
});
