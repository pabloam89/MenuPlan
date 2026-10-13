import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DOMINIOS, leerGlosario } from "../scripts/lib/glosario.mjs";
import { MAX_PARECIDO, cifrasDeDominios, equivocosEntreDominios, parecido, porDominio, problemasDeDominios, problemasDeDominiosDelGlosario } from "../scripts/lib/glosarioDominios.mjs";

/**
 * Los dominios del glosario (F1 de #652, docs/ops/BASE-FORJA.md §9.2). Dos pisos: la base y los dominios.
 * Vigila:
 *
 *  1. que cada término lleva un `dominio` del vocabulario cerrado `DOMINIOS` (la forma la mira
 *     `problemasDeGlosario` en ops/glosario.test.js) y que cada dominio tiene términos;
 *  2. el invariante: un glosario de dominio solo añade o estrecha, nunca redefine uno de la base
 *     (`dominio-redefine-base`, `definicion-choca-con-base`, `equivoco-entre-dominios`);
 *  3. que las relaciones entre términos de dominios distintos son legítimas: un término de dominio
 *     estrecha a la base (su `amplio` es de la base) y la base nunca cuelga de un dominio.
 *
 * Abajo, un autotest: cada regla falla con datos malos. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const G = leerGlosario(RAIZ);
const copia = () => JSON.parse(JSON.stringify(G));
const T = (g, n) => g.terminos.find((t) => t.termino === n);

describe("los dominios del glosario de hoy", () => {
  it("cada término tiene su dominio y cada dominio tiene términos activos", () => {
    for (const t of G.terminos) expect(Object.keys(DOMINIOS), t.termino).toContain(t.dominio);
    const c = cifrasDeDominios(G);
    for (const d of Object.keys(DOMINIOS)) expect(c[d], d).toBeGreaterThan(0);
    expect(Object.values(c).reduce((a, n) => a + n, 0)).toBe(G.terminos.filter((t) => t.estado !== "retirado").length);
  });

  it("la clasificación de los términos que entraron con #654 y #655 y de los que se movieron en F1", () => {
    const de = (n) => T(G, n).dominio;
    for (const n of ["componente de diseño", "patrón de diseño", "perfil de diseño", "sistema de diseño", "token de diseño"]) expect(de(n), n).toBe("diseno");
    for (const n of ["comprobación", "proyecto"]) expect(de(n), n).toBe("base");
    for (const n of ["plano", "recurso", "repositorio", "tipo de encargo", "workflow"]) expect(de(n), n).toBe("ops");
    // movidos respecto a la propuesta del diseño, con su razón: su definición habla de la base de datos o de issues y PR
    for (const n of ["módulo", "aplicar"]) expect(de(n), n).toBe("datos");
    for (const n of ["fusionar", "decisión", "ficha"]) expect(de(n), n).toBe("ops");
    expect(de("persona de la casa")).toBe("producto");
    // los once términos que entran en F1 son de la base
    for (const n of ["meta", "base", "forja", "pieza", "tipo de tarea", "ámbito", "acción", "fuerza", "veredicto", "dominio", "paso"]) expect(de(n), n).toBe("base");
  });

  it("el glosario de hoy cumple el invariante: ningún dominio redefine la base", () => {
    expect(problemasDeDominiosDelGlosario(G)).toEqual([]);
  });

  it("las relaciones que cruzan de dominio son legítimas: la base no tiene por amplio a un término de dominio", () => {
    const por = porDominio(G);
    const dominiosDe = new Map(G.terminos.map((t) => [t.termino, t.dominio]));
    for (const t of por.base) if (typeof t.amplio === "string") expect(dominiosDe.get(t.amplio), `${t.termino} → ${t.amplio}`).toBe("base");
    const cruzan = G.terminos.flatMap((t) => [t.amplio, ...(t.estrecho ?? []), ...(t.relacionado ?? [])].filter(Boolean).map((o) => [t.termino, o])).filter(([a, b]) => dominiosDe.get(a) !== dominiosDe.get(b));
    expect(cruzan.length).toBeGreaterThan(0);
  });
});

describe("autotest del invariante (visto fallar con datos malos)", () => {
  const por = porDominio(G);
  const base = por.base;
  const nuevo = (extra) => ({ termino: "cola", estado: "activo", clase: "artefacto", dominio: "datos", definicion: "Una lista de trabajos que espera su turno para correr, uno tras otro.", sinonimos_prohibidos: [], aplica_a: ["todas"], ...extra });

  it("un término de dominio con el nombre de uno de la base redefine la base", () => {
    expect(problemasDeDominios(base, [nuevo({ termino: "norma" })]).join()).toMatch(/dominio-redefine-base: norma \(datos\) lleva el nombre de un término de la base/);
    expect(problemasDeDominios(base, [nuevo({ termino: "Estándar" })]).join()).toMatch(/dominio-redefine-base/);
  });

  it("también con el nombre de un sinónimo prohibido de la base, o de un término retirado de la base", () => {
    expect(problemasDeDominios(base, [nuevo({ termino: "bug" })]).join()).toMatch(/dominio-redefine-base: bug \(datos\) lleva un nombre que la base prohíbe \(di «fallo»\)/);
    expect(problemasDeDominios(base, [nuevo({ termino: "criterio" })]).join()).toMatch(/dominio-redefine-base: criterio \(datos\)/);
  });

  it("prohibir en un dominio un término de la base, o repetir un sinónimo de la base, redefine la base", () => {
    expect(problemasDeDominios(base, [nuevo({ sinonimos_prohibidos: ["norma"] })]).join()).toMatch(/cola prohíbe «norma», que es un término de la base/);
    expect(problemasDeDominios(base, [nuevo({ sinonimos_prohibidos: ["bug"] })]).join()).toMatch(/cola prohíbe «bug», que ya es sinónimo prohibido de fallo en la base/);
  });

  it("la base no puede colgar de un dominio (su amplio es de la base)", () => {
    const b = JSON.parse(JSON.stringify(base));
    b.find((t) => t.termino === "revisor").amplio = "cola";
    expect(problemasDeDominios(b, [nuevo()]).join()).toMatch(/revisor \(base\) tiene por amplio a cola, de un dominio/);
  });

  it("un término de dominio puede estrechar con amplio hacia la base sin que sea un problema", () => {
    expect(problemasDeDominios(base, [nuevo({ amplio: "test", clase: "artefacto" })])).toEqual([]);
  });

  it("una definición de dominio casi igual a la de la base con otro nombre choca", () => {
    const def = T(G, "norma").definicion;
    expect(problemasDeDominios(base, [nuevo({ definicion: def })]).join()).toMatch(/definicion-choca-con-base: cola y norma se definen casi igual/);
    expect(parecido(def, def)).toBe(1);
    expect(parecido("Una cosa que corre.", "Un fichero sin nada común.")).toBeLessThan(MAX_PARECIDO);
    expect(problemasDeDominios(base, [nuevo({ termino: "cola", definicion: "Una lista de trabajos que espera su turno." })])).toEqual([]);
  });

  it("el mismo nombre en dos dominios con definiciones distintas es un equívoco; con la misma, no", () => {
    const a = { ...nuevo({ termino: "token", dominio: "diseno", definicion: "Un valor visual con nombre de rol que los componentes usan." }) };
    const b = { ...nuevo({ termino: "token", dominio: "ops", definicion: "Un secreto corto que da acceso a un servicio durante un tiempo." }) };
    expect(equivocosEntreDominios({ diseno: [a], ops: [b] }).join()).toMatch(/equivoco-entre-dominios: token está en diseno y en ops con definiciones distintas/);
    expect(equivocosEntreDominios({ diseno: [a], ops: [{ ...b, definicion: `  ${a.definicion.toUpperCase()} ` }] })).toEqual([]);
    expect(equivocosEntreDominios({ diseno: [a, { ...a, termino: "otro" }] })).toEqual([]);
  });

  it("sobre el glosario entero: un término de ops con el nombre de uno de la base falla", () => {
    const g = copia();
    T(g, "rama").sinonimos_prohibidos.push("pieza");
    expect(problemasDeDominiosDelGlosario(g).join()).toMatch(/rama prohíbe «pieza», que es un término de la base/);
    const h = copia();
    h.terminos.push(nuevo({ termino: "juez", dominio: "ops" }));
    expect(problemasDeDominiosDelGlosario(h).join()).toMatch(/juez \(ops\) lleva el nombre de un término de la base/);
  });
});
