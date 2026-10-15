import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ErrorDeApi } from "./lib/ghApi.mjs";
import { medianaMs, topeMs } from "./lib/medirTiempo.mjs";
import {
  MOTIVOS_SIN_COMPROBAR, REGLAS, RESULTADOS, UMBRALES_TAMANO,
  avisosDelPr, esGenerado, evaluarC1, evaluarC12, evaluarC8, excepcionAprendizaje, excepcionTamano, excepcionTests, excepcionesDelPr,
  leerDiff, lineaContable,
} from "./lib/avisosPr.mjs";
import { fondosCerrados, leerNormas } from "./avisos-pr.mjs";
import { RETIRADA_FORMAS_ANTIGUAS } from "./lib/excepciones.mjs";

/** Un día fijo dentro de la transición de las formas antiguas: los tests no dependen del reloj. */
const HOY = "2026-10-12";
const normas = leerNormas();

/** Un fichero del diff `-U0` de mentira. */
const fichero = (ruta, quitadas = [], anadidas = []) =>
  `diff --git a/${ruta} b/${ruta}\n--- a/${ruta}\n+++ b/${ruta}\n@@ -1 +1 @@\n${quitadas.map((l) => `-${l}`).join("\n")}${quitadas.length ? "\n" : ""}${anadidas.map((l) => `+${l}`).join("\n")}${anadidas.length ? "\n" : ""}`;
const ficheros = (...f) => leerDiff(f.join(""));

describe("el diff", () => {
  it("separa lo añadido de lo quitado por fichero, y no toma un `-- x` quitado por cabecera", () => {
    const f = leerDiff(fichero("a.sql", ["-- comentario"], ["select 1"]));
    expect(f).toEqual([{ ruta: "a.sql", anadidas: ["select 1"], quitadas: ["-- comentario"] }]);
  });
  it("un fichero borrado toma su ruta de la línea ---", () => {
    const f = leerDiff("diff --git a/x.test.js b/x.test.js\ndeleted file mode 100644\n--- a/x.test.js\n+++ /dev/null\n@@ -1 +0,0 @@\n-expect(1)\n");
    expect(f[0].ruta).toBe("x.test.js");
    expect(f[0].quitadas).toEqual(["expect(1)"]);
  });
});

describe("la línea contable", () => {
  it("el vocabulario es cerrado y la línea sale con campos en inglés", () => {
    expect(REGLAS).toEqual(["c1", "c8", "c12"]);
    expect(RESULTADOS).toEqual(["ok", "warning", "fail", "exempt", "declared", "unchecked"]);
    expect(lineaContable({ regla: "c8", resultado: "warning", detalle: "a=1" }, 5)).toBe("norma: tests-no-se-relajan resultado: warning pr: 5 detalle: a=1");
  });
  it("una regla o un resultado fuera del vocabulario no se imprime", () => {
    expect(() => lineaContable({ regla: "c9", resultado: "ok", detalle: "" })).toThrow(/regla/);
    expect(() => lineaContable({ regla: "c1", resultado: "aviso", detalle: "" })).toThrow(/resultado/);
  });
  it("cada salida de avisosDelPr está en el vocabulario, también los motivos de «sin comprobar»", () => {
    const todas = [
      ...avisosDelPr({ diff: "", autor: "dependabot[bot]" }),
      ...avisosDelPr({ diff: "", sinComprobar: "no_diff" }),
      ...avisosDelPr({ diff: fichero("a.js", [], ["x"]), fondosCerrados: ["#1"], sinComprobar: "api_error" }),
    ];
    for (const a of todas) {
      expect(REGLAS).toContain(a.regla);
      expect(RESULTADOS).toContain(a.resultado);
      if (a.resultado === "unchecked") expect(MOTIVOS_SIN_COMPROBAR).toContain(/reason=(\w+)/.exec(a.detalle)[1]);
    }
    expect(todas.length).toBe(9);
  });
});

