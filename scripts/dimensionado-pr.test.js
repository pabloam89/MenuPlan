// Lo dimensionado, exigido en cada PR (#642, fondo #639; decisión #387): la comprobación del CI y la cadena entera,
// de punta a punta, para cada tipo: tipo → dimensionado → jueces exigidos → CI → brief con estándar → hook de lanzamiento.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decidir } from "../.claude/hooks/guardia.mjs";
import { decidirLanzamiento, leerEstandaresDe } from "../.claude/hooks/lanzamiento.mjs";
import { JUECES } from "./lib/agentes.mjs";
import { briefDe, dimensionar } from "./lib/dimensionado.mjs";
import { DE_SESION, FALLA_DESDE, NORMAS_DEL_PASO, comprobarDimensionado, entradaDeTipo, ficherosDeDiff, sesionPermitida } from "./lib/dimensionadoPr.mjs";
import { leerDiff } from "./lib/avisosPr.mjs";
import { leerRegistro } from "./lib/normas.mjs";
import { TYPES } from "./lib/tiposDeEncargo.mjs";

process.env.MENUPLAN_FABRICA_DIR = mkdtempSync(join(tmpdir(), "dimensionado-pr-eventos-"));
process.env.MENUPLAN_BUSCAR_DIR = mkdtempSync(join(tmpdir(), "dimensionado-pr-buscar-"));

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const NORMAS = leerRegistro(RAIZ).normas;
const HOY = "2026-10-20";
const DESPUES = "2026-10-20T09:00:00Z";
const ANTES = "2026-10-14T09:00:00Z";
const f = (ruta, lines = 10) => ({ ruta, lines });
const comprueba = (cuerpo, ficheros, creado = DESPUES, extra = {}) => comprobarDimensionado({ cuerpo, ficheros, normas: NORMAS, hoy: HOY, creado, ...extra });
const resultado = (r, norma) => r.medidas.find((m) => m.norma === norma)?.resultado;
const cuerpoDe = ({ agente, tipo, jueces }) => `Agente: ${agente}\nTipo: ${tipo}\nJueces: ${jueces.join(", ")}\nCasos: ninguno — un PR de ejemplo para el test de la cadena`;

