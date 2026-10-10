// La cuota de GitHub (#424, fondo #326): la caché, la línea contable y el ratchet
// que vigila que no vuelvan a subir las llamadas que agotaron el cupo GraphQL.
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APIS_GH, CALLERS_GH, TTL_MIN, apiDe, conCache, contarLog, lineaGh, registrarGh } from "./lib/cuotaGh.mjs";
import { resumirChecks } from "./espera-ci.mjs";

const raiz = join(import.meta.dirname, "..");
const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "cuota-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("apiDe y la línea contable", () => {
  it("distingue REST y GraphQL", () => {
    expect(apiDe(["api", "graphql", "-f", "query=x"])).toBe("graphql");
    expect(apiDe(["api", "repos/a/b/issues"])).toBe("rest");
    expect(apiDe(["issue", "list"])).toBe("graphql");
    expect(apiDe(["pr", "checks", "1"])).toBe("graphql");
    expect(apiDe(["run", "list"])).toBe("rest");
  });

  it("usa un vocabulario cerrado y no cuela texto libre", () => {
    expect(lineaGh("issues", "graphql")).toBe("gh: caller=issues api=graphql");
    expect(lineaGh("inventado con espacios y token ghs_abc", "otra")).toBe("gh: caller=otro api=graphql");
    for (const c of CALLERS_GH) for (const a of APIS_GH) expect(lineaGh(c, a)).toBe(`gh: caller=${c} api=${a}`);
  });

  it("registrarGh escribe una línea por llamada y se puede contar", () => {
    const dir = tmp();
    registrarGh("issues", ["api", "graphql"], { dir });
    registrarGh("issues", ["api", "graphql"], { dir });
    registrarGh("avisos", ["api", "repos/x"], { dir });
    expect(contarLog(readFileSync(join(dir, "gh.log"), "utf8"))).toEqual({ "issues/graphql": 2, "avisos/rest": 1 });
  });

  it("registrarGh no rompe si no puede escribir", () => {
    const dir = tmp();
    writeFileSync(join(dir, "fichero"), "x"); // una carpeta que en realidad es un fichero
    expect(() => registrarGh("issues", ["issue", "list"], { dir: join(dir, "fichero") })).not.toThrow();
  });
});

describe("conCache", () => {
  const nombre = "issues-nodos";

  it("no vuelve a pedir dentro del TTL y sí al pasar", () => {
    const dir = tmp();
    let pedidas = 0;
    const pedir = () => ({ n: ++pedidas });
    expect(conCache(nombre, { ttlMin: 15, pedir, dir })).toEqual({ n: 1 });
    expect(conCache(nombre, { ttlMin: 15, pedir, dir })).toEqual({ n: 1 });
    const antes = new Date(Date.now() - 16 * 60_000);
    utimesSync(join(dir, `${nombre}.json`), antes, antes);
    expect(conCache(nombre, { ttlMin: 15, pedir, dir })).toEqual({ n: 2 });
    expect(pedidas).toBe(2);
  });

  it("con TTL 0 (lo que escribe) siempre pide, pero deja la caché para el siguiente", () => {
    const dir = tmp();
    let pedidas = 0;
    const pedir = () => ({ n: ++pedidas });
    conCache(nombre, { ttlMin: 0, pedir, dir });
    conCache(nombre, { ttlMin: 0, pedir, dir });
    expect(pedidas).toBe(2);
    expect(conCache(nombre, { ttlMin: 15, pedir, dir })).toEqual({ n: 2 });
    expect(pedidas).toBe(2);
  });

  it("plan B: sin cuota, devuelve lo viejo y lo avisa; sin viejoSiFalla, propaga el error", () => {
    const dir = tmp();
    conCache(nombre, { ttlMin: 15, pedir: () => ["viejo"], dir });
    const antes = new Date(Date.now() - 3 * 3600_000);
    utimesSync(join(dir, `${nombre}.json`), antes, antes);
    const falla = () => {
      throw new Error("API rate limit exceeded");
    };
    const avisos = [];
    expect(conCache(nombre, { ttlMin: 15, viejoSiFalla: true, pedir: falla, aviso: (m) => avisos.push(m), dir })).toEqual(["viejo"]);
    expect(avisos[0]).toMatch(/hace 180 min/);
    expect(() => conCache(nombre, { ttlMin: 15, pedir: falla, dir })).toThrow(/rate limit/);
  });

  it("plan B: una caché ilegible no rompe, se pide como antes", () => {
    const dir = tmp();
    conCache(nombre, { ttlMin: 15, pedir: () => 1, dir });
    writeFileSync(join(dir, `${nombre}.json`), "{roto");
    expect(conCache(nombre, { ttlMin: 15, pedir: () => 2, dir })).toBe(2);
  });
});