describe("C8: tests relajados", () => {
  it("avisa si quita aserciones netas", () => {
    const f = ficheros(fichero("src/a.test.js", ["expect(a).toBe(1);", "expect(b).toBe(2);"], ["expect(a).toBe(1);"]));
    const r = evaluarC8({ ficheros: f });
    expect(r.resultado).toBe("warning");
    expect(r.detalle).toContain("removed_assertions=2 added_assertions=1");
  });
  it("no avisa si añade tantas como quita, ni si lo quitado está en un fichero que no es test", () => {
    expect(evaluarC8({ ficheros: ficheros(fichero("a.test.js", ["expect(1)"], ["expect(2)"])) }).resultado).toBe("ok");
    expect(evaluarC8({ ficheros: ficheros(fichero("src/a.js", ["expect(1)"], [])) }).resultado).toBe("ok");
  });
  it("cuenta también assert", () => {
    const f = ficheros(fichero("a.test.mjs", ["assert.equal(1, 1)", "assert(ok)"], []));
    expect(evaluarC8({ ficheros: f }).detalle).toContain("removed_assertions=2");
  });
  it("avisa si añade .skip, .only, .todo o skipIf; no si ya estaba", () => {
    for (const l of ["it.skip('x', () => {})", "describe.only('x', () => {})", "test.todo('x')", "it.skipIf(win)('x', () => {})"]) {
      expect(evaluarC8({ ficheros: ficheros(fichero("a.test.js", [], [l])) }).detalle).toContain("new_skip_only_todo=1");
    }
    expect(evaluarC8({ ficheros: ficheros(fichero("a.test.js", ["it.skip('x', f)"], ["it.skip('x', g)"])) }).resultado).toBe("ok");
    expect(evaluarC8({ ficheros: ficheros(fichero("a.test.js", [], ["it('x', f) // sin skip"])) }).resultado).toBe("ok");
  });
  it("lo que va entre comillas es texto: no cuenta (el CI de #576 avisó de su propio test)", () => {
    const l = 'expect(leer("it.skip(\'x\')")).toContain("testTimeout: 90000");';
    expect(evaluarC8({ ficheros: ficheros(fichero("a.test.js", [], [l])) }).detalle).not.toContain("new_skip_only_todo");
    expect(evaluarC8({ ficheros: ficheros(fichero("a.test.js", [], [l])) }).detalle).not.toContain("raised_threshold");
  });
  it("avisa si sube testTimeout, no si baja", () => {
    const sube = ficheros(fichero("vite.config.js", ["testTimeout: 30_000,"], ["testTimeout: 60_000,"]));
    expect(evaluarC8({ ficheros: sube }).detalle).toContain("raised_threshold=testTimeout:vite.config.js");
    const baja = ficheros(fichero("vite.config.js", ["testTimeout: 30_000,"], ["testTimeout: 20_000,"]));
    expect(evaluarC8({ ficheros: baja }).resultado).toBe("ok");
  });
  it("avisa si crece la suma de una línea base de lint, no si solo se mueve o baja", () => {
    const crece = ficheros(fichero("lint-base.json", ['  "a.js | regla | m": 1'], ['  "a.js | regla | m": 3,']));
    expect(evaluarC8({ ficheros: crece }).detalle).toContain("raised_threshold=lint_baseline:lint-base.json");
    const nueva = ficheros(fichero("lint-tokens-base.json", [], ['  "b.js | color | #fff": 2,']));
    expect(evaluarC8({ ficheros: nueva }).resultado).toBe("warning");
    const mueve = ficheros(fichero("lint-base.json", ['  "a.js | regla | m": 2,'], ['  "b.js | regla | m": 2,']));
    expect(evaluarC8({ ficheros: mueve }).resultado).toBe("ok");
    const baja = ficheros(fichero("lint-base.json", ['  "a.js | regla | m": 2,'], ['  "a.js | regla | m": 1,']));
    expect(evaluarC8({ ficheros: baja }).resultado).toBe("ok");
  });
  it("la excepción única «Excepción: tests-no-se-relajan — motivo — hasta …» silencia el aviso y deja el motivo; sin motivo o caducada no vale (#621)", () => {
    const f = ficheros(fichero("a.test.js", ["expect(1)"], []));
    const r = evaluarC8({ ficheros: f, hoy: HOY, cuerpo: "Excepción: tests-no-se-relajan — el test duplicaba otro de la misma zona — hasta 2026-10-20" });
    expect(r.resultado).toBe("exempt");
    expect(r.detalle).toContain("reason=el test duplicaba otro de la misma zona until=2026-10-20");
    expect(evaluarC8({ ficheros: f, hoy: HOY, cuerpo: "Excepción: tests-no-se-relajan — ya — hasta 2026-10-20" }).resultado).toBe("warning");
    expect(evaluarC8({ ficheros: f, hoy: HOY, cuerpo: "Excepción: tests-no-se-relajan — el test duplicaba otro de la zona — hasta 2026-10-01" }).resultado).toBe("warning");
    expect(evaluarC8({ ficheros: f, hoy: HOY, cuerpo: "Excepción: pr-acotado — el test duplicaba otro de la zona — hasta 2026-10-20" }).resultado).toBe("warning");
    expect(evaluarC8({ ficheros: f, hoy: HOY, cuerpo: "<!-- Excepción: tests-no-se-relajan — motivo de la plantilla — hasta 2026-10-20 -->" }).resultado).toBe("warning");
  });
  it("la forma antigua «Tests relajados: sí — motivo» vale en la transición y no después", () => {
    const f = ficheros(fichero("a.test.js", ["expect(1)"], []));
    const cuerpo = "Tests relajados: sí — el test duplicaba otro de la misma zona";
    const r = evaluarC8({ ficheros: f, cuerpo, hoy: HOY });
    expect(r.resultado).toBe("exempt");
    expect(r.detalle).toContain("reason=el test duplicaba otro de la misma zona form=legacy");
    expect(evaluarC8({ ficheros: f, cuerpo, hoy: RETIRADA_FORMAS_ANTIGUAS }).resultado).toBe("exempt");
    expect(evaluarC8({ ficheros: f, cuerpo, hoy: "2026-11-16" }).resultado).toBe("warning");
    expect(evaluarC8({ ficheros: f, hoy: HOY, cuerpo: "Tests relajados: sí — ya" }).resultado).toBe("warning");
    expect(excepcionTests("Tests relajados: no", HOY)).toBeNull();
  });
});

