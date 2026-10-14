import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CAMPOS_TERMINO, citasDeTerminoAEntidadVertical, leerGlosarioDeProyecto, problemasDeGlosario, problemasDeLadosDelGlosario } from "../scripts/lib/glosario.mjs";
import { leerCatalogo, leerJsonOCatalogo } from "../scripts/lib/catalogos.mjs";
import { SCOPES } from "../scripts/lib/entidades.mjs";

/**
 * El lado de cada término del glosario (#710, programa #652, PR 7). Cada término lleva su `scope` (el mismo
 * vocabulario que una entidad, SCOPES): los horizontales viven en ops/glosario/terminos/ y los verticales en el
 * glosario de su proyecto (ops/proyectos/<id>/glosario/), con su `project`. Falla cuando:
 *  1. a un término le falta el `scope` o no es del vocabulario (lo mira `problemasDeGlosario`, ops/glosario.test.js);
 *  2. un término está en la carpeta que no es de su lado, o lleva un `project` que no toca;
 *  3. un término horizontal nombra una entidad vertical (una clase de la casa no se apoya en una pieza del proyecto).
 * Abajo, cada regla se ve fallar con datos malos.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const casa = leerCatalogo(RAIZ, "ops/glosario/").terminos;
const proyecto = leerGlosarioDeProyecto(RAIZ);
const registro = leerJsonOCatalogo(RAIZ, "ops/entidades.json");
const copia = (x) => JSON.parse(JSON.stringify(x));
const lados = (c = casa, p = proyecto, r = registro) => problemasDeLadosDelGlosario(c, p, r);

describe("el lado de cada término de hoy", () => {
  it("`scope` es un campo obligatorio y todos lo llevan", () => {
    expect(CAMPOS_TERMINO).toContain("scope");
    expect(casa.length).toBeGreaterThan(300);
    expect(casa.filter((t) => !(t.scope in SCOPES)).map((t) => t.termino)).toEqual([]);
  });

  it("cada término está en la carpeta de su lado, y ninguno horizontal nombra una entidad vertical", () => {
    expect(lados()).toEqual([]);
  });

  it("hay un glosario de proyecto, el de HoMenu, y no está vacío", () => {
    expect(Object.keys(proyecto)).toContain("homenu");
    expect(proyecto.homenu.terminos.length).toBeGreaterThan(0);
  });
});

describe("autotest del lado de los términos (visto fallar con datos malos)", () => {
  const entidades = [{ id: "x", scope: "horizontal" }, { id: "y", scope: "vertical" }];
  const reg = { projects: [{ id: "homenu" }], entities: entidades };
  const h = { termino: "uno", scope: "horizontal", entidades: [{ entidad: "x", relacion: "campo_de" }] };
  const v = { termino: "dos", scope: "vertical", project: "homenu", entidades: [{ entidad: "y", relacion: "campo_de" }] };
  const delProyecto = { homenu: { project: "homenu", terminos: [v] } };

  it("lo bueno pasa", () => {
    expect(lados([h], delProyecto, reg)).toEqual([]);
  });

  it("un término vertical en la carpeta de la casa", () => {
    expect(lados([{ ...h, scope: "vertical" }], {}, reg).join("\n")).toMatch(/uno: está en ops\/glosario\/ y su scope es «vertical»/);
  });

  it("un término de la casa con project", () => {
    expect(lados([{ ...h, project: "homenu" }], {}, reg).join("\n")).toMatch(/uno: está en ops\/glosario\/ y lleva project «homenu»/);
  });

  it("un término horizontal en el glosario de un proyecto", () => {
    expect(lados([], { homenu: { project: "homenu", terminos: [{ ...v, scope: "horizontal" }] } }, reg).join("\n")).toMatch(/dos: está en el glosario de homenu y su scope es «horizontal»/);
  });

  it("un término de proyecto sin su project, o con el de otro", () => {
    expect(lados([], { homenu: { project: "homenu", terminos: [{ ...v, project: "otro" }] } }, reg).join("\n")).toMatch(/dos: está en el glosario de homenu y lleva project «otro»/);
  });

  it("un glosario de proyecto que no es de un proyecto de entidades.json, o con otro project", () => {
    expect(lados([], { fantasma: { project: "fantasma", terminos: [] } }, reg).join("\n")).toMatch(/«fantasma» no es un proyecto/);
    expect(lados([], { homenu: { project: "otro", terminos: [] } }, reg).join("\n")).toMatch(/su project es «otro», no «homenu»/);
  });

  it("un término horizontal que nombra una entidad vertical", () => {
    const malo = { ...h, entidades: [{ entidad: "y", relacion: "campo_de" }] };
    expect(lados([malo], delProyecto, reg).join("\n")).toMatch(/uno → y: un término horizontal nombra una entidad vertical/);
    expect(citasDeTerminoAEntidadVertical([malo, v], entidades)).toEqual(["uno → y"]);
  });

  it("un término vertical que solo nombra entidades horizontales", () => {
    const malo = { ...v, entidades: [{ entidad: "x", relacion: "campo_de" }] };
    expect(lados([], { homenu: { project: "homenu", terminos: [malo] } }, reg).join("\n")).toMatch(/dos: es vertical y solo nombra entidades horizontales/);
  });

  it("la forma: sin scope, con un scope inventado, vertical sin project y horizontal con project", () => {
    const base = { termino: "t", estado: "activo", clase: "campo", dominio: "base", definicion: "Un campo que dice algo de una pieza concreta del sistema.", sinonimos_prohibidos: [], aplica_a: ["todas"] };
    const g = (t) => ({ zonas: { skills: ["x"] }, terminos: [{ ...base, ...t }] });
    const sin = { ...base };
    expect(problemasDeGlosario(g(sin)).join("\n")).toMatch(/t: falta scope/);
    expect(problemasDeGlosario(g({ scope: "puente" })).join("\n")).toMatch(/t: scope «puente» fuera del vocabulario/);
    expect(problemasDeGlosario(g({ scope: "vertical" })).join("\n")).toMatch(/t: es vertical y no lleva project/);
    expect(problemasDeGlosario(g({ scope: "horizontal", project: "homenu" })).join("\n")).toMatch(/t: es horizontal y lleva project «homenu»/);
    expect(problemasDeGlosario(g({ scope: "horizontal" })).join("\n")).not.toMatch(/scope|project/);
    const mala = copia(g({ scope: "horizontal" }));
    delete mala.terminos[0].scope;
    expect(problemasDeGlosario(mala).join("\n")).toMatch(/falta scope/);
  });
});
