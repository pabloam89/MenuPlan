import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { deseados, diferencias, ejecutar, NOMBRE_MAIN, NOMBRE_STAGING, sinSecretos, tokenDe } from "./rulesets.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "ghp_FALSO0123456789abcdefghijklmnopqrstu";

// El ruleset de staging tal como está hoy en GitHub (leído el 10 oct 2026).
const STAGING_HOY = {
  id: 24770007, name: NOMBRE_STAGING, target: "branch", enforcement: "active",
  conditions: { ref_name: { include: ["refs/heads/staging"], exclude: [] } },
  rules: [{ type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, do_not_enforce_on_create: false, required_status_checks: [{ context: "tests", integration_id: 15368 }] } }],
  bypass_actors: [{ actor_id: null, actor_type: "DeployKey", bypass_mode: "always" }],
};

/** Un GitHub de mentira con estado: apunta las llamadas y guarda lo que se escribe. */
function github({ admin = true, inicial = [STAGING_HOY], fallaEn = null } = {}) {
  const rulesets = new Map(inicial.map((r) => [r.id, structuredClone(r)]));
  const llamadas = [];
  let sig = 100;
  const resp = (status, cuerpo) => ({ ok: status < 400, status, json: async () => cuerpo });
  const fetchFn = async (url, op) => {
    const ruta = new URL(url).pathname.replace("/repos/pabloam89/MenuPlan", "") || "/";
    const metodo = op.method;
    llamadas.push({ metodo, ruta, auth: op.headers.Authorization, cuerpo: op.body ? JSON.parse(op.body) : null });
    if (fallaEn === `${metodo} ${ruta}`) return resp(500, { message: `boom con ${TOKEN}` });
    if (metodo === "GET" && ruta === "/") return resp(200, { permissions: { admin } });
    if (metodo === "GET" && ruta === "/rulesets") return resp(200, [...rulesets.values()].map(({ id, name }) => ({ id, name })));
    const m = ruta.match(/^\/rulesets\/(\d+)$/);
    if (metodo === "GET" && m) return rulesets.has(+m[1]) ? resp(200, rulesets.get(+m[1])) : resp(404, { message: "Not Found" });
    if (metodo === "POST" && ruta === "/rulesets") { const id = sig++; rulesets.set(id, { id, ...JSON.parse(op.body) }); return resp(201, { id }); }
    if (metodo === "PUT" && m) { rulesets.set(+m[1], { id: +m[1], ...JSON.parse(op.body) }); return resp(200, { id: +m[1] }); }
    return resp(404, { message: "no previsto" });
  };
  return { fetchFn, llamadas, rulesets };
}
const correr = async (argv, gh, env = { GH_TOKEN: TOKEN }) => {
  const lineas = [];
  const codigo = await ejecutar({ argv, env, fetchFn: gh.fetchFn, salida: (l) => lineas.push(l) });
  return { codigo, texto: lineas.join("\n") };
};
const escrituras = (gh) => gh.llamadas.filter((l) => l.metodo !== "GET");

describe("lo deseado", () => {
  const [main, staging] = deseados();
  it("main: PR con 1 aprobación de dueño, `tests` y ningún bypass", () => {
    expect(main.name).toBe(NOMBRE_MAIN);
    const pr = main.rules.find((r) => r.type === "pull_request").parameters;
    expect(pr.required_approving_review_count).toBe(1);
    expect(pr.require_code_owner_review).toBe(true);
    expect(main.rules.find((r) => r.type === "required_status_checks").parameters.required_status_checks).toEqual([{ context: "tests", integration_id: 15368 }]);
    expect(main.bypass_actors).toEqual([]);
  });
  it("staging: sigue con `tests` y la deploy key, y la revisión de dueño sin aprobación para todos", () => {
    expect(staging.name).toBe(NOMBRE_STAGING);
    expect(staging.bypass_actors).toEqual([{ actor_id: null, actor_type: "DeployKey", bypass_mode: "always" }]);
    const pr = staging.rules.find((r) => r.type === "pull_request").parameters;
    expect(pr.required_approving_review_count).toBe(0);
    expect(pr.require_code_owner_review).toBe(true);
    expect(staging.rules.some((r) => r.type === "required_status_checks")).toBe(true);
  });
  it("--bypass-admin añade al administrador solo por PR, nunca a la App ni siempre", () => {
    for (const r of deseados({ bypassAdmin: true })) {
      const admin = r.bypass_actors.filter((b) => b.actor_type !== "DeployKey");
      expect(admin).toEqual([{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "pull_request" }]);
      expect(r.bypass_actors.some((b) => b.actor_type === "Integration")).toBe(false);
    }
  });
});