describe("C1: PR demasiado grande", () => {
  const muchas = (n, carpeta = "src") => Array.from({ length: n }, (_, i) => fichero(`${carpeta}/f${i}.js`, [], ["x"]));
  it("avisa por líneas, por ficheros y por áreas", () => {
    const lineas = ficheros(fichero("src/a.js", [], Array.from({ length: UMBRALES_TAMANO.lines + 1 }, () => "x")));
    expect(evaluarC1({ ficheros: lineas }).detalle).toContain(`over=lines>${UMBRALES_TAMANO.lines}`);
    expect(evaluarC1({ ficheros: ficheros(...muchas(UMBRALES_TAMANO.files + 1)) }).detalle).toContain(`files>${UMBRALES_TAMANO.files}`);
    const carpetas = ["src", "api", "scripts", "ops", ".claude", "supabase"].map((c) => fichero(`${c}/a.js`, [], ["x"]));
    expect(evaluarC1({ ficheros: ficheros(...carpetas) }).detalle).toContain(`areas>${UMBRALES_TAMANO.areas}`);
  });
  it("no avisa en el borde de cada umbral", () => {
    const borde = ficheros(...muchas(UMBRALES_TAMANO.files));
    const r = evaluarC1({ ficheros: borde });
    expect(r.resultado).toBe("ok");
    expect(r.detalle).toContain(`files=${UMBRALES_TAMANO.files} areas=1`);
    const cinco = ["src", "api", "scripts", "ops", ".claude"].map((c) => fichero(`${c}/a.js`, [], ["x"]));
    expect(evaluarC1({ ficheros: ficheros(...cinco) }).resultado).toBe("ok");
  });
  it("no cuenta lo generado: el lock, los documentos de GENERADOS y las fuentes derivadas", () => {
    for (const ruta of ["package-lock.json", "docs/ops/NORMAS.md", "ops/forja-capas.json", ".claude/plantillas-skill/datos.md", "src/data/derived/cualquier-fuente.json"]) {
      expect(esGenerado(ruta), ruta).toBe(true);
    }
    expect(esGenerado("src/data/recipes.json")).toBe(false);
    const gordo = ficheros(fichero("package-lock.json", [], Array.from({ length: 5000 }, () => "x")), fichero("src/a.js", [], ["x"]));
    const r = evaluarC1({ ficheros: gordo });
    expect(r.resultado).toBe("ok");
    expect(r.detalle).toContain("lines=1 files=1 areas=1 generated_skipped=1");
  });
  it("la excepción única de pr-acotado lo silencia y queda el motivo; la forma antigua vale en la transición", () => {
    const f = ficheros(...muchas(UMBRALES_TAMANO.files + 1));
    const r = evaluarC1({ ficheros: f, hoy: HOY, cuerpo: "Excepción: pr-acotado — mueve una carpeta entera sin cambiar su contenido — hasta 2026-10-20" });
    expect(r.resultado).toBe("exempt");
    expect(r.detalle).toContain("reason=mueve una carpeta entera");
    const v = evaluarC1({ ficheros: f, hoy: HOY, cuerpo: "Tamaño: grande — mueve una carpeta entera sin cambiar su contenido" });
    expect(v.resultado).toBe("exempt");
    expect(evaluarC1({ ficheros: f, hoy: "2026-11-16", cuerpo: "Tamaño: grande — mueve una carpeta entera sin cambiar su contenido" }).resultado).toBe("warning");
    expect(excepcionTamano("Tamano: grande - un motivo suficiente", HOY)).toContain("un motivo");
    expect(excepcionTamano("Tamaño: pequeño", HOY)).toBeNull();
  });
});