describe("espera-ci (REST)", () => {
  it("resume los check-runs", () => {
    expect(resumirChecks([]).estado).toBe("pendiente");
    expect(resumirChecks([{ name: "tests", status: "in_progress", conclusion: null }]).estado).toBe("pendiente");
    expect(resumirChecks([{ name: "tests", status: "completed", conclusion: "success" }]).estado).toBe("ok");
    expect(resumirChecks([{ name: "tests", status: "completed", conclusion: "skipped" }]).estado).toBe("ok");
    const f = resumirChecks([{ name: "tests", status: "completed", conclusion: "failure" }, { name: "x", status: "queued", conclusion: null }]);
    expect(f).toMatchObject({ estado: "falla", fallan: ["tests"], faltan: 1 });
  });
});

// ── El ratchet: lo que agotó la cuota no puede volver a subir ───────────────────

const leer = (r) => readFileSync(join(raiz, r), "utf8");
function ficheros(dir, ext, out = []) {
  for (const f of readdirSync(join(raiz, dir))) {
    const rel = `${dir}/${f}`;
    if (["node_modules", "skills-prueba", ".git", "agent-memory"].includes(f)) continue;
    if (statSync(join(raiz, rel)).isDirectory()) ficheros(rel, ext, out);
    else if (ext.some((e) => f.endsWith(e)) && !/\.test\.[jm]?js$/.test(f)) out.push(rel);
  }
  return out;
}

describe("ratchet de la cuota GraphQL (#424)", () => {
  // Techos = lo que hay hoy. Bajar es bueno; subir exige pensar en la cuota y cambiar el número aquí.
  const TECHO_WATCH = 5; // menciones de `gh pr checks … --watch` fuera de tests: hoy solo para desaconsejarlo (skill github, su capa cuota-graphql y la cabecera de espera-ci)
  const TECHO_GRAPHQL_ISSUES = 4; // sitios con `api graphql` en scripts/issues.mjs: issues, PR del índice, PR de «Casos:» y la mutación de colgar

  it("nadie recomienda `gh pr checks --watch`: se espera con `npm run espera-ci`", () => {
    const todos = [...ficheros(".claude", [".md", ".mjs", ".json"]), ...ficheros("docs", [".md"]), ...ficheros("scripts", [".mjs"]), ...ficheros("ops", [".md", ".json"])];
    const hallazgos = todos.filter((f) => /pr checks[^\n]*--watch/.test(leer(f)));
    const cuenta = todos.reduce((n, f) => n + (leer(f).match(/pr checks[^\n]*--watch/g) ?? []).length, 0);
    expect(cuenta, `menciones en: ${hallazgos.join(", ")}`).toBeLessThanOrEqual(TECHO_WATCH);
    // Ni una como instrucción en una tabla de operaciones.
    expect(leer(".claude/skills/github/SKILL.md")).not.toMatch(/^\|[^\n]*\| `gh pr checks[^\n]*--watch/m);
  });

  it("los sitios de GraphQL de scripts/issues.mjs no suben", () => {
    const n = (leer("scripts/issues.mjs").match(/"api", "graphql"/g) ?? []).length;
    expect(n).toBeLessThanOrEqual(TECHO_GRAPHQL_ISSUES);
  });

  it("el arranque y el listado leen los issues con caché; solo lo que escribe va fresco", () => {
    const f = leer("scripts/issues.mjs");
    const arranque = f.slice(f.indexOf('args.includes("--arranque")'));
    expect(arranque).toMatch(/todos\(\{ ttlMin: TTL_MIN\.arranque, viejoSiFalla: true \}\)/);
    expect(arranque).toMatch(/todos\(\{ ttlMin: TTL_MIN\.listado, viejoSiFalla: true \}\)/);
    expect(TTL_MIN.arranque).toBeGreaterThanOrEqual(10);
    // Cualquier otra lectura (`todos()` a secas) es de una orden que escribe: TTL 0.
    expect((f.match(/todos\(\)/g) ?? []).length).toBeLessThanOrEqual(5); // --colgar, --nuevo (parecidos y padre), --ordenar, --marcas-huerfanas
  });

  it("las escrituras invalidan la caché", () => {
    expect((leer("scripts/issues.mjs").match(/borrarCacheGh\("issues-nodos"\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("el arranque abre una sola lectura de issues", () => {
    const f = leer("scripts/issues.mjs");
    const ini = f.indexOf('args.includes("--arranque")');
    const rama = f.slice(ini, f.indexOf("} else {", ini));
    expect((rama.match(/todos\(/g) ?? []).length).toBe(1);
  });

  it("los puntos que llaman a gh dejan su línea contable", () => {
    expect(leer("scripts/issues.mjs")).toMatch(/registrarGh\("issues"/);
    expect(leer(".claude/hooks/avisos.mjs")).toMatch(/registrarGh\("avisos"/);
  });
});
