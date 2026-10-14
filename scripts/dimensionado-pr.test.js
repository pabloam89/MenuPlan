// Lo dimensionado, exigido en cada PR (#642, fondo #639; decisión #387): la comprobación del CI y la cadena entera,
// de punta a punta, para cada tipo: tipo → dimensionado → jueces exigidos → CI → brief con estándar → hook de lanzamiento.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decidir } from "../.claude/hooks/guardia.mjs";
import { decidirLanzamiento, leerEstandaresDe } from "../.claude/hooks/lanzamiento.mjs";
import { JUECES } from "./lib/agentes.mjs";
import { briefDe, dimensionar } from "./lib/dimensionado.mjs";
import { DE_SESION, FALLA_DESDE, FIN_TRANSICION, JUEZ_SIN_BASE, NORMAS_DEL_PASO, comprobarDimensionado, entradaDeTipo, ficherosDeDiff, sesionPermitida } from "./lib/dimensionadoPr.mjs";
import { leerDiff } from "./lib/avisosPr.mjs";
import { leerRegistro } from "./lib/normas.mjs";
import { DATOS as DATOS_TIPOS, TYPES, flagsDeRutasConBase } from "./lib/tiposDeEncargo.mjs";

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
  it("la transición acaba también por la fecha del run: desde FIN_TRANSICION (FALLA_DESDE + 14 días) falla el PR creado antes", () => {
    expect(FIN_TRANSICION).toBe("2026-10-31");
    const viejo = (hoy) => comprueba("Agente: constructor", [f("scripts/x.mjs")], ANTES, { hoy });
    const ultimoDia = new Date(Date.parse(`${FIN_TRANSICION}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    expect(viejo(ultimoDia).transicion).toBe(true);
    expect(resultado(viejo(ultimoDia), NORMAS_DEL_PASO.tipoYJueces)).toBe("warning");
    expect(viejo(FIN_TRANSICION).transicion).toBe(false);
    expect(resultado(viejo(FIN_TRANSICION), NORMAS_DEL_PASO.tipoYJueces)).toBe("fail");
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
    const bot = comprueba(cuerpoDe({ agente: "constructor", tipo: "improve", jueces: ["revisor"] }), [f("api/bot/inventado.js")]);
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
  it("lee el diff como el CI (añadidas más quitadas), sin las líneas: ninguna bandera decide por el contenido", () => {
    const diff = "diff --git a/x.mjs b/x.mjs\n--- a/x.mjs\n+++ b/x.mjs\n@@ -1 +1,2 @@\n-a\n+b\n+c\n";
    expect(ficherosDeDiff(leerDiff(diff))).toEqual([{ ruta: "x.mjs", lines: 3 }]);
  });
  it("un renombrado del diff guarda su ruta de antes, y sacar la guardia de .claude/hooks/ pide a seguridad (#642)", () => {
    const puro = "diff --git a/.claude/hooks/guardia.mjs b/docs/guardia.mjs\nsimilarity index 100%\nrename from .claude/hooks/guardia.mjs\nrename to docs/guardia.mjs\n";
    const conCambios = "diff --git a/.claude/hooks/guardia.mjs b/docs/guardia.mjs\nsimilarity index 90%\nrename from .claude/hooks/guardia.mjs\nrename to docs/guardia.mjs\n--- a/.claude/hooks/guardia.mjs\n+++ b/docs/guardia.mjs\n@@ -1 +1 @@\n-a\n+b\n";
    const copia = "diff --git a/.claude/settings.json b/docs/settings.json\nsimilarity index 100%\ncopy from .claude/settings.json\ncopy to docs/settings.json\n";
    for (const diff of [puro, conCambios]) {
      const leidos = ficherosDeDiff(leerDiff(diff));
      expect(leidos).toMatchObject([{ ruta: "docs/guardia.mjs", origen: ".claude/hooks/guardia.mjs" }]);
      const r = comprueba(cuerpoDe({ agente: "constructor", tipo: "improve", jueces: ["revisor"] }), leidos);
      expect(r.fallos.join(" ")).toMatch(/no nombra a [^(]*seguridad/);
    }
    expect(leerDiff(copia)[0]).toMatchObject({ ruta: "docs/settings.json", origen: ".claude/settings.json" });
  });
  it("toda migración pide a seguridad: una create view, un security_invoker, una columna o una migración binaria (#642)", () => {
    const mig = (linea) => ficherosDeDiff(leerDiff("diff --git a/supabase/migrations/0300_x.sql b/supabase/migrations/0300_x.sql\nnew file mode 100644\n--- /dev/null\n+++ b/supabase/migrations/0300_x.sql\n@@ -0,0 +1,2 @@\n+-- 0300: una vista\n+" + linea + "\n"));
    const binaria = ficherosDeDiff(leerDiff("diff --git a/supabase/migrations/0300_x.sql b/supabase/migrations/0300_x.sql\nnew file mode 100644\nBinary files /dev/null and b/supabase/migrations/0300_x.sql differ\n"));
    const cuerpo = cuerpoDe({ agente: "constructor", tipo: "create", jueces: ["revisor", "auditor-datos"] });
    for (const ficheros of [mig("create view public.v as select * from public.x;"), mig("alter view public.v set (security_invoker = false);"), mig("alter table public.x add column y text;"), binaria]) {
      const r = comprueba(cuerpo, ficheros);
      expect(r.plan.banderas_de_rutas).toEqual(["touches_rls"]);
      expect(r.fallos.join(" ")).toMatch(/no nombra a [^(]*seguridad/);
    }
  });
  it("falla cerrado: si las banderas de la base no se pueden leer, se exige además a seguridad (#642)", () => {
    const cuerpo = cuerpoDe({ agente: "constructor", tipo: "improve", jueces: ["revisor"] });
    const podar = [f("scripts/podar.mjs")];
    expect(JUEZ_SIN_BASE).toBe("seguridad");
    expect(comprueba(cuerpo, podar).fallos).toEqual([]);
    const sinBase = comprueba(cuerpo, podar, DESPUES, { baseLegible: false });
    expect(resultado(sinBase, NORMAS_DEL_PASO.tipoYJueces)).toBe("fail");
    expect(sinBase.fallos.join(" ")).toMatch(/no nombra a seguridad/);
    expect(comprueba(cuerpoDe({ agente: "constructor", tipo: "improve", jueces: ["revisor", "seguridad"] }), podar, DESPUES, { baseLegible: false }).fallos).toEqual([]);
  });
  it("si una norma admite excepción lo dice la BASE: un PR que pone admite_excepcion a true en su normas.json no se exime (#642)", () => {
    const pantalla = [f("src/screens/Plan.jsx")];
    const n = NORMAS_DEL_PASO.tipoYJueces;
    const cuerpo = cuerpoDe({ agente: "constructor", tipo: "create", jueces: ["revisor"] }) + "\nExcepción: " + n + " — PR de emergencia sin tiempo de jueces — hasta 2026-10-25";
    const delPr = NORMAS.map((x) => (x.id === n ? { ...x, admite_excepcion: true } : x));
    const con = (extra) => resultado(comprobarDimensionado({ cuerpo, ficheros: pantalla, normas: delPr, hoy: HOY, creado: DESPUES, ...extra }), n);
    // Con su propio normas.json el PR se eximiría: es el agujero que se cierra leyendo la base.
    expect(con({})).toBe("exempt");
    expect(con({ normasBase: NORMAS })).toBe("fail");
    expect(con({ normasBase: null })).toBe("fail");
    // La que la base sí deja eximir sigue exenta; sin base legible (null), ninguna.
    const ag = NORMAS_DEL_PASO.agente;
    const cuerpoAg = "Agente: sesión\nTipo: create\nJueces: revisor, qa\nExcepción: " + ag + " — la sesión arregla a mano un fichero de un constructor — hasta 2026-10-25";
    const conAg = (normasBase) => resultado(comprobarDimensionado({ cuerpo: cuerpoAg, ficheros: pantalla, normas: NORMAS, hoy: HOY, creado: DESPUES, normasBase }), ag);
    expect(conAg(NORMAS)).toBe("exempt");
    expect(conAg(null)).toBe("fail");
  });
  it("las banderas de rutas de la base mandan: un PR que se quita la ruta de los hooks en su JSON sigue pidiendo a seguridad (#642)", () => {
    const pr = structuredClone(DATOS_TIPOS.flags);
    pr.touches_secrets_or_permissions.rutas = ["^nada/"];
    const cuerpo = cuerpoDe({ agente: "constructor", tipo: "fix", jueces: ["revisor"] });
    const hook = [f(".claude/hooks/guardia.mjs")];
    expect(comprueba(cuerpo, hook, DESPUES, { flagsRutas: flagsDeRutasConBase(DATOS_TIPOS.flags, pr).flags }).fallos.join(" ")).toMatch(/no nombra a [^(]*seguridad/);
    // Plan B (sin base): manda el JSON del PR, y por eso el script lo avisa.
    expect(comprueba(cuerpo, hook, DESPUES, { flagsRutas: flagsDeRutasConBase(null, pr).flags }).fallos).toEqual([]);
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

describe("un agente fuera del plan (#642)", () => {
  const plan = dimensionar({ fuente: "diff", ficheros: [f("scripts/x.mjs")], tipo: "fix" });
  it.each([["analista", "diagnosticar-causa-raiz"], ["qa", "recorrer-flujo-en-navegador"], ["seguridad", "auditar-secretos"]])("%s con --tarea tiene brief, y el hook lo deja lanzar", (agente, tarea) => {
    expect(plan.fases.flatMap((x) => x.agentes.map((a) => a.agente))).not.toContain(agente);
    expect(() => briefDe(plan, agente)).toThrow(/--brief .* --tarea/);
    const brief = briefDe(plan, agente, { tarea });
    expect(brief).toMatch(new RegExp(`^ESTÁNDAR A CUMPLIR: ${agente}/${tarea}$`, "m"));
    expect(brief).toMatch(/fuera del plan/);
    expect(decidirLanzamiento({ tool_name: "Agent", tool_input: { subagent_type: agente, prompt: brief } }, ESTANDARES, HOY)).toBe(null);
  });
  it("con una tarea que no es suya, no hay brief", () => {
    expect(() => briefDe(plan, "analista", { tarea: "auditar-secretos" })).toThrow(/no tiene la tarea/);
  });
});

describe("el cableado de cada eslabón", () => {
  const tests = readFileSync(join(RAIZ, ".github", "workflows", "tests.yml"), "utf8");
  it("tests.yml lanza el paso en cada PR, con el cuerpo, el autor, el número, la fecha de creación y el diff, todo por entorno", () => {
    const paso = /- name: Dimensionado del PR\n([\s\S]*?)(?=\n {6}- )/.exec(tests)?.[1] ?? "";
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
  it("tests.yml lee las banderas y las normas de la base del PR (HEAD^1) y se las pasa al script por TIPOS_BASE y NORMAS_BASE", () => {
    const paso = /- name: Dimensionado del PR\n([\s\S]*?)(?=\n {6}- )/.exec(tests)?.[1] ?? "";
    expect(paso).toMatch(/git show HEAD\^1:ops\/tipos-de-encargo\.json > "\$RUNNER_TEMP\/tipos-de-la-base\.json"/);
    expect(paso).toMatch(/git show HEAD\^1:ops\/normas\.json > "\$RUNNER_TEMP\/normas-de-la-base\.json"/);
    expect(paso).toMatch(/TIPOS_BASE="\$RUNNER_TEMP\/tipos-de-la-base\.json" NORMAS_BASE="\$RUNNER_TEMP\/normas-de-la-base\.json" node scripts\/dimensionado-pr\.mjs/);
    expect(tests).toMatch(/fetch-depth: 2/);
  });
  it("el script, con la base de TIPOS_BASE, deriva las banderas de ella; sin base, avisa y usa las del PR (plan B)", () => {
    const dir = mkdtempSync(join(tmpdir(), "dimensionado-pr-base-"));
    const diff = join(dir, "diff.txt");
    writeFileSync(diff, "diff --git a/scripts/podar.mjs b/scripts/podar.mjs\n--- a/scripts/podar.mjs\n+++ b/scripts/podar.mjs\n@@ -1 +1 @@\n-a\n+b\n");
    const base = structuredClone(DATOS_TIPOS);
    base.flags.touches_secrets_or_permissions.rutas = ["^scripts/podar\\.mjs$"];
    const rutaBase = join(dir, "tipos-de-la-base.json");
    writeFileSync(rutaBase, JSON.stringify(base));
    const corre = (TIPOS_BASE) => spawnSync(process.execPath, [join(RAIZ, "scripts", "dimensionado-pr.mjs"), diff], { encoding: "utf8", env: { ...process.env, PR_BODY: "Agente: constructor\nTipo: improve\nJueces: revisor", PR_AUTOR: "x", PR_NUMBER: "1", PR_CREADO: DESPUES, HOY, TIPOS_BASE } });
    const conBase = corre(rutaBase);
    expect(conBase.status).toBe(1);
    expect(conBase.stdout).toMatch(/salen de la base del PR/);
    expect(conBase.stdout).toMatch(/no nombra a [^(]*seguridad/);
    const sinBase = corre(join(dir, "no-existe.json"));
    // Falla cerrado: sin base, además de avisar, se exige a seguridad (antes pasaba con revisor solo).
    expect(sinBase.status).toBe(1);
    expect(sinBase.stdout).toMatch(/no nombra a seguridad/);
    expect(sinBase.stdout).toMatch(/::warning title=Banderas de rutas del propio PR::/);
    expect(sinBase.stdout).toMatch(/salen de este PR \(plan B\)/);
  });
});