describe("C12: fondo cerrado sin aprendizaje", () => {
  const sinLeccion = ficheros(fichero("src/a.js", [], ["x"]), fichero("docs/a.md", [], ["x"]));
  it("avisa si cierra un fondo y no toca test, guardia ni skill", () => {
    const r = evaluarC12({ ficheros: sinLeccion, fondosCerrados: ["#503"] });
    expect(r.resultado).toBe("warning");
    expect(r.detalle).toContain("closed_funds=#503 lesson_files=0");
  });
  it("no avisa si toca un test, la guardia o una skill", () => {
    for (const ruta of ["scripts/x.test.js", "src/a.test.jsx", "ops/y.test.mjs", ".claude/hooks/guardia.mjs", ".claude/skills/github/SKILL.md", ".claude/rules/tests.md"]) {
      const r = evaluarC12({ ficheros: ficheros(fichero(ruta, [], ["x"])), fondosCerrados: ["#503"] });
      expect(r.resultado, ruta).toBe("ok");
    }
  });
  it("no avisa si no cierra ningún fondo", () => {
    expect(evaluarC12({ ficheros: sinLeccion, fondosCerrados: [] }).resultado).toBe("ok");
  });
  it("la excepción única de lecciones-a-un-test lo silencia y queda dónde; la forma antigua vale en la transición", () => {
    const r = evaluarC12({ ficheros: sinLeccion, fondosCerrados: ["#503"], hoy: HOY, cuerpo: "Excepción: lecciones-a-un-test — skill issues, sección Lo que falló (PR #580) — hasta 2026-10-20" });
    expect(r.resultado).toBe("exempt");
    expect(r.detalle).toContain("reason=skill issues");
    const v = evaluarC12({ ficheros: sinLeccion, fondosCerrados: ["#503"], hoy: HOY, cuerpo: "Aprendizaje: skill issues, sección Lo que falló (PR #580)" });
    expect(v.resultado).toBe("exempt");
    expect(evaluarC12({ ficheros: sinLeccion, fondosCerrados: ["#503"], hoy: "2026-11-16", cuerpo: "Aprendizaje: skill issues, sección Lo que falló (PR #580)" }).resultado).toBe("warning");
    expect(excepcionAprendizaje("Aprendizaje: x", HOY)).toBeNull();
  });
  it("si no se pudo mirar la API, sale unchecked y no un aviso", () => {
    expect(evaluarC12({ ficheros: sinLeccion, sinComprobar: "api_error" })).toEqual({ regla: "c12", resultado: "unchecked", detalle: "reason=api_error" });
  });
});

