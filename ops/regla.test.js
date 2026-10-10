import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { leerForja } from "../scripts/lib/forja.mjs";
import { CONTROL_JUICIO, FUERZAS, controlLegible, fraseDeRegla, problemasDeRegla, problemasDeSujetos } from "../scripts/lib/regla.mjs";

/**
 * El esquema de una regla por campos (#487, fondo #455), reutilizable por las normas y las
 * obligaciones del flujo (#488). Falla cuando: una regla trae `texto` libre, un sujeto o una
 * fuerza fuera del vocabulario, no tiene nombre o exigencia, la exigencia pasa de 160
 * caracteres, o la frase generada cambia de forma. Cada regla se ve fallar con datos malos.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datos = leerForja(RAIZ);

// Un vocabulario de mentira: el esquema no depende del catálogo de la forja.
const sujetos = {
  "skill.descripcion": { legible: "la descripción de cada skill", aplica_a: ["skill"] },
  "estandar.fuente": { legible: "cada fuente del catálogo de estándares", aplica_a: ["estandar"] },
  agente: { legible: "cada agente", aplica_a: ["estandar"] },
};
const buena = () => ({
  nombre: "Frase de apertura",
  sujeto: "skill.descripcion",
  fuerza: "debe",
  exigencia: "empezar por «Úsala »",
  control: ".claude/skills.test.js",
});
const falla = (mut, trozo) => {
  const r = buena();
  mut(r);
  expect(problemasDeRegla(r, "r", sujetos).join("\n"), trozo).toContain(trozo);
};

describe("fraseDeRegla: la frase sale de los campos", () => {
  it("DEBE, con un fichero como control", () => {
    expect(fraseDeRegla(buena(), sujetos)).toBe("**Frase de apertura.** La descripción de cada skill DEBE empezar por «Úsala ». Se comprueba con: `.claude/skills.test.js`.");
  });
  it("NO DEBE con condición: la condición abre la frase y el sujeto baja a minúscula", () => {
    const r = { nombre: "Fuente sin url", sujeto: "estandar.fuente", fuerza: "no_debe", condicion: "si es de la casa", exigencia: "llevar una url", control: "ops/estandares-agentes.test.js" };
    expect(fraseDeRegla(r, sujetos)).toBe("**Fuente sin url.** Si es de la casa, cada fuente del catálogo de estándares NO DEBE llevar una url. Se comprueba con: `ops/estandares-agentes.test.js`.");
  });
  it("CONVIENE, con juicio como control y con condición", () => {
    const r = { nombre: "Estado cerrado", sujeto: "agente", fuerza: "conviene", condicion: "cuando está pendiente", exigencia: "figurar en la lista de pendientes", control: CONTROL_JUICIO };
    expect(fraseDeRegla(r, sujetos)).toBe("**Estado cerrado.** Cuando está pendiente, para cada agente, CONVIENE figurar en la lista de pendientes. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.");
    expect(fraseDeRegla({ ...r, condicion: undefined }, sujetos)).toContain("Para cada agente, CONVIENE figurar");
  });
  it("un sujeto o una fuerza que no existen no generan frase", () => {
    expect(() => fraseDeRegla({ ...buena(), sujeto: "coche" }, sujetos)).toThrow("sujeto «coche»");
    expect(() => fraseDeRegla({ ...buena(), fuerza: "puede" }, sujetos)).toThrow("fuerza «puede»");
  });
  it("el control legible: un fichero entre comillas invertidas, el juicio explicado", () => {
    expect(controlLegible("scripts/x.test.js")).toBe("`scripts/x.test.js`");
    expect(controlLegible(CONTROL_JUICIO)).toContain("juicio");
  });
  it("la fuerza tiene tres valores con su palabra", () => {
    expect(Object.fromEntries(Object.entries(FUERZAS).map(([k, v]) => [k, v.palabra]))).toEqual({ debe: "DEBE", no_debe: "NO DEBE", conviene: "CONVIENE" });
  });
});

describe("problemasDeRegla: cada regla falla con datos malos (cada caso cambia UNA cosa)", () => {
  it("la regla buena pasa", () => expect(problemasDeRegla(buena(), "r", sujetos)).toEqual([]));
  it("un «texto» libre", () => falla((r) => { r.texto = "Una prosa libre cualquiera, como las de antes"; }, "«texto» ya no existe"));
  it("sin nombre, o con un nombre mal escrito", () => {
    falla((r) => { delete r.nombre; }, "«nombre»");
    falla((r) => { r.nombre = "frase de apertura"; }, "mayúscula inicial");
    falla((r) => { r.nombre = "Frase de apertura."; }, "sin punto final");
    falla((r) => { r.nombre = "Frase"; }, "de 2 a 5 palabras");
    falla((r) => { r.nombre = "Una frase de apertura que es larga"; }, "de 2 a 5 palabras");
  });
  it("un sujeto fuera del vocabulario", () => {
    falla((r) => { r.sujeto = "skill.coche"; }, "sujeto «skill.coche» no está en el vocabulario");
    falla((r) => { delete r.sujeto; }, "sujeto «undefined»");
  });
  it("una fuerza fuera del vocabulario", () => {
    falla((r) => { r.fuerza = "puede"; }, "fuerza «puede» no está en el vocabulario");
    falla((r) => { r.fuerza = "DEBE"; }, "fuerza «DEBE»");
  });
  it("sin exigencia, o con una mal escrita", () => {
    falla((r) => { delete r.exigencia; }, "«exigencia»");
    falla((r) => { r.exigencia = "empezar por «Úsala »."; }, "sin punto final");
    falla((r) => { r.exigencia = "Empezar por «Úsala »"; }, "minúscula");
    falla((r) => { r.exigencia = "empezar\npor «Úsala »"; }, "una sola línea");
  });
  it("una exigencia de más de 160 caracteres falla y una de 160 pasa", () => {
    const de = (n) => `llevar ${"a".repeat(n - 7)}`;
    falla((r) => { r.exigencia = de(161); }, "pasa de 160 caracteres (161)");
    const r = buena();
    r.exigencia = de(160);
    expect(problemasDeRegla(r, "r", sujetos)).toEqual([]);
  });
  it("una condición que no empieza por «cuando» o «si»", () => {
    falla((r) => { r.condicion = "siempre que haya prisa"; }, "«cuando» o «si»");
    falla((r) => { r.condicion = "si hay prisa."; }, "sin punto");
    const r = { ...buena(), condicion: "si hay prisa" };
    expect(problemasDeRegla(r, "r", sujetos)).toEqual([]);
  });
  it("una nota demasiado larga", () => falla((r) => { r.nota = "x".repeat(401); }, "«nota» pasa de 400"));
});

describe("problemasDeSujetos: el vocabulario de sujetos", () => {
  it("el de la forja pasa y el de mentira también", () => {
    expect(problemasDeSujetos(datos.sujetos, ["skill", "estandar", "agente"])).toEqual([]);
    expect(problemasDeSujetos(sujetos, ["skill", "estandar", "agente"])).toEqual([]);
  });
  it("falla con un id mal escrito, sin texto legible o con un artefacto que no existe", () => {
    expect(problemasDeSujetos({ "Skill Mal": { legible: "cada skill", aplica_a: ["skill"] } }).join()).toContain("minúsculas");
    expect(problemasDeSujetos({ skill: { legible: "Cada skill.", aplica_a: ["skill"] } }).join()).toContain("legible");
    expect(problemasDeSujetos({ skill: { legible: "cada skill", aplica_a: ["coche"] } }, ["skill"]).join()).toContain("no es un artefacto");
    expect(problemasDeSujetos({ skill: { legible: "cada skill", aplica_a: [] } }).join()).toContain("aplica_a");
    expect(problemasDeSujetos({}).join()).toContain("sujetos");
  });
});

describe("los criterios de la forja, por campos", () => {
  it("ninguno trae «texto»", () => {
    for (const c of datos.criterios) expect("texto" in c, c.id).toBe(false);
  });
  it("todos pasan el esquema de regla y generan su frase", () => {
    for (const c of datos.criterios) {
      expect(problemasDeRegla(c, c.id, datos.sujetos), c.id).toEqual([]);
      expect(fraseDeRegla(c, datos.sujetos), c.id).toMatch(/^\*\*[^*]+\.\*\* .+ (DEBE|NO DEBE|CONVIENE) .+\. Se comprueba con: .+\.$/);
    }
  });
  it("ninguna exigencia pasa de 160 caracteres", () => {
    for (const c of datos.criterios) expect(c.exigencia.length, c.id).toBeLessThanOrEqual(160);
  });
  it("los subjetivos llevan su rúbrica y solo ellos", () => {
    for (const c of datos.criterios) {
      expect("cumple" in c && "no_cumple" in c, c.id).toBe(c.capa === "subjetiva");
    }
  });
});
