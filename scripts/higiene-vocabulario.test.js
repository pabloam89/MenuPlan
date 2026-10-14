import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { leerExcepciones, leerGlosario, medir } from "./lib/glosario.mjs";
import { CODIGOS_VOCABULARIO, cifraDeHigiene, higieneDeVocabulario, lineaDeHallazgo } from "./lib/glosarioHigiene.mjs";

/**
 * La higiene del vocabulario (F1 de #652; skill `higiene-de-vocabulario`). Vigila que los seis códigos salgan:
 * un glosario malo hecho a propósito da los seis, el de hoy sale limpio, y `npm run glosario -- --higiene` lo dice
 * con una línea de cifra y una por hallazgo. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const G = leerGlosario(RAIZ);
const REG = JSON.parse(readFileSync(join(RAIZ, "ops/entidades.json"), "utf8"));
const copia = (x) => JSON.parse(JSON.stringify(x));
const T = (g, n) => g.terminos.find((t) => t.termino === n);

describe("los seis códigos de la higiene del vocabulario", () => {
  it("son seis, con capa formal o material y gravedad falta o aviso", () => {
    expect(Object.keys(CODIGOS_VOCABULARIO)).toEqual(["termino-sin-entidad", "entidad-sin-termino", "sinonimo-nuevo", "dominio-redefine-base", "definicion-choca-con-base", "equivoco-entre-dominios"]);
    for (const [c, x] of Object.entries(CODIGOS_VOCABULARIO)) {
      expect(["formal", "material"], c).toContain(x.capa);
      expect(x.gravedad, c).toBe(x.capa === "formal" ? "falta" : "aviso");
      expect(x.arreglo.length, c).toBeGreaterThan(20);
    }
  });

  it("el glosario de hoy sale limpio", () => {
    const h = higieneDeVocabulario(G, REG, { raiz: RAIZ, excepciones: leerExcepciones(RAIZ) });
    expect(h.map(lineaDeHallazgo)).toEqual([]);
    expect(cifraDeHigiene(G, h)).toMatch(/^higiene vocabulario: glosario terminos: \d+ faltas: 0 avisos: 0$/);
  });

  it("un glosario malo hecho a propósito da los seis códigos, cada uno con su arreglo", () => {
    const g = copia(G);
    const reg = copia(REG);
    const nuevo = (extra) => ({ termino: "cola", estado: "activo", clase: "campo", dominio: "datos", definicion: "Una lista de trabajos que espera su turno para correr.", sinonimos_prohibidos: [], aplica_a: ["todas"], ...extra });
    // 1. artefacto sin entidad ni motivo
    delete T(g, "rama").entidades;
    // 2. entidad no vertical que nadie nombra
    reg.entities.push({ id: "cosa", name: "Cosa", scope: "horizontal", level: "piece", family: "work", term: null, source_of_truth: "none", id_format: "none", registry: "without_registry", status: "active", created_by: ["human"], readers: ["ops/entidades.json"] });
    // 3. un sinónimo prohibido nuevo en una skill
    const medicion = medir(RAIZ, g, { leer: () => "Un bug en la guardia.\n", ficheros: (p) => (p === ".claude/skills/**/*.md" ? [".claude/skills/x/SKILL.md"] : []) });
    // 4. un dominio que lleva el nombre de un término de la base
    g.terminos.push(nuevo({ termino: "norma", dominio: "ops" }));
    // 5. una definición de dominio casi igual a la de la base
    g.terminos.push(nuevo({ termino: "mandato", dominio: "ops", definicion: T(g, "juez").definicion }));
    // 6. el mismo nombre en dos dominios con definiciones distintas
    g.terminos.push(nuevo({ termino: "componente de diseño", dominio: "ops", clase: "artefacto", definicion: "Un secreto corto que da acceso a un servicio durante un rato." }));
    const h = higieneDeVocabulario(g, reg, { medicion });
    expect([...new Set(h.map((x) => x.codigo))].sort()).toEqual(Object.keys(CODIGOS_VOCABULARIO).sort());
    for (const x of h) expect(x.arreglo, x.codigo).toBe(CODIGOS_VOCABULARIO[x.codigo].arreglo);
    expect(h.find((x) => x.codigo === "termino-sin-entidad").texto).toMatch(/^rama:/);
    expect(h.find((x) => x.codigo === "entidad-sin-termino").texto).toMatch(/^cosa:/);
    expect(h.find((x) => x.codigo === "sinonimo-nuevo").texto).toMatch(/«bug».*di «fallo»/);
    expect(h.find((x) => x.codigo === "dominio-redefine-base").texto).toMatch(/norma \(ops\) lleva el nombre de un término de la base/);
    expect(h.find((x) => x.codigo === "definicion-choca-con-base").texto).toMatch(/mandato y juez/);
    expect(h.filter((x) => x.codigo === "equivoco-entre-dominios").map((x) => x.texto).join()).toMatch(/componente de diseño está en (ops y en diseno|diseno y en ops)/);
    expect(cifraDeHigiene(g, h)).toMatch(/faltas: 5 avisos: 3$/);
  });

  it("solo hay una falta si es formal y un aviso si es material", () => {
    const g = copia(G);
    g.terminos.push({ termino: "mandato", estado: "activo", clase: "rol", dominio: "ops", definicion: T(g, "juez").definicion, sinonimos_prohibidos: [], aplica_a: ["todas"] });
    const h = higieneDeVocabulario(g, REG, {});
    expect(h.map((x) => `${x.codigo}:${x.gravedad}`)).toEqual(["definicion-choca-con-base:aviso"]);
  });
});

describe("npm run glosario -- --higiene", () => {
  it("dice la cifra y sale con 0 si no hay faltas", () => {
    const r = spawnSync(process.execPath, [join(RAIZ, "scripts/glosario.mjs"), "--higiene"], { cwd: RAIZ, encoding: "utf8" });
    expect(r.stdout).toMatch(/^higiene vocabulario: glosario terminos: \d+ faltas: 0 avisos: 0/m);
    expect(r.status).toBe(0);
  });
});