describe("los bots y el cuerpo hostil", () => {
  it("un PR de bot no se mide: sale unchecked por bot en las tres reglas", () => {
    const a = avisosDelPr({ diff: fichero("a.test.js", ["expect(1)"], []), autor: "Dependabot[bot]" });
    expect(a.map((x) => `${x.resultado}:${x.detalle}`)).toEqual(Array(3).fill("unchecked:reason=bot"));
  });
  it("un cuerpo de un megabyte no se queda colgado", () => {
    // Suelto tarda unos milisegundos; el tope es topeMs, con el margen de la casa (#499).
    const ms = medianaMs(() => avisosDelPr({ diff: fichero("a.test.js", ["expect(1)"], []), hoy: HOY, cuerpo: "Aprendizaje: ".repeat(100_000) + "\n".repeat(50_000) }));
    expect(ms).toBeLessThan(topeMs(10));
    const ms2 = medianaMs(() => excepcionesDelPr({ cuerpo: "Excepción: pr-acotado — x — hasta ".repeat(40_000) + "\n".repeat(50_000), normas: leerNormas(), hoy: HOY }));
    expect(ms2).toBeLessThan(topeMs(10));
  });
});

describe("fondosCerrados: los Closes que son tipo:fondo (con la API de mentira)", () => {
  const issues = {
    1: { number: 1, labels: [{ name: "tipo:fondo" }] },
    2: { number: 2, labels: [{ name: "tipo:encargo" }] },
  };
  const consultar = async (n) => issues[n] ?? null;
  it("deja solo los fondos", async () => {
    expect(await fondosCerrados({ cuerpo: "Closes #1\nCloses #2\nCloses #3", consultar })).toEqual({ fondosCerrados: ["#1"] });
  });
  it("consulta cada Closes en su repo; el que da 404 (null) se salta y un 403 queda «sin comprobar» (#856)", async () => {
    const pedidas = [];
    const enSuRepo = async (n, repo) => {
      pedidas.push(`${repo}#${n}`);
      if (repo === "pabloam89/homenu-panel" && n === 9) return null;
      return repo === "pabloam89/homenu-panel" ? { number: n, labels: [{ name: "tipo:fondo" }] } : issues[n] ?? null;
    };
    const cuerpo = "Closes #2\nCloses pabloam89/homenu-panel#1\nCloses pabloam89/homenu-panel#9";
    expect(await fondosCerrados({ cuerpo, consultar: enSuRepo, repo: "pabloam89/MenuPlan" })).toEqual({ fondosCerrados: ["pabloam89/homenu-panel#1"] });
    expect(pedidas).toEqual(["pabloam89/MenuPlan#2", "pabloam89/homenu-panel#1", "pabloam89/homenu-panel#9"]);
    // Esto solo avisa (el que falla es fondos-pr), pero un 403 del otro repo no se salta en silencio.
    const limite = async () => { throw new ErrorDeApi("GET /issues/9: HTTP 403"); };
    expect(await fondosCerrados({ cuerpo: "Closes pabloam89/homenu-panel#9", consultar: limite, repo: "pabloam89/MenuPlan" })).toEqual({ sinComprobar: "api_error" });
  });
  it("sin Closes no llama a la API ni pide token", async () => {
    expect(await fondosCerrados({ cuerpo: "nada" })).toEqual({ fondosCerrados: [] });
  });
  it("con Closes y sin token, o con la API caída, dice que no pudo comprobar", async () => {
    expect(await fondosCerrados({ cuerpo: "Closes #1" })).toEqual({ sinComprobar: "no_token" });
    const cae = async () => { throw new ErrorDeApi("HTTP 500"); };
    expect(await fondosCerrados({ cuerpo: "Closes #1", consultar: cae })).toEqual({ sinComprobar: "api_error" });
  });
});

