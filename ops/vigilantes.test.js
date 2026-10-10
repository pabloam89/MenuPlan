import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ficherosDeGit } from "./ficherosGit.js";
import { esVigilado } from "../scripts/lib/normas.mjs";
import { casa, detectarEnumeradores, elegir, faltasDeDatos, globARegex, indiceDeTests, leerVigilantes } from "../scripts/lib/vecinos.mjs";

/**
 * La lista de los tests vigilantes de conjunto (ops/vigilantes.json, #356) y la
 * clase que cierra: «lanza los tests de los ficheros que tocas» deja fuera a los
 * que miran TODOS los ficheros de una carpeta o un tipo, y el CI cae en ellos.
 *
 * Tres cosas se vigilan aquí:
 *  1. la lista está bien formada y cada test que nombra existe;
 *  2. la búsqueda sistemática de tests que enumeran ficheros del repo no
 *     encuentra ninguno fuera de la lista (ni en `excepciones`, con su motivo);
 *  3. `npm run vecinos` elige el vigilante correcto para cada caso real que
 *     cayó en el CI (las evidencias del #356).
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datos = leerVigilantes(RAIZ);
const FICHEROS = ficherosDeGit(RAIZ);
const indice = indiceDeTests(RAIZ, FICHEROS);
const testsDe = (tocados) => elegir({ tocados, datos, indice }).tests.map((t) => t.test);
const A = (ruta) => ({ ruta, estado: "A" });
const M = (ruta) => ({ ruta, estado: "M" });
const D = (ruta) => ({ ruta, estado: "D" });

describe("la lista de vigilantes está bien formada", () => {
  it("no tiene faltas de forma", () => {
    expect(faltasDeDatos(datos)).toEqual([]);
  });

  it("cada test de la lista (vigilante o excepción) existe", () => {
    const nombrados = [...datos.vigilantes.flatMap((v) => v.tests), ...datos.excepciones.flatMap((e) => e.tests)];
    expect(nombrados.filter((t) => !FICHEROS.includes(t))).toEqual([]);
  });

  it("cada glob de `mira` casa con algún fichero del repo (si no, el vigilante nunca se activaría)", () => {
    const muertos = datos.vigilantes.flatMap((v) => v.mira.filter((g) => !FICHEROS.some((f) => casa([g], f))).map((g) => `${v.id}: ${g}`));
    expect(muertos).toEqual([]);
  });

  it("cada paso del CI apunta a un script que existe", () => {
    for (const p of datos.pasos) expect(existsSync(join(RAIZ, p.cmd[1])), p.id).toBe(true);
  });

  it("las rutas normativas de la lista y el trinquete de normas (esVigilado) dicen lo mismo para los .md", () => {
    const v = datos.vigilantes.find((x) => x.id === "frases-normativas");
    const distintos = FICHEROS.filter((f) => f.endsWith(".md")).filter((f) => casa(v.mira, f) !== esVigilado(f));
    expect(distintos, "esVigilado (scripts/lib/normas.mjs) y `frases-normativas.mira` se han separado").toEqual([]);
  });
});

describe("ningún test que enumera ficheros del repo queda fuera de la lista", () => {
  const enumeradores = detectarEnumeradores(RAIZ, FICHEROS);
  const conocidos = new Set([...datos.vigilantes.flatMap((v) => v.tests), ...datos.excepciones.flatMap((e) => e.tests)]);

  it("la búsqueda encuentra tests (no una lista vacía que pase en vacío)", () => {
    expect(enumeradores.length).toBeGreaterThan(40);
    for (const t of ["scripts/sinErroresTragados.test.js", "scripts/rulesets.test.js", ".claude/rutas.test.js", "ops/fuentes.test.js"]) expect(enumeradores.map((e) => e.test)).toContain(t);
  });

  it("todo test detectado es vigilante o excepción con motivo", () => {
    const sueltos = enumeradores.filter((e) => !conocidos.has(e.test)).map((e) => `${e.test} (${e.via})`);
    expect(sueltos, "Añádelo a un grupo de `vigilantes` de ops/vigilantes.json con el conjunto que mira, o a `excepciones` con el motivo de que no vigila ninguno").toEqual([]);
  });

  it("las excepciones siguen siendo ciertas: un test que ya no enumera sale de la lista", () => {
    const detectados = new Set(enumeradores.map((e) => e.test));
    const sobran = datos.excepciones.flatMap((e) => e.tests).filter((t) => !detectados.has(t));
    expect(sobran).toEqual([]);
  });
});

// Una o dos rutas de ejemplo por grupo → el test que debe salir. Estrechar un `mira` (p. ej.
// `scripts/**/*.mjs` → `scripts/*.mjs`) hace fallar la fila de su grupo.
const TABLA = [
  ["errores-tragados-scripts", "scripts/lib/x.mjs", "scripts/sinErroresTragados.test.js"],
  ["errores-tragados-scripts", ".claude/hooks/x.mjs", "scripts/sinErroresTragados.test.js"],
  ["errores-tragados-bot", "api/bot/x.js", "api/_bot/sinErroresTragados.test.js"],
  ["dueno-de-lo-que-ejecuta-un-hook", ".claude/hooks/x.mjs", "scripts/rulesets.test.js"],
  ["dueno-de-lo-que-ejecuta-un-hook", ".github/CODEOWNERS", "scripts/rulesets.test.js"],
  ["scripts-sin-caminos-sueltos", "scripts/lib/x.mjs", "scripts/lib/env.test.js"],
  ["cuota-de-gh", "scripts/lib/x.mjs", "scripts/cuotaGh.test.js"],
  ["cuota-de-gh", "docs/ops/x.md", "scripts/cuotaGh.test.js"],
  ["workflows", ".github/workflows/x.yml", "scripts/dependabot-auto.test.js"],
  ["formularios-de-issues", ".github/ISSUE_TEMPLATE/x.yml", "scripts/issues.test.js"],
  ["agentes", ".claude/agents/x.md", ".claude/agentes.test.js"],
  ["skills-forma", ".claude/skills/x/referencias/y.md", ".claude/skills.test.js"],
  ["skills-forma", ".claude/skills/x/SKILL.md", ".claude/voz.test.js"],
  ["juicios-de-skills", "ops/juicios-skills/github.json", "ops/criterios-skills.test.js"],
  ["rutas-citadas", ".claude/skills/x/referencias/y.md", ".claude/rutas.test.js"],
  ["frases-normativas", ".claude/skills/x/referencias/y.md", "ops/planos.test.js"],
  ["frases-normativas", "ops/X.md", "ops/normas.test.js"],
  ["glosario", "docs/ops/x.md", "ops/glosario.test.js"],
  ["redaccion-de-reglas", "ops/catalogo-nuevo.json", "ops/redaccion.test.js"],
  ["fuentes-y-modulos", "src/lib/x.js", "ops/modulos.test.js"],
  ["fuentes-y-modulos", "scripts/lib/x.mjs", "ops/fuentes.test.js"],
  ["cableado", "api/_bot/x.js", "supabase/cableado.test.js"],
  ["migraciones-sql", "supabase/migrations/9999_x.sql", "supabase/principios.test.js"],
  ["catalogo-de-recetas", "src/data/recipes/x.json", "src/data/model.test.js"],
  ["fuentes-sin-invisibles", "src/lib/x.js", "src/data/fuentesLimpias.test.js"],
  ["app-y-bot", "src/components/x.jsx", "src/components/coachAnchors.test.js"],
  ["zonas-del-catalogo", "src/utils/x.js", "src/lib/barreras.test.js"],
  ["cargadores-de-lib", "src/lib/x.js", "src/lib/cargadoresSinVacioEnError.test.js"],
  ["bot-sin-listas-a-mano", "api/_bot/x.js", "src/lib/comidas.test.js"],
  ["endpoints", "api/x.js", "api/_guard.test.js"],
  ["vigilantes", "scripts/x.test.js", "ops/vigilantes.test.js"],
  ["una-lista-de-tipos", "docs/x.md", ".claude/plantillas-skill.test.js"],
  ["una-escala-y-una-escalera", "ops/flujo.json", "ops/escalas.test.js"],
];

describe("tabla: ruta de ejemplo → vigilante que debe salir", () => {
  it("todos los grupos tienen al menos una fila", () => {
    expect(datos.vigilantes.map((v) => v.id).filter((id) => !TABLA.some((f) => f[0] === id))).toEqual([]);
  });
  it.each(TABLA)("%s · %s → %s", (grupo, ruta, esperado) => {
    expect(datos.vigilantes.find((v) => v.id === grupo).tests, "la fila apunta a un test que no es de su grupo").toContain(esperado);
    const plan = elegir({ tocados: [A(ruta)], datos, indice: new Map([...indice, [esperado, indice.get(esperado) ?? { texto: "", imports: new Set() }]]) });
    expect(plan.tests.map((t) => t.test)).toContain(esperado);
  });
});

describe("globARegex", () => {
  it("una llave sin cerrar lanza un error claro", () => {
    expect(() => globARegex("a/{b,c")).toThrow(/falta «}»/);
  });
});

describe("`npm run vecinos` elige el vigilante de cada caso que cayó en el CI (#356)", () => {
  it("1 · un catch nuevo en un script: sinErroresTragados", () => {
    expect(testsDe([M("scripts/issues.mjs")])).toContain("scripts/sinErroresTragados.test.js");
    expect(testsDe([A("scripts/lib/cosaNueva.mjs")])).toContain("scripts/sinErroresTragados.test.js");
  });

  it("2 · dos catch nuevos en un hook: sinErroresTragados", () => {
    expect(testsDe([M(".claude/hooks/buscar-antes.mjs")])).toContain("scripts/sinErroresTragados.test.js");
  });

  it("3 · texto nuevo en una skill, un script que ejecuta un hook y un catch: planos, rulesets y sinErroresTragados", () => {
    expect(testsDe([M(".claude/skills/github/SKILL.md")])).toContain("ops/planos.test.js");
    const script = testsDe([A("scripts/lib/cuotaGh.mjs")]);
    expect(script).toContain("scripts/rulesets.test.js");
    expect(script).toContain("scripts/sinErroresTragados.test.js");
  });

  it("4 · una ruta relativa citada en una skill: rutas.test.js y los pasos de higiene del CI", () => {
    const plan = elegir({ tocados: [M(".claude/skills/github/SKILL.md")], datos, indice });
    expect(plan.tests.map((t) => t.test)).toContain(".claude/rutas.test.js");
    expect(plan.pasos.map((p) => p.id)).toEqual(expect.arrayContaining(["skills-pr", "higiene-skills-pr"]));
  });

  it("borrar un fichero que otro cita también activa rutas.test.js", () => {
    expect(testsDe([D("scripts/lib/cualquiera.mjs")])).toContain(".claude/rutas.test.js");
  });

  it("una migración nueva se mide contra todas; una receta, contra el catálogo", () => {
    expect(testsDe([A("supabase/migrations/9999_prueba.sql")])).toEqual(expect.arrayContaining(["supabase/migrations.test.js", "supabase/principios.test.js"]));
    expect(testsDe([M("src/data/recipes/cualquiera.json")])).toContain("src/data/model.test.js");
  });

  it("el test propio del fichero siempre entra, y un test tocado se lanza a sí mismo", () => {
    expect(testsDe([M("scripts/issues.mjs")])).toContain("scripts/issues.test.js");
    const alTocarUnTest = testsDe([M("scripts/vecinos.test.js")]);
    expect(alTocarUnTest).toContain("scripts/vecinos.test.js");
    expect(alTocarUnTest, "un test tocado no activa a los vigilantes del código que excluyen los tests").not.toContain("scripts/sinErroresTragados.test.js");
  });

  it("plan B: un fichero que no entiende lanza los vigilantes más amplios", () => {
    const plan = elegir({ tocados: [A("zona-nueva/algo.txt")], datos, indice });
    expect(plan.sinEntender).toEqual(["zona-nueva/algo.txt"]);
    expect(plan.tests.map((t) => t.test)).toEqual(expect.arrayContaining(["scripts/sinErroresTragados.test.js", "ops/fuentes.test.js", ".claude/skills.test.js"]));
  });

  it("un fichero conocido que ningún vigilante mira no lanza nada de más", () => {
    expect(elegir({ tocados: [M("brand/lola-perfil.jpg")], datos, indice })).toMatchObject({ tests: [], pasos: [], sinEntender: [] });
  });
});
