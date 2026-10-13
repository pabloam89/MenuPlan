// Vigila el pool de buenas prácticas por agente (parte de #652): ops/pool/*.json contra
// ops/estandares-agentes.json, con el lector scripts/lib/pool.mjs.
import { describe, expect, it } from "vitest";

import { agentesEnDisco, leerEstandares, problemasDeEstandares } from "../scripts/lib/estandaresAgentes.mjs";
import { cifrasDeAgente, leerPool, problemasDePool, RAIZ_REPO, reglasDeAgente, terminoDeProyecto } from "../scripts/lib/pool.mjs";

const estandares = leerEstandares(RAIZ_REPO);
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
    expect(c.reglas_con_practica_de_campo).toBe(7);
    expect(c.practicas).toBe(29);
    expect(c.por_estado).toEqual({ cubierta: 14, pendiente: 13, descartada: 2 });
    expect(c.por_origen).toEqual({ campo: 25, casa: 4 });
    expect(c.por_estado).toEqual({ cubierta: 14, pendiente: 13, descartada: 2 });
    expect(c.por_origen).toEqual({ campo: 25, casa: 4 });
    expect(Object.values(c.por_estado).reduce((a, b) => a + b, 0)).toBe(c.practicas);
  });

  it("orquestador cierra las reglas, el constructor solo tiene el oficio de diseño inventariado y sus cifras cuadran con los datos", () => {
    for (const [agente, reglas, deCampo, practicas, porEstado, porOrigen, cierra] of [
      ["orquestador", 9, 7, 23, { cubierta: 9, pendiente: 11, descartada: 3 }, { campo: 21, casa: 2 }],
      // Tras #688 las 90 reglas de los cuatro constructores son de uno: 22 de ellas eran las de diseno; faltan los oficios de datos, bot e infraestructura.
      ["constructor", 90, 9, 50, { cubierta: 24, pendiente: 24, descartada: 2 }, { campo: 36, casa: 14 }, false],
    ]) {
      expect(pool.agentes[agente].cierra_reglas).toBe(cierra ?? true);
      const c = cifrasDeAgente(pool, estandares, agente);
      expect(c.reglas).toBe(reglas);
      expect(c.reglas_con_practica_de_campo).toBe(deCampo);
      expect(c.practicas).toBe(practicas);
      expect(c.por_estado).toEqual(porEstado);
      expect(c.por_origen).toEqual(porOrigen);
    }
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

  it("el motivo y el campo también vigilan los términos de proyecto", () => {
    rompe((p) => { practica(p, "veredicto-escrito-en-el-cambio").motivo = "Mecanismo propio de MenuPlan que no está en ninguna fuente leída del oficio"; }, "el motivo nombra «MenuPlan»");
    rompe((p) => { p.agentes["auditor-datos"].campo = "Modelado de datos para Supabase y su calidad en general"; }, "el campo nombra «Supabase»");
  });
  it("un id repetido", () => rompe((p) => { practica(p, "severidad-por-impacto").id = "no-reescribir-en-bloque"; }, "id repetido"));
  it("un agente distinto al del fichero", () => rompe((p) => { practica(p, "severidad-por-impacto").agente = "datos"; }, "está en auditor-datos.json"));
  it("una práctica que acaba en punto", () => rompe((p) => { practica(p, "severidad-por-impacto").practica += "."; }, "no acaba en punto"));

  it("los dominios del pool solo valen para una fuente con uso pool", () => {
    const e = structuredClone(estandares);
    const agentes = agentesEnDisco(RAIZ_REPO);
    expect(problemasDeEstandares(e, agentes, RAIZ_REPO).filter((m) => m.includes("documentación admitida"))).toEqual([]);
    delete e.fuentes["fowler-evodb"].uso;
    expect(problemasDeEstandares(e, agentes, RAIZ_REPO).join("\n")).toContain("martinfowler.com no es una documentación admitida");
  });

  it("un término de proyecto se busca por palabra entera", () => {
    const ts = pool.vocabularios.terminos_de_proyecto;
    expect(terminoDeProyecto("la descripción del valor, sin Lolas", ts)).toBeUndefined();
    expect(terminoDeProyecto("un fichero en api/ cualquiera", ts)).toBe("api/");
    expect(terminoDeProyecto("cierra la capa de la API", ts)).toBeUndefined();
    expect(terminoDeProyecto("la función Lola, aparte", ts)).toBe("Lola");
  });

  it("la lista de términos de proyecto se lee del vocabulario", () => {
    expect(terminoDeProyecto("revisa la tabla households", pool.vocabularios.terminos_de_proyecto)).toBe("households");
    expect(terminoDeProyecto("revisa cada tabla", pool.vocabularios.terminos_de_proyecto)).toBeUndefined();
  });
});