describe("scripts/avisos-pr.mjs de punta a punta", () => {
  const dir = mkdtempSync(join(tmpdir(), "avisos-pr-"));
  const correr = (diff, env = {}) => {
    const f = join(dir, "diff.txt");
    writeFileSync(f, diff);
    return spawnSync(process.execPath, ["scripts/avisos-pr.mjs", f], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
  };
  it("imprime la línea de la norma de cada regla, el ::warning:: de la que salta y sale 0, sin una segunda línea para lo mismo", () => {
    const r = correr(fichero("a.test.js", ["expect(1)"], []), { PR_BODY: "Closes #", PR_AUTOR: "pablo", PR_NUMBER: "12", HOY });
    expect(r.status).toBe(0);
    const lineas = r.stdout.split("\n").filter((l) => l.startsWith("norma:"));
    expect(lineas.map((l) => /norma: ([\w-]+) resultado: (\w+) pr: 12 /.exec(l).slice(1).join(":"))).toEqual(["tests-no-se-relajan:warning", "pr-acotado:ok", "lecciones-a-un-test:ok"]);
    expect(r.stdout).not.toContain("avisos-pr:");
    expect(r.stdout).toMatch(/^::warning title=Aviso C8::/m);
  });
  it("una excepción vigente deja `exempt` en su regla y `declared` en una norma sin regla", () => {
    const con = correr(fichero("a.test.js", ["expect(1)"], []), { PR_BODY: "Excepción: tests-no-se-relajan — el test duplicaba otro de la misma zona — hasta 2026-10-20\nExcepción: zona-con-dueno — coordinado con la otra rama a mano — hasta 2026-10-20", PR_AUTOR: "pablo", PR_NUMBER: "12", HOY });
    expect(con.status).toBe(0);
    expect(con.stdout).toContain("norma: tests-no-se-relajan resultado: exempt pr: 12 detalle: removed_assertions=1");
    expect(con.stdout).toContain("norma: zona-con-dueno resultado: declared pr: 12 detalle: until=2026-10-20\n");
    expect(con.stdout).not.toMatch(/^::warning title=Aviso C8/m);
  });
  it("una excepción caducada avisa y no cuenta; si es de una norma dura que el PR toca, sale 1", () => {
    const dura = normas.find((n) => n.veredicto === "dura" && n.donde?.length);
    const caducada = `Excepción: ${dura.id} — motivo bien largo y caducado — hasta 2026-10-01`;
    const avisa = correr(fichero("a.test.js", ["expect(1)"], []), { PR_BODY: caducada, PR_AUTOR: "pablo", HOY });
    expect(avisa.status).toBe(0);
    expect(avisa.stdout).toMatch(/^::warning title=Excepción del PR::.*la caducidad ya ha pasado/m);
    expect(avisa.stdout).not.toMatch(new RegExp(`norma: ${dura.id} resultado: (exempt|declared)`));
    const falla = correr(fichero(dura.donde[0], ["x"], []), { PR_BODY: caducada, PR_AUTOR: "pablo", HOY });
    expect(falla.status).toBe(1);
    expect(falla.stdout).toMatch(/^::error title=Excepción caducada de una norma dura::/m);
    const bot = correr(fichero(dura.donde[0], ["x"], []), { PR_BODY: caducada, PR_AUTOR: "dependabot[bot]", HOY });
    expect(bot.status).toBe(0);
  });
  it("sin fichero de diff sale 0 y deja las tres líneas como unchecked", () => {
    const r = spawnSync(process.execPath, ["scripts/avisos-pr.mjs", join(dir, "no-existe.txt")], { encoding: "utf8", env: { PATH: process.env.PATH } });
    expect(r.status).toBe(0);
    expect(r.stdout.match(/resultado: unchecked pr: - detalle: reason=no_diff/g)).toHaveLength(3);
  });
  it("el workflow lo lanza sin interpolar el cuerpo y sin dependencias", () => {
    const y = readFileSync(".github/workflows/tests.yml", "utf8");
    const paso = y.slice(y.indexOf("- name: Avisos del PR"), y.indexOf("- run: npm ci"));
    expect(paso).toContain("node scripts/avisos-pr.mjs");
    expect(paso).toContain("PR_BODY: ${{ github.event.pull_request.body }}");
    expect(paso).toContain("PR_NUMBER: ${{ github.event.pull_request.number }}");
    const run = paso.slice(paso.indexOf("run: |"), paso.indexOf("env:"));
    expect(run).not.toContain("${{");
  });
});