describe("comprobarDimensionado", () => {
  const ui = [f("src/screens/Plan.jsx")];
  it("con los jueces que exige el diff, cumple las cuatro normas", () => {
    const r = comprueba(cuerpoDe({ agente: "constructor", tipo: "create", jueces: ["revisor", "qa"] }), ui);
    expect(r.fallos).toEqual([]);
    expect(r.medidas.map((m) => [m.norma, m.resultado])).toEqual(Object.values(NORMAS_DEL_PASO).map((n) => [n, "ok"]));
  });
  it("sin un juez que exige la zona (qa en una pantalla), falla y dice cuál", () => {
    const r = comprueba(cuerpoDe({ agente: "constructor", tipo: "create", jueces: ["revisor"] }), ui);
    expect(resultado(r, NORMAS_DEL_PASO.tipoYJueces)).toBe("fail");
    expect(r.fallos.join(" ")).toMatch(/no nombra a qa/);
  });
  it.each([
    ["sin Tipo", "Agente: constructor\nJueces: revisor"],
    ["sin Jueces", "Agente: constructor\nTipo: create"],
    ["un tipo que no existe", "Agente: constructor\nTipo: construir\nJueces: revisor"],
    ["un juez que no es juez", "Agente: constructor\nTipo: create\nJueces: revisor, constructor"],
  ])("%s, falla", (_, cuerpo) => {
    const r = comprueba(cuerpo, [f("scripts/x.mjs")]);
    expect(resultado(r, NORMAS_DEL_PASO.tipoYJueces)).toBe("fail");
    expect(r.fallos.length).toBeGreaterThan(0);
  });
  it("quien construye no juzga: el Agente en Jueces falla en su norma", () => {
    const r = comprueba("Agente: constructor\nTipo: create\nJueces: revisor, constructor", [f("scripts/x.mjs")]);
    expect(resultado(r, NORMAS_DEL_PASO.tipoYJueces)).toBe("fail");
    const r2 = comprueba("Agente: revisor\nTipo: audit\nJueces: revisor", [f("scripts/x.mjs")]);
    expect(resultado(r2, NORMAS_DEL_PASO.noJuzga)).toBe("fail");
    expect(resultado(r2, NORMAS_DEL_PASO.otroJuez)).toBe("fail");
    expect(resultado(r2, NORMAS_DEL_PASO.agente)).toBe("fail");
  });
  it("sesión solo donde no hay constructor dueño: no en scripts/ (process), sí en src/data/ (catalog) y en audit", () => {
    const enProceso = comprueba(cuerpoDe({ agente: "sesión", tipo: "create", jueces: ["revisor"] }), [f("scripts/x.mjs")]);
    expect(resultado(enProceso, NORMAS_DEL_PASO.agente)).toBe("fail");
    expect(enProceso.fallos.join(" ")).toMatch(/declara el agente real/);
    const orquestador = comprueba(cuerpoDe({ agente: "orquestador", tipo: "create", jueces: ["revisor"] }), [f("scripts/x.mjs")]);
    expect(resultado(orquestador, NORMAS_DEL_PASO.agente)).toBe("fail");
    const plan = dimensionar({ fuente: "diff", ficheros: [f("src/data/recipes.json")], tipo: "create" });
    expect(sesionPermitida(plan)).toBe(true);
    const enCatalogo = comprueba(cuerpoDe({ agente: "sesión", tipo: "create", jueces: plan.jueces }), [f("src/data/recipes.json")]);
    expect(resultado(enCatalogo, NORMAS_DEL_PASO.agente)).toBe("ok");
  });
  it("transición: un PR creado antes de FALLA_DESDE solo avisa, con las mismas líneas", () => {
    const r = comprueba("Agente: constructor\nCasos: ninguno", [f("scripts/x.mjs")], ANTES);
    expect(r.transicion).toBe(true);
    expect(r.fallos).toEqual([]);
    expect(r.avisos.length).toBe(1);
    expect(resultado(r, NORMAS_DEL_PASO.tipoYJueces)).toBe("warning");
    expect(ANTES.slice(0, 10) < FALLA_DESDE && DESPUES.slice(0, 10) >= FALLA_DESDE).toBe(true);
    expect(comprueba("Agente: constructor", [f("scripts/x.mjs")], null, { hoy: "2026-10-15" }).transicion).toBe(true);
  });
  it("la frontera de la transición: creado el mismo FALLA_DESDE a las 00:00 UTC ya falla; un segundo antes, avisa", () => {
    const enLaFrontera = comprueba("Agente: constructor", [f("scripts/x.mjs")], `${FALLA_DESDE}T00:00:00Z`);
    expect(enLaFrontera.transicion).toBe(false);
    expect(resultado(enLaFrontera, NORMAS_DEL_PASO.tipoYJueces)).toBe("fail");
    const justoAntes = new Date(Date.parse(`${FALLA_DESDE}T00:00:00Z`) - 1000).toISOString();
    expect(comprueba("Agente: constructor", [f("scripts/x.mjs")], justoAntes).transicion).toBe(true);
  });
  it("una excepción válida de la norma que la admite deja pasar (exempt); una caducada no", () => {
    const exc = (hasta) => `\nExcepción: ${NORMAS_DEL_PASO.agente} — la sesión arregla a mano un fichero de un constructor — hasta ${hasta}`;
    const cuerpo = cuerpoDe({ agente: "sesión", tipo: "create", jueces: ["revisor"] });
    const r = comprueba(`${cuerpo}${exc("2026-10-25")}`, [f("scripts/x.mjs")]);
    expect(resultado(r, NORMAS_DEL_PASO.agente)).toBe("exempt");
    expect(r.fallos).toEqual([]);
    expect(comprueba(`${cuerpo}${exc("2026-10-19")}`, [f("scripts/x.mjs")]).fallos.length).toBe(1);
  });
  it("las normas de los jueces no se eximen: su excepción no cuenta y el PR falla igual (#642)", () => {
    const exc = (n) => `\nExcepción: ${n} — PR de emergencia sin tiempo de jueces — hasta 2026-10-25`;
    const sinJueces = comprueba(`Agente: constructor${exc(NORMAS_DEL_PASO.tipoYJueces)}`, [f("scripts/x.mjs")]);
    expect(resultado(sinJueces, NORMAS_DEL_PASO.tipoYJueces)).toBe("fail");
    const seJuzga = comprueba(`Agente: revisor\nTipo: audit\nJueces: revisor${exc(NORMAS_DEL_PASO.noJuzga)}${exc(NORMAS_DEL_PASO.otroJuez)}`, [f("scripts/x.mjs")]);
    expect(resultado(seJuzga, NORMAS_DEL_PASO.noJuzga)).toBe("fail");
    expect(resultado(seJuzga, NORMAS_DEL_PASO.otroJuez)).toBe("fail");
    for (const n of [NORMAS_DEL_PASO.tipoYJueces, NORMAS_DEL_PASO.noJuzga, NORMAS_DEL_PASO.otroJuez]) expect(NORMAS.find((x) => x.id === n).admite_excepcion, n).toBe(false);
  });
  it("las rutas sensibles exigen su juez aunque el Tipo no tenga ese paso: seguridad por hooks, workflows, settings y migraciones; evaluador por el bot (#642)", () => {
    for (const ruta of [".claude/hooks/guardia.mjs", ".github/workflows/tests.yml", ".claude/settings.json", "supabase/migrations/0200_x.sql"]) {
      const r = comprueba(cuerpoDe({ agente: "constructor", tipo: "fix", jueces: ["revisor", "auditor-datos"] }), [f(ruta)]);
      expect(r.fallos.join(" "), ruta).toMatch(/no nombra a [^(]*seguridad/);
    }
    const bot = comprueba(cuerpoDe({ agente: "constructor", tipo: "improve", jueces: ["revisor"] }), [f("api/bot/telegram.js")]);
    expect(bot.fallos.join(" ")).toMatch(/no nombra a [^(]*evaluador/);
    const con = comprueba(cuerpoDe({ agente: "constructor", tipo: "fix", jueces: ["revisor", "seguridad"] }), [f(".claude/hooks/guardia.mjs")]);
    expect(con.fallos).toEqual([]);
    expect(con.plan.banderas_de_rutas).toEqual(["touches_secrets_or_permissions"]);
  });
  it("un Agente que no es agente ni sesión falla su norma, no queda sin mirar", () => {
    const r = comprueba(cuerpoDe({ agente: "gobierno", tipo: "create", jueces: ["revisor"] }), [f("scripts/x.mjs")]);
    expect(resultado(r, NORMAS_DEL_PASO.agente)).toBe("fail");
    expect(r.fallos.join(" ")).toMatch(/«Agente: gobierno» no es un agente/);
  });
  it("un PR a main no se dimensiona: el paso a producción lleva lo que ya se juzgó en staging", () => {
    const r = comprueba("Agente: constructor", [f("scripts/x.mjs")], DESPUES, { base: "main" });
    expect([r.exento, r.porque, r.fallos]).toEqual([true, "main", []]);
    expect(comprueba("Agente: constructor", [f("scripts/x.mjs")], DESPUES, { base: "staging" }).exento).toBe(false);
  });
  it("los bots, exentos; sin diff, los jueces exigidos quedan sin mirar", () => {
    expect(comprueba("", [], DESPUES, { autor: "dependabot[bot]" }).exento).toBe(true);
    const r = comprueba(cuerpoDe({ agente: "constructor", tipo: "create", jueces: ["revisor"] }), null);
    expect(resultado(r, NORMAS_DEL_PASO.tipoYJueces)).toBe("unchecked");
    expect(r.fallos).toEqual([]);
  });
  it("Tipo admite un tipo o un subtipo, también retirado", () => {
    expect(entradaDeTipo("fix")).toEqual({ tipo: "fix" });
    expect(entradaDeTipo("fix-bug")).toEqual({ subtipo: "fix-bug" });
    expect(entradaDeTipo("nada")).toBe(null);
  });
  it("cada norma del paso existe en ops/normas.json, con el CI de ejecutor y este test de control", () => {
    for (const id of Object.values(NORMAS_DEL_PASO)) {
      const n = NORMAS.find((x) => x.id === id);
      expect(n, id).toBeTruthy();
      expect([n.ejecutor, n.control], id).toEqual(["ci", "scripts/dimensionado-pr.test.js"]);
    }
  });
  it("lee el diff como el CI (añadidas más quitadas)", () => {
    const diff = "diff --git a/x.mjs b/x.mjs\n--- a/x.mjs\n+++ b/x.mjs\n@@ -1 +1,2 @@\n-a\n+b\n+c\n";
    expect(ficherosDeDiff(leerDiff(diff))).toEqual([{ ruta: "x.mjs", lines: 3 }]);
  });
});

// ── La cadena entera, de punta a punta (cableado duro, decidido por Pablo el 12 oct 2026) ──────────────────────────
// Un PR de ejemplo por tipo. Si un eslabón deja de estar cableado al siguiente, falla aquí.
const EJEMPLOS = {
  create: { ficheros: [f("src/screens/Plan.jsx")], agente: "constructor" },
  fix: { ficheros: [f("api/_bot/ejemplo-inventado.js")], agente: "constructor", subtipo: "fix-bug" },
  improve: { ficheros: [f("scripts/lib/solver-medidas.mjs")], agente: "constructor" },
  operate: { ficheros: [f(".github/workflows/tests.yml"), f(".claude/hooks/guardia.mjs")], agente: "constructor" },
  audit: { ficheros: [f("src/data/recipes.json")], agente: "sesión" },
};
const ctxGuardia = (cuerpo) => ({
  enStaging: () => false, estadoMd: "", baseDelPr: () => "staging", atrasoLocal: () => 0, choquesDelPr: () => [],
  esPrincipal: () => false, rutaEnPrincipal: () => false, ramaDe: () => "ops/x", leer: () => cuerpo,
});
const ESTANDARES = leerEstandaresDe(RAIZ);

describe("la cadena de punta a punta, un caso por tipo", () => {
  it("hay un ejemplo por cada tipo de ops/tipos-de-encargo.json", () => expect(Object.keys(EJEMPLOS).sort()).toEqual(Object.keys(TYPES).sort()));

  for (const [tipo, ej] of Object.entries(EJEMPLOS)) {
    describe(tipo, () => {
      const valorTipo = ej.subtipo ?? tipo;
      // 1. tipo y subtipo → dimensionado
      const plan = dimensionar({ fuente: "diff", ficheros: ej.ficheros, ...entradaDeTipo(valorTipo) });
      const cuerpo = cuerpoDe({ agente: ej.agente, tipo: valorTipo, jueces: plan.jueces });

      it("2. el dimensionado da jueces exigidos, todos jueces y ninguno el constructor", () => {
        expect(plan.tipo).toBe(tipo);
        expect(plan.jueces.length).toBeGreaterThanOrEqual(1);
        for (const j of plan.jueces) expect(JUECES).toContain(j);
        expect(plan.jueces).not.toContain(ej.agente);
        if (DE_SESION.includes(ej.agente)) expect(sesionPermitida(plan)).toBe(true);
      });
      it("3. la guardia deja abrir el PR con esas líneas y lo niega sin ellas", () => {
        expect(decidir({ tool_name: "Bash", tool_input: { command: "gh pr create --body-file pr.md" } }, ctxGuardia(cuerpo))?.decision ?? null).toBe(null);
        const sinJueces = cuerpo.replace(/^Jueces:.*$/m, "");
        const r = decidir({ tool_name: "Bash", tool_input: { command: "gh pr create --body-file pr.md" } }, ctxGuardia(sinJueces));
        expect(r?.decision).toBe("deny");
        expect(r.motivo).toMatch(/Jueces/);
      });
      it("4. el CI lo da por bueno, y falla si falta cualquiera de los jueces exigidos", () => {
        expect(comprueba(cuerpo, ej.ficheros).fallos).toEqual([]);
        for (const j of plan.jueces) {
          const resto = plan.jueces.filter((x) => x !== j);
          const sin = cuerpoDe({ agente: ej.agente, tipo: valorTipo, jueces: resto.length ? resto : JUECES.filter((x) => x !== j && !plan.jueces.includes(x)).slice(0, 1) });
          expect(comprueba(sin, ej.ficheros).fallos.join(" "), `${tipo} sin ${j}`).toMatch(new RegExp(`no nombra a ${j}`));
        }
      });
      it("5 y 6. cada agente del plan recibe un brief con su estándar y sus normas, y el hook lo deja lanzar; sin estándar, lo niega", () => {
        const agentes = [...new Set(plan.fases.flatMap((x) => x.agentes.map((a) => a.agente)))].filter((a) => a in ESTANDARES.agentes);
        expect(agentes.length).toBeGreaterThan(0);
        for (const a of agentes) {
          const brief = briefDe(plan, a);
          expect(brief, a).toMatch(new RegExp(`^ESTÁNDAR A CUMPLIR: ${a}/`, "m"));
          const lanza = (prompt) => decidirLanzamiento({ tool_name: "Agent", tool_input: { subagent_type: a, prompt } }, ESTANDARES, HOY);
          expect(lanza(brief), a).toBe(null);
          expect(lanza(brief.replace(/^ESTÁNDAR A CUMPLIR:.*$/m, ""))?.decision, a).toBe("deny");
        }
      });
    });
  }
});

describe("el cableado de cada eslabón", () => {
  const tests = readFileSync(join(RAIZ, ".github", "workflows", "tests.yml"), "utf8");
  it("tests.yml lanza el paso en cada PR, con el cuerpo, el autor, el número, la fecha de creación y el diff, todo por entorno", () => {
    const paso = /- name: Dimensionado del PR\n([\s\S]*?)(?=\n      - )/.exec(tests)?.[1] ?? "";
    expect(paso).toMatch(/if: github\.event_name == 'pull_request'/);
    expect(paso).toMatch(/node scripts\/dimensionado-pr\.mjs "\$RUNNER_TEMP\/diff-del-pr\.txt"/);
    for (const v of ["PR_BODY", "PR_AUTOR", "PR_BASE", "PR_NUMBER", "PR_CREADO"]) expect(paso).toMatch(new RegExp(`${v}: \\$\\{\\{ github\\.event\\.pull_request\\.`));
    // Nada del PR interpolado en el `run:` (inyección): solo por entorno.
    expect(/run: \|\n([\s\S]*?)\n {8}env:/.exec(paso)?.[1] ?? "x").not.toMatch(/\$\{\{/);
  });
  it("la plantilla del PR trae las líneas Tipo y Jueces", () => {
    const plantilla = readFileSync(join(RAIZ, ".github", "pull_request_template.md"), "utf8");
    expect(plantilla).toMatch(/^Tipo: *$/m);
    expect(plantilla).toMatch(/^Jueces: *$/m);
  });
  it("el script, lanzado como en el CI, falla con 1 sin las líneas y sale con 0 con ellas", () => {
    const corre = (PR_BODY, PR_CREADO = DESPUES) => spawnSync(process.execPath, [join(RAIZ, "scripts", "dimensionado-pr.mjs")], { encoding: "utf8", env: { ...process.env, PR_BODY, PR_AUTOR: "x", PR_NUMBER: "1", PR_CREADO, HOY } });
    const no = corre("Agente: constructor");
    expect(no.status).toBe(1);
    expect(no.stdout).toMatch(/norma: pr-tipo-y-jueces-exigidos resultado: fail pr: 1/);
    const antes = corre("Agente: constructor", ANTES);
    expect(antes.status).toBe(0);
    expect(antes.stdout).toMatch(/resultado: warning/);
    expect(corre("Agente: constructor\nTipo: create\nJueces: revisor").status).toBe(0);
  });
});
