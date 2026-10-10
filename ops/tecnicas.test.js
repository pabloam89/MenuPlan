import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GRUPOS } from "../scripts/lib/issues.mjs";
import { CATALOGO, CAUSAS, PARADAS, PRODUCTOS, problemas, tecnicasPara } from "../scripts/lib/tecnicas.mjs";

/**
 * El catálogo de técnicas de diagnóstico (#338, fase C de #334). Vigila:
 *
 *  1. la forma y el vocabulario cerrado de ops/tecnicas.json;
 *  2. que CADA tipo de causa de issues.mjs tenga su técnica (causa a causa);
 *  3. las seis técnicas que pide el plan, y que ninguna sobre;
 *  4. que la skill causa-raiz cite el catálogo y no lo copie;
 *  5. que `npm run tecnica` rechace una causa que no existe.
 *
 * Abajo, un autotest: cada regla falla con datos malos. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reglas = (lista) => [...new Set(lista.map((x) => x.split(":")[0]))].sort();
const copia = () => JSON.parse(JSON.stringify(CATALOGO));

describe("el catálogo de técnicas", () => {
  it("no tiene ningún problema", () => {
    expect(problemas(CATALOGO), "Corrige ops/tecnicas.json").toEqual([]);
  });

  it("las causas vienen de issues.mjs, no se copian", () => {
    expect(CAUSAS).toEqual(Object.keys(GRUPOS.causa.valores));
  });

  it("tiene las seis técnicas del plan", () => {
    expect(CATALOGO.tecnicas.map((t) => t.id).sort()).toEqual(
      ["arbol_de_fallos", "cinco_porques", "cronologia", "espina_de_pescado", "hipotesis_en_competencia", "kepner_tregoe"],
    );
  });

  it.each(CAUSAS)("la causa %s sale con una técnica principal", (causa) => {
    const r = tecnicasPara(causa);
    expect(r.principal?.id).toBeTruthy();
    expect(Object.keys(PRODUCTOS)).toContain(r.principal.produce);
  });

  it("las reglas del encargo #338: entorno → ES / NO ES, coordinación → cronología, sin comprobar → hipótesis", () => {
    expect(tecnicasPara("entorno").principal.id).toBe("kepner_tregoe");
    expect(tecnicasPara("coordinacion").principal.id).toBe("cronologia");
    expect(tecnicasPara("sin-comprobar").principal.id).toBe("hipotesis_en_competencia");
  });

  it("los criterios de parada son los tres de FLUJO.md", () => {
    expect(Object.keys(PARADAS)).toEqual(["mecanismo_cambiable", "fuera_de_control", "sin_evidencia"]);
    const flujo = readFileSync(join(RAIZ, "docs/ops/FLUJO.md"), "utf8");
    expect(flujo).toMatch(/se acaba\s+la evidencia/);
    expect(flujo).toMatch(/fuera de nuestro control/);
  });
});

describe("la skill causa-raiz cita el catálogo y no lo copia", () => {
  const ruta = join(RAIZ, ".claude/skills/causa-raiz/SKILL.md");
  const skill = existsSync(ruta) ? readFileSync(ruta, "utf8") : "";

  it("nombra el catálogo y el comando", () => {
    expect(skill).toContain("ops/tecnicas.json");
    expect(skill).toContain("npm run tecnica");
  });

  it("no copia los pasos de ninguna técnica", () => {
    const pasos = CATALOGO.tecnicas.flatMap((t) => t.pasos);
    const copiados = pasos.filter((x) => skill.includes(x));
    expect(copiados, "Los pasos viven en ops/tecnicas.json: cítalo").toEqual([]);
  });
});

describe("npm run tecnica", () => {
  const correr = (...args) => spawnSync(process.execPath, [join(RAIZ, "scripts/oficio.mjs"), ...args], { encoding: "utf8" });

  it("con una causa buena, dice la técnica principal", () => {
    const r = correr("tecnica", "entorno");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("kepner_tregoe");
  });

  it("con una causa que no existe, falla con la lista buena", () => {
    const r = correr("tecnica", "inventada");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("vigilante-hueco");
  });
});

describe("autotest: cada regla falla con datos malos", () => {
  const casos = [
    ["causa sin técnica", (c) => { delete c.por_causa.codigo; }, "causa-sin-tecnica"],
    ["causa inventada", (c) => { c.por_causa.inventada = { principal: "cronologia", apoyo: [], porque: "x".repeat(40) }; }, "causa-desconocida"],
    ["principal desconocida", (c) => { c.por_causa.entorno.principal = "tarot"; }, "tecnica-desconocida"],
    ["apoyo desconocido", (c) => { c.por_causa.entorno.apoyo = ["tarot"]; }, "tecnica-desconocida"],
    ["producto fuera del vocabulario", (c) => { c.tecnicas[0].produce = "informe"; }, "produce"],
    ["parada fuera del vocabulario", (c) => { c.tecnicas[0].paradas = ["cansancio"]; }, "parada"],
    ["técnica que no admite quedarse sin evidencia", (c) => { c.tecnicas[0].paradas = ["mecanismo_cambiable"]; }, "parada"],
    ["técnica sin uso", (c) => { c.tecnicas.push({ ...c.tecnicas[0], id: "tarot" }); }, "tecnica-sin-uso"],
    ["campo desconocido", (c) => { c.tecnicas[0].precio = 1; }, "forma"],
    ["pocos pasos", (c) => { c.tecnicas[0].pasos = ["uno largo de verdad"]; }, "pasos"],
    ["cuándo vacío", (c) => { c.tecnicas[0].cuando = "siempre"; }, "texto"],
  ];
  it.each(casos)("%s", (_n, romper, regla) => {
    const c = copia();
    romper(c);
    expect(reglas(problemas(c))).toEqual([regla]);
  });
});
