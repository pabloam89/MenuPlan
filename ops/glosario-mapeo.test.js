import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CLASES, MOTIVOS_SIN_ENTIDAD, RELACION_POR_CLASE, RELACIONES_ENTIDAD, leerGlosario } from "../scripts/lib/glosario.mjs";
import { cifrasDeMapeo, entidadesSinTermino, problemasDeMapeo, terminosPorEntidad, terminosSinEntidad } from "../scripts/lib/glosarioMapeo.mjs";

/**
 * El mapeo término → entidad (F1 de #652, docs/ops/BASE-FORJA.md §10). Cada término activo nombra de 0 a N
 * entidades de `ops/entidades.json` con `entidades: [{ entidad, relacion }]`, y la relación la fija su clase:
 * artefacto denota, campo campo_de, estado valor_de, rol rol_de, acción accion_sobre, lugar ubicacion_de.
 * Vigila:
 *
 *  1. que la relación de cada término es la de su clase y que la entidad existe (la forma de cada término la
 *     mira `problemasDeGlosario` en ops/glosario.test.js);
 *  2. que un artefacto sin entidad dice por qué con un motivo cerrado (`sin_entidad`);
 *  3. que toda entidad activa no vertical la nombra algún término, y que el `term` de una entidad coincide con
 *     un término que la nombra;
 *  4. que el mapeo acepta un término cuya entidad está retirada (juez, despliegue, regla…).
 *
 * Abajo, un autotest: cada regla falla con datos malos. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const G = leerGlosario(RAIZ);
const REG = JSON.parse(readFileSync(join(RAIZ, "ops/entidades.json"), "utf8"));
const copia = (x) => JSON.parse(JSON.stringify(x));
const T = (g, n) => g.terminos.find((t) => t.termino === n);

describe("el mapeo del glosario de hoy", () => {
  it("no tiene ningún problema contra ops/entidades.json", () => {
    expect(problemasDeMapeo(G, REG), "Corrige entidades o sin_entidad en ops/glosario/terminos/").toEqual([]);
  });

  it("la relación de cada término es la de su clase", () => {
    for (const t of G.terminos) for (const x of t.entidades ?? []) expect(x.relacion, `${t.termino} → ${x.entidad}`).toBe(RELACION_POR_CLASE[t.clase]);
    expect(Object.keys(RELACIONES_ENTIDAD).sort()).toEqual(Object.values(RELACION_POR_CLASE).sort());
  });

  it("ningún artefacto se queda sin entidad ni motivo, y los motivos usados son del vocabulario", () => {
    expect(terminosSinEntidad(G)).toEqual([]);
    for (const t of G.terminos.filter((x) => x.sin_entidad)) expect(Object.keys(MOTIVOS_SIN_ENTIDAD), t.termino).toContain(t.sin_entidad);
  });

  it("toda entidad activa no vertical tiene al menos un término, y las verticales son las únicas sin él", () => {
    expect(entidadesSinTermino(G, REG)).toEqual([]);
    const por = terminosPorEntidad(G);
    const sin = REG.entities.filter((e) => e.status === "active" && !por.has(e.id));
    expect(sin.length).toBeGreaterThan(0);
    for (const e of sin) expect(e.scope, e.id).toBe("vertical");
  });

  it("el mapeo acepta un término cuya entidad está retirada y distingue los dos casos", () => {
    // «regla»: su entidad rule se retiró y lo que queda (el fichero de .claude/rules/) no es una entidad
    expect(REG.entities.find((e) => e.id === "rule").status).toBe("retired");
    expect(T(G, "regla")).toMatchObject({ clase: "artefacto", sin_entidad: "retirado" });
    expect(T(G, "regla").entidades).toBeUndefined();
    // «clave», «bóveda», «aprendizaje», «juez», «despliegue»: su entidad se retiró y el término nombra la que la sustituye
    for (const [t, retirada, activa] of [["clave", "secret", "resource"], ["bóveda", "vault", "resource"], ["aprendizaje", "learning", "root-problem"], ["juez", "judge", "agent"], ["despliegue", "deployment", "event"]]) {
      expect(REG.entities.find((e) => e.id === retirada).status, retirada).toBe("retired");
      expect(T(G, t).entidades.map((x) => x.entidad), t).toContain(activa);
    }
  });

  it("los 15 artefactos que ninguna entidad nombraba (§10.2) quedan resueltos, con relación o con motivo", () => {
    const esperado = {
      guardia: ["hook"], "caso de prueba": ["eval"], tarea: ["session"], control: ["verification"],
      ficha: "componente", arreglo: "componente", evidencia: "componente", capa: "componente", test: "componente",
      hallazgo: "candidato", "juicio de skill": "candidato", plantilla: "paso", informe: "salida", defecto: "salida", entidad: "meta",
    };
    for (const [n, v] of Object.entries(esperado)) {
      if (Array.isArray(v)) expect(T(G, n).entidades.map((x) => x.entidad), n).toEqual(v);
      else expect(T(G, n).sin_entidad, n).toBe(v);
    }
  });

  it("las cifras del mapeo cuadran con los términos", () => {
    const c = cifrasDeMapeo(G, REG);
    const activos = G.terminos.filter((t) => t.estado !== "retirado");
    expect(c.terminos).toBe(activos.length);
    expect(c.con_entidad + c.sin_entidad + c.sin_mapeo).toBe(c.terminos);
    expect(Object.values(c.motivos).reduce((a, n) => a + n, 0)).toBe(c.sin_entidad);
    // sin_mapeo son solo términos que no son artefacto (acciones, campos…): para ellos 0 entidades vale
    expect(activos.filter((t) => !t.entidades && !t.sin_entidad).every((t) => t.clase !== "artefacto")).toBe(true);
    expect(Object.keys(CLASES)).toContain("accion");
  });
});

describe("autotest del mapeo (visto fallar con datos malos)", () => {
  const con = (cambio, registro = REG) => { const g = copia(G); const r = copia(registro); cambio(g, r); return problemasDeMapeo(g, r).join("\n"); };

  it("una entidad que no existe", () => {
    expect(con((g) => { T(g, "rama").entidades = [{ entidad: "inventada", relacion: "denota" }]; })).toMatch(/rama: la entidad «inventada» no existe en ops\/entidades.json/);
  });

  it("un artefacto sin entidad ni motivo", () => {
    expect(con((g) => { const t = T(g, "rama"); delete t.entidades; })).toMatch(/rama: artefacto sin entidad ni motivo \(termino-sin-entidad\)/);
  });

  it("una entidad activa no vertical que ningún término nombra", () => {
    expect(con((g, r) => { T(g, "decisión").entidades = [{ entidad: "issue", relacion: "denota" }]; r.entities.find((e) => e.id === "decision").term = null; })).toMatch(/decision: entidad activa no vertical que ningún término nombra/);
  });

  it("el term de una entidad y el término tienen que coincidir", () => {
    expect(con((g) => { T(g, "rama").entidades = [{ entidad: "pull-request", relacion: "denota" }]; })).toMatch(/rama: la entidad branch lo lleva en term y el término no la nombra/);
    expect(con((g) => { const t = T(g, "rama"); delete t.entidades; t.sin_entidad = "componente"; })).toMatch(/rama: dice sin_entidad pero la entidad branch lo nombra/);
  });

  it("el en de un término que es una entidad activa también la nombra", () => {
    expect(con((g) => { T(g, "hook").entidades = [{ entidad: "skill", relacion: "denota" }]; })).toMatch(/hook: su en «hook» es una entidad activa y el término no la nombra/);
  });

  it("sin_entidad retirado solo si hay una entidad retirada con ese término", () => {
    expect(con((g) => { const t = T(g, "capa"); t.sin_entidad = "retirado"; })).toMatch(/capa: sin_entidad retirado, pero ninguna entidad retirada lleva este término/);
  });

  it("una entidad nueva no vertical sin término falla, una vertical no", () => {
    const base = { name: "Cosa", level: "piece", family: "work", term: null, source_of_truth: "none", id_format: "none", registry: "without_registry", status: "active", created_by: ["human"], readers: ["ops/entidades.json"] };
    expect(con((g, r) => { r.entities.push({ id: "cosa", scope: "horizontal", ...base }); })).toMatch(/cosa: entidad activa no vertical que ningún término nombra/);
    expect(con((g, r) => { r.entities.push({ id: "cosa", scope: "vertical", ...base }); })).toBe("");
  });
});