describe("diferencias", () => {
  it("el staging de hoy difiere solo en la revisión de dueño; main no existe", () => {
    const [main, staging] = deseados();
    expect(diferencias(STAGING_HOY, staging)).toEqual([expect.stringMatching(/^regla pull_request: falta$/)]);
    expect(diferencias(null, main)).toEqual(["no existe"]);
  });
  it("ignora lo que GitHub añade (ids, fechas, parámetros por defecto)", () => {
    const [, staging] = deseados();
    const actual = { ...structuredClone(staging), id: 1, created_at: "x", node_id: "y" };
    actual.rules[1].parameters.allowed_merge_methods = ["merge"];
    expect(diferencias(actual, staging)).toEqual([]);
  });
  it("avisa de un bypass que sobra y de un token que no ve los actores", () => {
    const [, staging] = deseados();
    const de_mas = structuredClone(staging);
    de_mas.bypass_actors.push({ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" });
    expect(diferencias(de_mas, staging).join()).toMatch(/bypass/);
    const sinVer = structuredClone(staging);
    delete sinVer.bypass_actors;
    expect(diferencias(sinVer, staging).join()).toMatch(/sin comprobar/);
  });
  it("una aprobación de menos o la revisión de dueño apagada se ven", () => {
    const [main] = deseados();
    const flojo = structuredClone(main);
    flojo.rules.find((r) => r.type === "pull_request").parameters.require_code_owner_review = false;
    flojo.enforcement = "evaluate";
    const d = diferencias(flojo, main).join();
    expect(d).toMatch(/require_code_owner_review/);
    expect(d).toMatch(/enforcement/);
  });
});

describe("modo lectura (por defecto)", () => {
  it("lee, muestra la diferencia y no escribe nada", async () => {
    const gh = github();
    const r = await correr([], gh);
    expect(r.codigo).toBe(1);
    expect(r.texto).toContain(`rulesets ${NOMBRE_MAIN}: difiere`);
    expect(r.texto).toContain(`rulesets ${NOMBRE_STAGING}: difiere (id 24770007)`);
    expect(escrituras(gh)).toEqual([]);
  });
  it("con todo igual sale 0", async () => {
    const gh = github({ inicial: deseados().map((d, i) => ({ id: i + 1, ...d })) });
    expect((await correr([], gh)).codigo).toBe(0);
  });
});

describe("modo --escribir", () => {
  it("con administrador: crea main, actualiza staging por su id y lo comprueba después", async () => {
    const gh = github();
    const r = await correr(["--escribir"], gh);
    expect(r.codigo).toBe(0);
    expect(escrituras(gh).map((l) => `${l.metodo} ${l.ruta}`)).toEqual(["POST /rulesets", "PUT /rulesets/24770007"]);
    expect(r.texto).toContain("comprobado tras escribir");
    // la excepción de la deploy key sobrevive a la actualización
    expect(gh.rulesets.get(24770007).bypass_actors).toEqual([{ actor_id: null, actor_type: "DeployKey", bypass_mode: "always" }]);
    // y una segunda pasada ya no escribe nada
    const otra = github({ inicial: [...gh.rulesets.values()] });
    expect((await correr(["--escribir"], otra)).codigo).toBe(0);
    expect(escrituras(otra)).toEqual([]);
  });
  it("falla cerrado sin permiso de administrador: ni una escritura", async () => {
    const gh = github({ admin: false });
    const r = await correr(["--escribir"], gh);
    expect(r.codigo).toBe(2);
    expect(r.texto).toMatch(/no es de administrador/);
    expect(escrituras(gh)).toEqual([]);
  });
  it("falla cerrado si GitHub contesta un error a mitad, y no enseña el token", async () => {
    const gh = github({ fallaEn: "PUT /rulesets/24770007" });
    const r = await correr(["--escribir"], gh);
    expect(r.codigo).toBe(2);
    expect(r.texto).toContain("500");
    expect(r.texto).not.toContain(TOKEN);
  });
  it("falla si, tras escribir, GitHub no lo deja como se pidió", async () => {
    const gh = github();
    const base = gh.fetchFn;
    gh.fetchFn = async (url, op) => {
      if (op.method === "PUT") return { ok: true, status: 200, json: async () => ({ id: 24770007 }) }; // dice que sí y no guarda
      return base(url, op);
    };
    const r = await correr(["--escribir"], gh);
    expect(r.codigo).toBe(1);
    expect(r.texto).toMatch(/FALLA la comprobación posterior/);
  });
});

describe("cerrado y callado", () => {
  it("sin token no hace nada (ni llama)", async () => {
    const gh = github();
    const lineas = [];
    const codigo = await ejecutar({ argv: [], env: {}, fetchFn: gh.fetchFn, ejecutarGh: () => { throw new Error("sin gh"); }, salida: (l) => lineas.push(l) });
    expect(codigo).toBe(2);
    expect(gh.llamadas).toEqual([]);
  });
  it("un argumento desconocido para en seco", async () => {
    const gh = github();
    expect((await correr(["--si"], gh)).codigo).toBe(2);
    expect(gh.llamadas).toEqual([]);
  });
  it("el token solo va en la cabecera, nunca en la salida", async () => {
    const gh = github();
    const r = await correr([], gh);
    expect(r.texto).not.toContain(TOKEN);
    expect(gh.llamadas.every((l) => l.auth === `Bearer ${TOKEN}`)).toBe(true);
  });
  it("una lista que no es lista o un cuerpo raro: error, no cuelga", async () => {
    const lineas = [];
    const codigo = await ejecutar({ argv: [], env: { GH_TOKEN: TOKEN }, fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ x: 1 }) }), salida: (l) => lineas.push(l) });
    expect(codigo).toBe(2);
  });
  it("sinSecretos y tokenDe", () => {
    expect(sinSecretos(`falla ${TOKEN} y ghs_abc123`, [TOKEN])).not.toMatch(/ghp_|ghs_/);
    expect(tokenDe({ GITHUB_TOKEN: " abc " })).toBe("abc");
    expect(tokenDe({}, () => "del-gh\n")).toBe("del-gh");
  });
});

describe(".github/CODEOWNERS", () => {
  const lineas = readFileSync(join(RAIZ, ".github/CODEOWNERS"), "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  const reglas = lineas.map((l) => l.trim().split(/\s+/));

  it("cada línea tiene un patrón y como único dueño a @pabloam89", () => {
    expect(reglas.length).toBeGreaterThan(0);
    for (const [, ...duenos] of reglas) expect(duenos).toEqual(["@pabloam89"]);
  });
  it("cada ruta existe (una mención muerta no protege nada)", () => {
    for (const [patron] of reglas) expect(existsSync(join(RAIZ, patron.replace(/^\//, ""))), patron).toBe(true);
  });
  it("cubre las rutas sensibles de #330", () => {
    const patrones = reglas.map((r) => r[0]);
    for (const p of ["/.claude/", "/.github/", "/scripts/apply-migration.mjs", "/scripts/lib/permisoAplicar.mjs", "/ops/normas.json"]) expect(patrones).toContain(p);
  });
  it("no hay '*' ni la raíz entera: eso pondría a Pablo en todos los PR", () => {
    for (const [patron] of reglas) expect(patron).not.toMatch(/^\/?\*+$|^\/$/);
  });
});
