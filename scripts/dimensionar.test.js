/**
 * dimensionar (#641, fondo #639): del tipo, los ficheros y el tamaño de un encargo salen su alcance, su complejidad, sus
 * agentes, lo que va en paralelo y el brief de cada uno. Todo con reglas y con los ids discretos de subtipo: aquí no hay
 * tabla de combinaciones, así que los casos recorren cada tipo y cada nivel y miran lo que cambia entre ellos.
 *
 * Los ficheros de los casos son inventados y el mapa de módulos también (deps.mapa): el test no depende de qué módulo
 * tenga hoy cada fichero real. El resto de datos (ámbitos, catálogo de tipos, presupuestos, estándares) es el de verdad.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { AMBITOS, DUENO_ORDEN, constructorDeFichero } from "./lib/ambitos.mjs";
import { UMBRALES_TAMANO } from "./lib/avisosPr.mjs";
import { CONSTRUCTORES, JUECES } from "./lib/agentes.mjs";
import { ACCIONES, leerEstandares, tareasDe } from "./lib/estandaresAgentes.mjs";
import { CATALOGO, CAUSAS, MOTIVOS_COMPLEJIDAD } from "./lib/presupuestos.mjs";
import { ESPECIALES, STEP_PURPOSES, SUBTYPES, TYPES } from "./lib/tiposDeEncargo.mjs";
import { COMPARTIDOS_AL_FINAL, FORMAS, LITERALES, alcanceDe, briefDe, complejidadDe, dimensionar, formaDe, medidaDe, modulosDe, redimensionar, textoDe } from "./lib/dimensionado.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAPA = {
  modulos: [
    { id: "pantallas-uno", ambito: "app", ficheros: ["src/screens/A.jsx"], tests: [], submodulos: [] },
    { id: "catalogo-dos", ambito: "app", ficheros: ["src/lib/b.js"], tests: ["src/lib/b.test.js"], submodulos: [{ id: "sub", ficheros: ["src/lib/c.js"], tests: [] }] },
    { id: "bot-uno", ambito: "lola", ficheros: ["api/_bot/x.js"], tests: [], submodulos: [] },
  ],
  ficheros_sin_modulo: [],
};
const deps = { mapa: MAPA };
const f = (ruta, lines) => ({ ruta, lines });
const dim = (entrada) => dimensionar({ fuente: "ficheros", ...entrada }, deps);
const rolesDe = (plan, rol) => plan.fases.flatMap((x) => x.agentes.filter((a) => a.rol === rol).map((a) => a.agente));

describe("la medida: la del CI (lines, files, areas), sin lo generado", () => {
  it("cuenta líneas, ficheros y áreas, y deja fuera el lock", () => {
    const m = medidaDe([f("src/lib/b.js", 10), f("scripts/x.mjs", 5), f("package-lock.json", 9000)]);
    expect(m).toEqual({ lines: 15, lines_minimo: false, files: 2, areas: 2, generated_skipped: 1 });
  });
  it("sin líneas (ficheros previstos, no un diff) no las inventa", () => {
    expect(medidaDe([f("src/lib/b.js"), f("src/lib/c.js")]).lines).toBeNull();
  });
  it("con líneas conocidas y otras no (ficheros sin commitear) suma las conocidas y marca que es un mínimo", () => {
    expect(medidaDe([f("src/lib/b.js", 5000), f("src/lib/c.js")])).toMatchObject({ lines: 5000, lines_minimo: true });
    const p = dim({ tipo: "create", ficheros: [f("src/lib/b.js", UMBRALES_TAMANO.lines + 1), f("src/lib/c.js")] });
    expect([p.complejidad, p.motivo_complejidad]).toEqual(["large", "over_lines"]);
  });
  it("trivial no vale si falta alguna línea y hay otras conocidas: puede haber mucho más", () => {
    const cfg = CATALOGO.dimensionado;
    expect(complejidadDe({ lines: 5, lines_minimo: true, files: 2, areas: 1 }, "local", cfg).complejidad).toBe("normal");
    expect(complejidadDe({ lines: null, lines_minimo: true, files: 2, areas: 1 }, "local", cfg).complejidad).toBe("trivial");
  });
  it("los umbrales de «large» son los del aviso del CI, no una copia", () => {
    const justo = complejidadDe({ lines: UMBRALES_TAMANO.lines, lines_minimo: false, files: 3, areas: 1 }, "modulo", CATALOGO.dimensionado);
    const pasado = complejidadDe({ lines: UMBRALES_TAMANO.lines + 1, lines_minimo: false, files: 3, areas: 1 }, "modulo", CATALOGO.dimensionado);
    expect(justo.complejidad).toBe("normal");
    expect(pasado).toEqual({ complejidad: "large", motivo: "over_lines" });
    expect(complejidadDe({ lines: 10, files: UMBRALES_TAMANO.files + 1, areas: 1 }, "modulo", CATALOGO.dimensionado).motivo).toBe("over_files");
    expect(complejidadDe({ lines: 10, files: 3, areas: UMBRALES_TAMANO.areas + 1 }, "modulo", CATALOGO.dimensionado).motivo).toBe("over_areas");
  });
});

describe("el alcance: ficheros, dominios y módulos de ops/MODULOS.json", () => {
  const alc = (rutas) => alcanceDe({ ficheros: rutas.map((r) => f(r)), mapa: MAPA, cfg: CATALOGO.dimensionado });
  it("un fichero, un dominio y un módulo es local", () => {
    expect(alc(["src/lib/b.js"]).alcance).toBe("local");
  });
  it("varios ficheros del mismo dominio son del módulo", () => {
    const a = alc(["src/lib/b.js", "src/lib/c.js", "src/lib/b.test.js"]);
    expect(a.alcance).toBe("modulo");
    expect(a.modulos).toEqual(["catalogo-dos"]);
  });
  it("módulos de la app y de Lola a la vez son transversales", () => {
    expect(alc(["src/lib/b.js", "api/_bot/x.js"]).alcance).toBe("transversal");
  });
  it("tres dominios distintos son transversales aunque no estén en ningún módulo", () => {
    const a = alc(["supabase/migrations/0001_x.sql", "src/screens/Z.jsx", ".github/workflows/x.yml"]);
    expect(a.dominios).toEqual(expect.arrayContaining(["data", "ui", "infra"]));
    expect(a.alcance).toBe("transversal");
  });
  it("el ámbito code no cuenta como dominio: un test y su script son un solo dominio", () => {
    expect(alc(["ops/x.json", "ops/x.test.js"]).dominios).toEqual(["process"]);
  });
  it("el módulo de un fichero sale del mapa, también de un submódulo y de un test", () => {
    expect(modulosDe(["src/lib/c.js", "src/lib/b.test.js", "no/esta.js"], MAPA)).toEqual({ modulos: ["catalogo-dos"], ambitos: ["app"] });
  });
});

describe("la complejidad: trivial, normal y large", () => {
  it("trivial: un fichero pequeño de un dominio", () => {
    const p = dim({ tipo: "create", ficheros: [f("src/lib/b.js", 12)] });
    expect([p.alcance, p.complejidad]).toEqual(["local", "trivial"]);
  });
  it("normal: varios ficheros de un dominio", () => {
    const p = dim({ tipo: "create", ficheros: [f("src/lib/b.js", 80), f("src/lib/c.js", 40), f("src/lib/b.test.js", 60)] });
    expect([p.alcance, p.complejidad]).toEqual(["modulo", "normal"]);
  });
  it("large por tamaño: pasa un umbral del CI", () => {
    const p = dim({ tipo: "create", ficheros: [f("src/lib/b.js", UMBRALES_TAMANO.lines + 500), f("src/lib/c.js", 10), f("src/lib/b.test.js", 10)] });
    expect([p.alcance, p.complejidad, p.motivo_complejidad]).toEqual(["modulo", "large", "over_lines"]);
    expect(p.jueces.length).toBeGreaterThanOrEqual(2);
  });
  it("large por alcance: transversal aunque sea pequeño", () => {
    const p = dim({ tipo: "create", ficheros: [f("src/screens/A.jsx", 5), f("api/_bot/x.js", 5), f("supabase/migrations/0001_x.sql", 5)] });
    expect([p.alcance, p.complejidad, p.motivo_complejidad]).toEqual(["transversal", "large", "transversal"]);
  });
  it("lo generado no cuenta para el tamaño", () => {
    const p = dim({ tipo: "create", ficheros: [f("src/lib/b.js", 10), f("package-lock.json", 50000)] });
    expect(p.complejidad).toBe("trivial");
    expect(p.medida.generated_skipped).toBe(1);
  });
  it("la complejidad declarada que no cuadra con la calculada se avisa y manda la calculada", () => {
    const p = dim({ tipo: "create", ficheros: [f("src/lib/b.js", 12)], declarada: "large" });
    expect(p.complejidad).toBe("trivial");
    expect(p.avisos.join("|")).toMatch(/declarada large.*calculada trivial/);
  });
  it("hasta lo trivial lleva juez, y el constructor es el del dominio", () => {
    const p = dim({ tipo: "create", ficheros: [f("src/screens/A.jsx", 3)] });
    expect(p.complejidad).toBe("trivial");
    expect(rolesDe(p, "judge")).toContain("revisor");
    expect(rolesDe(p, "builder")).toEqual(["diseno"]);
  });
});

describe("los agentes: constructor por ámbito, juez mínimo siempre y juez del ámbito", () => {
  it("el constructor sale del ámbito de los ficheros y el del bot gana al del catálogo en api/_bot", () => {
    expect(constructorDeFichero("api/_bot/x.js")).toEqual({ agente: "lola", ambito: "bot" });
    expect(constructorDeFichero("supabase/migrations/0001_x.sql").agente).toBe("datos");
    expect(constructorDeFichero("src/lib/b.js")).toEqual({ agente: null, ambito: "catalog" });
    expect(constructorDeFichero("scripts/lib/suelto.mjs").agente).toBe("gobierno");
    expect(constructorDeFichero("api/otra.js")).toEqual({ agente: null, ambito: "api" });
    expect(DUENO_ORDEN.slice().sort()).toEqual(Object.keys(AMBITOS).sort());
    for (const a of Object.values(AMBITOS)) if (a.construye) expect(CONSTRUCTORES).toContain(a.construye);
  });
  it("varios dominios, un constructor por cada uno, en paralelo y con ficheros distintos", () => {
    const p = dim({ tipo: "create", ficheros: [f("src/screens/A.jsx", 5), f("api/_bot/x.js", 5), f("supabase/migrations/0001_x.sql", 5)] });
    expect(p.constructores.map((c) => c.agente).sort()).toEqual(["datos", "diseno", "lola"]);
    const fase = p.fases.find((x) => x.agentes.some((a) => a.rol === "builder"));
    expect(fase.modo).toBe("paralelo");
    const todos = p.constructores.flatMap((c) => c.ficheros);
    expect(new Set(todos).size).toBe(todos.length);
    expect(p.avisos.join("|")).toMatch(/create-planned/);
  });
  it("el juez del ámbito se suma al revisor (juecesDeAmbitos) y nadie juzga lo que construye", () => {
    const p = dim({ tipo: "create", ficheros: [f("api/_bot/x.js", 20), f("supabase/migrations/0001_x.sql", 20), f("src/screens/A.jsx", 20)] });
    expect(p.jueces).toEqual(expect.arrayContaining(["revisor", "evaluador", "auditor-datos", "qa"]));
    expect(p.jueces.filter((j) => p.constructores.some((c) => c.agente === j))).toEqual([]);
  });
  it("si un juez de zona fuera también el constructor, no juzga: se avisa y no entra en la fase de jueces", () => {
    const original = AMBITOS.infra.jueces;
    AMBITOS.infra.jueces = [{ juez: "gobierno", fuente: "agente:gobierno" }];
    try {
      const p = dim({ subtipo: "operate-reversible", ficheros: [f(".github/workflows/x.yml", 10)] });
      expect(rolesDe(p, "builder")).toEqual(["gobierno"]);
      expect(rolesDe(p, "judge")).toEqual(["revisor"]);
      expect(p.avisos.join("|")).toMatch(/gobierno es juez de la zona pero construye/);
    } finally {
      AMBITOS.infra.jueces = original;
    }
  });
  it("en ningún subtipo, tamaño ni zona un agente construye y juzga a la vez", () => {
    const zonas = [["src/screens/A.jsx"], ["api/_bot/x.js"], ["supabase/migrations/0001_x.sql"], [".github/workflows/x.yml"], ["ops/a.json", "ops/b.json", "ops/c.test.js"], []];
    for (const s of SUBTYPES) for (const z of zonas) for (const lines of [5, 5000]) {
      const p = dim({ subtipo: s.id, ficheros: z.map((r) => f(r, lines)), banderas: ["touches_rls", "changes_bot", "touches_secrets_or_permissions", "writes_data"] });
      const construyen = new Set(rolesDe(p, "builder"));
      expect(rolesDe(p, "judge").filter((j) => construyen.has(j)), `${s.id} ${z.join(",")} ${lines}`).toEqual([]);
      expect(p.jueces.length, `${s.id} sin juez`).toBeGreaterThanOrEqual(1);
      for (const j of rolesDe(p, "judge")) expect(JUECES).toContain(j);
    }
  });
  it("los jueces mínimos del presupuesto se cumplen: large pide dos, con uno del ámbito o uno afín", () => {
    const p = dim({ tipo: "create", ficheros: [f("src/lib/b.js", 3000), f("src/lib/c.js", 10), f("src/lib/b.test.js", 10)] });
    expect(p.jueces_min).toBe(2);
    expect(p.jueces).toEqual(["revisor", "auditor-datos"]);
  });
  it("los jueces que exige la causa del fallo entran aunque la zona no los pida", () => {
    const p = dim({ subtipo: "fix-bug", causa: "modelo-datos", ficheros: [f("scripts/lib/suelto.mjs", 10)] });
    expect(p.jueces).toContain("auditor-datos");
    expect(p.jueces_requeridos).toEqual(["auditor-datos"]);
  });
  it("sin dueño del ámbito (api) construye la sesión y lo avisa", () => {
    const p = dim({ tipo: "create", ficheros: [f("api/otra.js", 10)] });
    expect(p.constructores).toEqual([{ agente: "sesion", ficheros: ["api/otra.js"] }]);
    expect(p.avisos.join("|")).toMatch(/no tiene constructor/);
  });
  it("un subtipo o tipo que no existe falla con la lista de los que sí", () => {
    expect(() => dim({ subtipo: "inventado", ficheros: [] })).toThrow(/create-plain/);
    expect(() => dim({ tipo: "inventado", ficheros: [] })).toThrow(/create, fix/);
    expect(() => dim({ tipo: "fix", causa: "inventada", ficheros: [] })).toThrow(/causa/);
  });
});

describe("la forma depende del tipo", () => {
  it("fix: diagnostica primero y repite el juez al final, también en un cambio trivial", () => {
    const p = dim({ tipo: "fix", ficheros: [f("src/lib/b.js", 4)] });
    expect(p.tipo).toBe("fix");
    expect(p.forma).toBe("diagnosticar-primero");
    expect(p.fases[0].finalidad).toBe("diagnose");
    expect(p.fases[0].agentes[0]).toMatchObject({ agente: "revisor", rol: "judge" });
    expect(p.fases.map((x) => x.agentes.map((a) => a.rol)[0])).toEqual(["judge", "builder", "judge"]);
  });
  it("improve: mide antes y después con la medida del subtipo", () => {
    const p = dim({ subtipo: "improve-measured", ficheros: [f("src/lib/b.js", 30)] });
    expect(p.forma).toBe("medir-antes-y-despues");
    expect(p.medicion).toMatchObject({ kind: "counter_before_after" });
    expect(p.medicion.counters.length).toBeGreaterThan(0);
    expect(p.fases.map((x) => x.finalidad)).toEqual(["measure_before", "measure_after"]);
  });
  it("improve-structure mide que el comportamiento no cambie", () => {
    expect(dim({ subtipo: "improve-structure", ficheros: [f("src/lib/b.js", 30)] }).medicion).toEqual({ kind: "behavior_unchanged", counters: [] });
  });
  it("audit: solo jueces, todos en una fase en paralelo, sin constructores", () => {
    const p = dim({ subtipo: "audit-periodic", ficheros: [] });
    expect(p.forma).toBe("solo-jueces-en-paralelo");
    expect(p.fases).toHaveLength(1);
    expect(p.fases[0].modo).toBe("paralelo");
    expect(p.constructores).toEqual([]);
    expect(rolesDe(p, "builder")).toEqual([]);
    expect(rolesDe(p, "measurer")).toEqual(["gobierno"]);
    expect(rolesDe(p, "judge").sort()).toEqual(["auditor-datos", "evaluador", "revisor", "seguridad"]);
  });
  it("audit sobre una zona suma el juez de la zona a la fase de jueces", () => {
    const p = dim({ subtipo: "audit-other", ficheros: [f("src/screens/A.jsx")] });
    expect(p.fases).toHaveLength(1);
    expect(rolesDe(p, "judge")).toEqual(["revisor", "qa"]);
  });
  it("operate: gobierno construye, y lo irreversible cierra con el OK de una persona", () => {
    const p = dim({ subtipo: "operate-irreversible", ficheros: [f(".github/workflows/x.yml", 10)] });
    expect(p.forma).toBe("construir-y-juzgar");
    expect(rolesDe(p, "builder")).toEqual(["gobierno"]);
    expect(p.cierre).toBe("OK de una persona");
    expect(dim({ subtipo: "operate-reversible", ficheros: [f(".github/workflows/x.yml", 10)] }).cierre).toBeNull();
  });
  it("una bandera hace entrar al juez condicional y sin ella solo se lista", () => {
    const sin = dim({ subtipo: "operate-irreversible", ficheros: [f(".github/workflows/x.yml", 10)] });
    expect(sin.jueces).not.toContain("seguridad");
    expect(sin.condicionales).toEqual(expect.arrayContaining([{ agente: "seguridad", si: "toca secretos o permisos", flag: "touches_secrets_or_permissions" }]));
    const con = dim({ subtipo: "operate-irreversible", ficheros: [f(".github/workflows/x.yml", 10)], banderas: ["touches_secrets_or_permissions"] });
    expect(con.jueces).toContain("seguridad");
    expect(con.condicionales.map((c) => c.agente)).not.toContain("seguridad");
    expect(() => dim({ subtipo: "operate-reversible", ficheros: [], banderas: ["inventada"] })).toThrow(/bandera/);
  });
  it("create-planned empieza por el plan de la sesión", () => {
    const p = dim({ subtipo: "create-planned", ficheros: [f("src/screens/A.jsx", 5), f("api/_bot/x.js", 5), f("supabase/migrations/0001_x.sql", 5)] });
    expect(p.fases[0].agentes[0]).toMatchObject({ agente: "sesion", rol: "planner" });
    expect(p.fases[1].modo).toBe("paralelo");
  });
  it("cada tipo del catálogo sale con su forma", () => {
    const formas = Object.fromEntries(Object.keys(TYPES).map((t) => [t, dim({ tipo: t, ficheros: [f("src/lib/b.js", 5)] }).forma]));
    expect(formas).toEqual({ create: "construir-y-juzgar", fix: "diagnosticar-primero", improve: "medir-antes-y-despues", operate: "construir-y-juzgar", audit: "solo-jueces-en-paralelo" });
  });
});

describe("paralelo y serie", () => {
  it("lo que comparten todos los PR se toca al final cuando hay varios constructores", () => {
    const p = dim({ tipo: "create", ficheros: [f("src/screens/A.jsx", 5), f("api/_bot/x.js", 5), f("package.json", 2)] });
    expect(p.al_final).toEqual(["package.json"]);
    expect(p.constructores.flatMap((c) => c.ficheros)).not.toContain("package.json");
  });
  it("con un solo constructor no hace falta dejar nada para el final", () => {
    expect(dim({ tipo: "create", ficheros: [f("src/lib/b.js", 5), f("package.json", 2)] }).al_final).toEqual([]);
  });
  it("las fases van numeradas y cada una dice si es en serie o en paralelo", () => {
    const p = dim({ tipo: "create", ficheros: [f("src/lib/b.js", 5)] });
    expect(p.fases.map((x) => x.n)).toEqual(p.fases.map((_, i) => i + 1));
    for (const x of p.fases) expect(x.modo).toBe(x.agentes.length > 1 ? "paralelo" : "serie");
  });
});

describe("el presupuesto: rondas, minutos y causa", () => {
  it("lo del fondo sale de presupuestos.json según el alcance y la causa", () => {
    const p = dim({ subtipo: "fix-bug", causa: "entorno", ficheros: [f("src/lib/b.js", 5)] });
    expect(p.rondas_max).toBe(CATALOGO.por_alcance.local.rondas_max);
    expect(p.minutos).toBe(CATALOGO.por_alcance.local.minutos_orientativos);
    expect(p.causa).toBe("entorno");
  });
});

describe("redimensionar: si el diff real supera al previsto", () => {
  const previsto = dim({ tipo: "create", ficheros: [f("src/lib/b.js", 12)] });
  it("avisa cuando la complejidad real sube", () => {
    const real = dim({ tipo: "create", ficheros: [f("src/lib/b.js", 12), f("src/lib/c.js", 4000)] });
    const r = redimensionar(previsto, real);
    expect(r.redimensionar).toBe(true);
    expect(r.motivos).toEqual(expect.arrayContaining(["complejidad:trivial->large"]));
  });
  it("avisa cuando el alcance real sube, aunque la complejidad no", () => {
    const real = dim({ tipo: "create", ficheros: [f("src/lib/b.js", 12), f("src/lib/c.js", 10), f("src/lib/b.test.js", 10)] });
    const r = redimensionar({ ...previsto, complejidad: "normal" }, real);
    expect(r.motivos).toEqual(["alcance:local->modulo"]);
  });
  it("no avisa si el diff real es igual o menor, y cuenta los ficheros fuera de lo previsto", () => {
    const real = dim({ tipo: "create", ficheros: [f("src/lib/b.js", 8)] });
    expect(redimensionar(previsto, real)).toEqual({ redimensionar: false, motivos: [], ficheros_fuera: [] });
    const fuera = dim({ tipo: "create", ficheros: [f("src/lib/c.js", 8)] });
    expect(redimensionar(previsto, fuera).ficheros_fuera).toEqual(["src/lib/c.js"]);
  });
  it("la complejidad declarada del encargo cuenta como lo previsto", () => {
    const real = dim({ tipo: "create", ficheros: [f("src/lib/b.js", 12), f("src/lib/c.js", 100), f("src/lib/b.test.js", 100)] });
    expect(redimensionar({ ...previsto, declarada: "large" }, real).redimensionar).toBe(false);
    expect(redimensionar({ ...previsto, declarada: "trivial" }, real).redimensionar).toBe(true);
  });
});

describe("la salida: campo: valor, y el JSON es el mismo plan", () => {
  const p = dim({ subtipo: "fix-bug", causa: "codigo", ficheros: [f("src/lib/b.js", 30), f("src/lib/b.test.js", 20)], numero: 641 });
  const t = textoDe(p);
  it("lleva una línea por campo del plan", () => {
    for (const c of ["tipo", "subtipo", "alcance", "complejidad", "medida", "forma", "jueces", "constructores", "rondas_max", "redimensionar"]) {
      expect(t, c).toMatch(new RegExp(`^${c}: `, "m"));
    }
    expect(t).toMatch(/^fase 1: serie$/m);
    expect(t).toMatch(/^fase_1_agentes: revisor \(judge\)$/m);
    expect(t).toMatch(/^fase_1_finalidad: diagnose$/m);
    for (const linea of t.split("\n")) expect(linea, "campo: valor, con el campo en minúsculas").toMatch(/^(?:[a-z_0-9]+|fase \d+): \S/);
    expect(t).toMatch(/^encargo: #641$/m);
  });
  it("el JSON se puede serializar entero", () => {
    expect(JSON.parse(JSON.stringify(p)).subtipo).toBe("fix-bug");
  });
});

describe("el brief de cada agente sale del plan", () => {
  const p = dim({ subtipo: "fix-bug", causa: "modelo-datos", ficheros: [f("supabase/migrations/0001_x.sql", 30), f("supabase/migrations/0002_y.sql", 20)], numero: 641, objetivo: "Arreglar b" });
  it("el constructor lleva su tarea, su estándar con las normas de los ficheros y la precedencia", () => {
    const b = briefDe(p, "datos");
    expect(b).toMatch(/^ESTÁNDAR A CUMPLIR: datos\//m);
    expect(b).toMatch(/Normas que tocan/);
    expect(b).toMatch(/Precedencia/);
    expect(b).toMatch(/Objetivo: Arreglar b/);
    expect(b).toMatch(/supabase\/migrations\/0001_x\.sql/);
    expect(b).toMatch(/SKILLS A ABRIR:/);
    expect(b).toMatch(/Lo ya apuntado.*npm run buscar/);
    expect(b).toMatch(/PLANTILLA-AGENTE/);
  });
  it("el juez lleva el estándar de juzgar con las mismas normas que el constructor", () => {
    const b = briefDe(p, "auditor-datos");
    expect(b).toMatch(/^ESTÁNDAR A CUMPLIR: auditor-datos\//m);
    expect(b).toMatch(/Rol: judge/);
  });
  it("el diagnóstico del arreglo usa la tarea de diagnosticar y no la de revisar", () => {
    expect(briefDe(p, "revisor", { fase: 1 })).toMatch(/^ESTÁNDAR A CUMPLIR: revisor\/diagnosticar-bug$/m);
    expect(briefDe(p, "revisor", { fase: 3 })).not.toMatch(/revisor\/diagnosticar-bug/);
  });
  it("la tarea que da quien orquesta manda sobre la que se deduce de los ficheros, para el constructor", () => {
    const q = dim({ tipo: "create", ficheros: [f("scripts/lib/suelto.mjs", 10)], tarea: "catalogo-de-ops-con-test" });
    expect(briefDe(q, "gobierno")).toMatch(/^ESTÁNDAR A CUMPLIR: gobierno\/catalogo-de-ops-con-test$/m);
    expect(briefDe(q, "revisor")).not.toMatch(/catalogo-de-ops-con-test/);
    expect(() => briefDe(dim({ tipo: "create", ficheros: [f("scripts/lib/suelto.mjs", 10)], tarea: "no-existe" }), "gobierno")).toThrow(/no-existe/);
  });
  it("un agente que no está en el plan no tiene brief", () => {
    expect(() => briefDe(p, "qa")).toThrow(/no está en el plan/);
  });
  it("si la sesión construye no hay tarea del catálogo y se dice por qué", () => {
    const q = dim({ tipo: "create", ficheros: [f("api/otra.js", 10)] });
    expect(briefDe(q, "sesion")).toMatch(/ninguna tarea del catálogo/);
  });
});

describe("AMBITOS.construye: la forma y que cada dueño tenga trabajo en su ámbito", () => {
  it("todo ámbito tiene exactamente las claves esperadas, con `construye` explícito aunque sea null", () => {
    for (const [id, a] of Object.entries(AMBITOS)) {
      expect(Object.keys(a).sort(), id).toEqual(["construye", "jueces", "legible", "que", "rutas"]);
      expect(a.construye === null || typeof a.construye === "string", id).toBe(true);
    }
  });
  it("todo constructor no nulo tiene al menos una tarea del catálogo de estándares en ese ámbito", () => {
    const tareas = tareasDe(leerEstandares(RAIZ));
    for (const [id, a] of Object.entries(AMBITOS)) {
      if (!a.construye) continue;
      expect(tareas.some((t) => t.agente === a.construye && t.tarea.ambitos.includes(id)), `${a.construye} no tiene tarea en ${id}: pon construye a null`).toBe(true);
    }
  });
  it("los ámbitos sin dueño son los que ningún constructor tiene en sus tareas", () => {
    expect(Object.entries(AMBITOS).filter(([, a]) => !a.construye).map(([id]) => id).sort()).toEqual(["api", "catalog", "entities", "product"]);
  });
});

describe("las listas y vocabularios que usa el módulo salen de su fuente", () => {
  it("cada literal de LITERALES está en su vocabulario", () => {
    for (const a of LITERALES.acciones) expect(ACCIONES, a).toContain(a);
    for (const x of LITERALES.finalidades) expect(Object.keys(STEP_PURPOSES), x).toContain(x);
    for (const x of LITERALES.especiales) expect(ESPECIALES, x).toContain(x);
    for (const x of LITERALES.roles) expect(["builder", "judge", "planner", "measurer"], x).toContain(x);
    expect(CAUSAS).toContain(LITERALES.causa_defecto);
    expect(SUBTYPES.map((x) => x.id)).toContain(LITERALES.subtipo_defecto);
  });
  it("las formas salen del esqueleto de cada tipo, sin mirar su nombre", () => {
    expect(formaDe({ roles: ["judge"], judges_only_in_parallel: true })).toBe(FORMAS[0]);
    expect(formaDe({ roles: ["builder", "judge"], measures_before_after: true })).toBe(FORMAS[1]);
    expect(formaDe({ roles: ["judge", "builder", "judge"] })).toBe(FORMAS[2]);
    expect(formaDe({ roles: ["builder", "judge"] })).toBe(FORMAS[3]);
    for (const t of Object.values(TYPES)) expect(FORMAS).toContain(formaDe(t.skeleton));
  });
  it("los motivos de complejidad que da el módulo son todos del vocabulario cerrado", () => {
    const vistos = new Set([
      complejidadDe({ lines: 9999, lines_minimo: false, files: 1, areas: 1 }, "local").motivo,
      complejidadDe({ lines: 1, lines_minimo: false, files: 99, areas: 1 }, "local").motivo,
      complejidadDe({ lines: 1, lines_minimo: false, files: 1, areas: 99 }, "local").motivo,
      complejidadDe({ lines: 1, lines_minimo: false, files: 1, areas: 1 }, "transversal").motivo,
      complejidadDe({ lines: 1, lines_minimo: false, files: 1, areas: 1 }, "local").motivo,
      complejidadDe({ lines: 1, lines_minimo: false, files: 5, areas: 1 }, "modulo").motivo,
    ]);
    expect([...vistos].sort()).toEqual(Object.keys(MOTIVOS_COMPLEJIDAD).sort());
  });
  it("los ficheros que se tocan al final son los mismos que dice /orquestar", () => {
    const md = readFileSync(join(RAIZ, ".claude/commands/orquestar.md"), "utf8");
    const bloque = /Ficheros que tocan casi todos \(([\s\S]*?)\):/.exec(md)[1];
    expect([...bloque.matchAll(/`([^`]+)`/g)].map((m) => m[1]).sort()).toEqual([...COMPARTIDOS_AL_FINAL].sort());
  });
});
