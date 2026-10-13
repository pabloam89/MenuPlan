// Vigila el pool de buenas prácticas por agente (parte de #652): ops/pool/*.json contra
// ops/estandares-agentes.json, con el lector scripts/lib/pool.mjs.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cifrasDeAgente, leerPool, problemasDePool, RAIZ_REPO, reglasDeAgente, terminoDeProyecto } from "../scripts/lib/pool.mjs";

const estandares = JSON.parse(readFileSync(join(RAIZ_REPO, "ops/estandares-agentes.json"), "utf8"));
const pool = leerPool();
const practica = (p, id) => p.agentes["auditor-datos"].practicas.find((x) => x.id === id);

describe("pool de buenas prácticas", () => {
  it("el pool del repo no tiene problemas", () => {
    expect(problemasDePool(pool, estandares)).toEqual([]);
  });

  it("el piloto cierra las reglas: cada regla de auditor-datos responde a una práctica", () => {
    expect(pool.agentes["auditor-datos"].cierra_reglas).toBe(true);
    const reglas = reglasDeAgente(estandares, "auditor-datos");
    expect(reglas).toHaveLength(11);
    const cubiertas = new Set(pool.agentes["auditor-datos"].practicas.flatMap((p) => p.cubierta_por ?? []));
    expect(reglas.filter((r) => !cubiertas.has(r))).toEqual([]);
  });

  it("toda práctica lleva fecha y toda práctica de campo, una fuente externa", () => {
    for (const p of pool.agentes["auditor-datos"].practicas) {
      expect(p.revisada).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (p.origen === "campo") expect(estandares.fuentes[p.fuente].tipo).not.toBe("casa");
    }
  });

  it("las cifras del piloto cuadran con los datos", () => {
    const c = cifrasDeAgente(pool, estandares, "auditor-datos");
    expect(c.reglas).toBe(11);
    expect(c.reglas_con_fuente_externa_hoy).toBe(0);
    expect(c.reglas_con_practica_de_campo).toBe(9);
    expect(Object.values(c.por_estado).reduce((a, b) => a + b, 0)).toBe(c.practicas);
  });
});

// Cada control se ve fallar: se rompe una copia del pool y el problema sale con su causa.
describe("el control falla cuando el pool se rompe", () => {
  const rompe = (cambia, esperado) => {
    const p = structuredClone(pool);
    cambia(p);
    expect(problemasDePool(p, estandares).join("\n")).toContain(esperado);
  };

  it("una fuente que no existe", () => rompe((p) => { practica(p, "severidad-por-impacto").fuente = "no-existe"; }, "no está en el catálogo de fuentes"));
  it("una práctica de campo con fuente de la casa", () => rompe((p) => { practica(p, "severidad-por-impacto").fuente = "casa-principios-datos"; }, "cita una fuente de la casa"));
  it("una práctica de casa sin motivo", () => rompe((p) => { delete practica(p, "veredicto-escrito-en-el-cambio").motivo; }, "lleva motivo"));
  it("una cubierta que apunta a una regla que no existe", () => rompe((p) => { practica(p, "severidad-por-impacto").cubierta_por = ["auditor-datos/juzgar-migracion/Inventada"]; }, "no es una regla de auditor-datos"));
  it("una regla sin práctica", () => rompe((p) => { const x = practica(p, "severidad-por-impacto"); x.estado = "pendiente"; delete x.cubierta_por; }, "no responde a ninguna práctica"));
  it("una práctica pendiente sin fecha", () => rompe((p) => { delete practica(p, "cambio-incompatible-en-fases").revisada; }, "sin fecha revisada"));
  it("un estado fuera del vocabulario", () => rompe((p) => { practica(p, "cambio-incompatible-en-fases").estado = "quizá"; }, "fuera del vocabulario"));
  it("una descartada sin motivo", () => rompe((p) => { delete practica(p, "identificadores-persistentes").motivo; }, "descartada sin motivo"));
  it("una fuente del pool que ninguna práctica cita", () => {
    const e = structuredClone(estandares);
    e.fuentes["sobrante-pool"] = { nombre: "Fuente que nadie cita", url: "https://martinfowler.com/x", uso: "pool" };
    expect(problemasDePool(pool, e).join("\n")).toContain("ninguna práctica la cita");
  });

  it.each(["HoMenu", "MenuPlan", "Supabase", "Lola", "Vercel", "Telegram", "households", "src/data", "api/_bot"])("nombrar «%s» en la práctica", (t) => {
    rompe((p) => { practica(p, "severidad-por-impacto").practica = `Gradúa cada hallazgo por lo que se rompe en ${t} si no se atiende`; }, "es de oficio, no de terreno");
  });

  it("la lista de términos de proyecto se lee del vocabulario", () => {
    expect(terminoDeProyecto("revisa la tabla households", pool.vocabularios.terminos_de_proyecto)).toBe("households");
    expect(terminoDeProyecto("revisa cada tabla", pool.vocabularios.terminos_de_proyecto)).toBeUndefined();
  });
});
