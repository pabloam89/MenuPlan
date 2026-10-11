import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ajenosEnLaRama, deseados, diferencias, ejecutar, NOMBRE_MAIN, NOMBRE_MAIN_SOLO, NOMBRE_STAGING, sinSecretos, tokenDe } from "./rulesets.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "ghp_FALSO0123456789abcdefghijklmnopqrstu";

// El ruleset de staging tal como está hoy en GitHub (leído el 10 oct 2026).
const STAGING_HOY = {
  id: 24770007, name: NOMBRE_STAGING, target: "branch", enforcement: "active",
  conditions: { ref_name: { include: ["refs/heads/staging"], exclude: [] } },
  rules: [{ type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, do_not_enforce_on_create: false, required_status_checks: [{ context: "tests", integration_id: 15368 }] } }],
  bypass_actors: [{ actor_id: null, actor_type: "DeployKey", bypass_mode: "always" }],
};

// Lo que habría en staging si alguien aplicara la versión anterior de este script (con revisión de dueño).
const STAGING_CON_DUENO = structuredClone(STAGING_HOY);
STAGING_CON_DUENO.rules.push({ type: "pull_request", parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: true, require_code_owner_review: true, require_last_push_approval: false, required_review_thread_resolution: false } });

/** Un GitHub de mentira con estado: apunta las llamadas y guarda lo que se escribe. */
function github({ admin = true, inicial = [STAGING_HOY], fallaEn = null, fallaCuerpo = null } = {}) {
  const rulesets = new Map(inicial.map((r) => [r.id, structuredClone(r)]));
  const llamadas = [];
  let sig = 100;
  const resp = (status, cuerpo) => ({ ok: status < 400, status, json: async () => cuerpo });
  const fetchFn = async (url, op) => {
    const ruta = new URL(url).pathname.replace("/repos/pabloam89/MenuPlan", "") || "/";
    const metodo = op.method;
    llamadas.push({ metodo, ruta, url, auth: op.headers.Authorization, cuerpo: op.body ? JSON.parse(op.body) : null });
    if (fallaEn === `${metodo} ${ruta}`) return resp(fallaCuerpo ? 422 : 500, fallaCuerpo ?? { message: `boom con ${TOKEN}` });
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
  const [pr, solo, staging] = deseados();
  it("main (a): PR y `tests`, sin ningún bypass", () => {
    expect(pr.name).toBe(NOMBRE_MAIN);
    expect(pr.rules.find((r) => r.type === "required_status_checks").parameters.required_status_checks).toEqual([{ context: "tests", integration_id: 15368 }]);
    expect(pr.rules.some((r) => r.type === "pull_request")).toBe(true);
    expect(pr.bypass_actors).toEqual([]);
  });
  it("main (b): regla update, con bypass solo del rol Administrador y solo por PR", () => {
    expect(solo.name).toBe(NOMBRE_MAIN_SOLO);
    expect(solo.rules.map((r) => r.type)).toEqual(["update"]);
    // GitHub no guarda update_allows_fetch_and_merge y devuelve {} (visto el 11 oct 2026): desearlo hacía fallar la comprobación posterior
    expect(solo.rules[0].parameters).toEqual({});
    const devuelto = { id: 9, ...structuredClone(solo) };
    expect(diferencias(devuelto, solo)).toEqual([]);
    // 5 es el id del rol Administrador en la API de GitHub (literal a propósito: el test no copia el del script)
    expect(solo.bypass_actors).toEqual([{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "pull_request" }]);
  });
  it("staging: solo `tests` y la deploy key; ninguna regla de revisión ni otro bypass (#608)", () => {
    expect(staging.name).toBe(NOMBRE_STAGING);
    expect(staging.bypass_actors).toEqual([{ actor_id: null, actor_type: "DeployKey", bypass_mode: "always" }]);
    expect(staging.rules.map((r) => r.type)).toEqual(["required_status_checks"]);
  });
  it("ningún ruleset pide aprobación humana ni revisión de dueño de código (#608)", () => {
    for (const d of deseados()) {
      for (const r of d.rules.filter((x) => x.type === "pull_request")) {
        expect(r.parameters.required_approving_review_count, d.name).toBe(0);
        expect(r.parameters.require_code_owner_review, d.name).toBe(false);
      }
    }
  });
  it("no queda un CODEOWNERS: sin revisión de dueño, solo pediría reseñas a Pablo (#608)", () => {
    for (const ruta of [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]) expect(existsSync(join(RAIZ, ruta)), ruta).toBe(false);
  });
  it("el bypass del administrador no existe en staging ni en la regla de tests de main (saltaría `tests`)", () => {
    for (const r of [pr, staging]) expect(r.bypass_actors.some((x) => x.actor_type === "RepositoryRole")).toBe(false);
  });
});

describe("diferencias", () => {
  it("el staging de hoy cuadra; main no existe; uno con revisión de dueño aplicado de la versión anterior se ve", () => {
    const [prMain, , staging] = deseados();
    expect(diferencias(STAGING_HOY, staging)).toEqual([]);
    expect(diferencias(null, prMain)).toEqual(["no existe"]);
    expect(diferencias(STAGING_CON_DUENO, staging)).toEqual(["regla pull_request: sobra"]);
  });
  it("ignora lo que GitHub añade (ids, fechas, parámetros por defecto)", () => {
    const [, , staging] = deseados();
    const actual = { ...structuredClone(staging), id: 1, created_at: "x", node_id: "y" };
    actual.rules[0].parameters.parametro_nuevo_de_github = ["merge"];
    expect(diferencias(actual, staging)).toEqual([]);
  });
  it("avisa de un bypass que sobra y de un token que no ve los actores", () => {
    const [, , staging] = deseados();
    const demas = structuredClone(staging);
    demas.bypass_actors.push({ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" });
    expect(diferencias(demas, staging).join()).toMatch(/bypass/);
    const sinVer = structuredClone(staging);
    delete sinVer.bypass_actors;
    expect(diferencias(sinVer, staging).join()).toMatch(/sin comprobar/);
  });
  it("la revisión de dueño encendida en main o un ruleset en evaluación se ven", () => {
    const [prMain] = deseados();
    const estricto = structuredClone(prMain);
    estricto.rules.find((r) => r.type === "pull_request").parameters.require_code_owner_review = true;
    estricto.enforcement = "evaluate";
    const d = diferencias(estricto, prMain).join();
    expect(d).toMatch(/require_code_owner_review/);
    expect(d).toMatch(/enforcement/);
  });
});

describe("modo lectura (por defecto)", () => {
  it("lee (con per_page=100), muestra la diferencia y no escribe nada", async () => {
    const gh = github();
    const r = await correr([], gh);
    expect(r.codigo).toBe(1);
    expect(r.texto).toContain(`rulesets ${NOMBRE_MAIN}: difiere`);
    expect(r.texto).toContain(`rulesets ${NOMBRE_MAIN_SOLO}: difiere`);
    expect(r.texto).toContain(`rulesets ${NOMBRE_STAGING}: ok (id 24770007)`);
    expect(escrituras(gh)).toEqual([]);
    expect(gh.llamadas.some((l) => l.url.includes("per_page=100"))).toBe(true);
  });
  it("con todo igual sale 0", async () => {
    const gh = github({ inicial: deseados().map((d, i) => ({ id: i + 1, ...d })) });
    expect((await correr([], gh)).codigo).toBe(0);
  });
  it("avisa de un ruleset ajeno sobre la misma rama y no lo toca", async () => {
    const ajeno = { id: 7, name: "otro", target: "branch", enforcement: "active", conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } }, rules: [], bypass_actors: [] };
    const gh = github({ inicial: [STAGING_HOY, ajeno] });
    const r = await correr(["--escribir"], gh);
    expect(r.texto).toContain("«otro» (id 7) también apunta");
    expect(escrituras(gh).some((l) => l.ruta === "/rulesets/7")).toBe(false);
    expect(ajenosEnLaRama([ajeno], deseados()).length).toBe(1);
  });
});

describe("modo --escribir", () => {
  it("con administrador: crea los dos de main, deja staging como está y lo comprueba", async () => {
    const gh = github();
    const r = await correr(["--escribir"], gh);
    expect(r.codigo).toBe(0);
    expect(escrituras(gh).map((l) => `${l.metodo} ${l.ruta}`)).toEqual(["POST /rulesets", "POST /rulesets"]);
    expect(r.texto).toContain("comprobado tras escribir");
    expect(gh.rulesets.get(24770007).bypass_actors).toEqual([{ actor_id: null, actor_type: "DeployKey", bypass_mode: "always" }]);
    const otra = github({ inicial: [...gh.rulesets.values()] });
    expect((await correr(["--escribir"], otra)).codigo).toBe(0);
    expect(escrituras(otra)).toEqual([]);
  });
  it("si staging tenía la revisión de dueño de la versión anterior, la quita por su id (#608)", async () => {
    const gh = github({ inicial: [STAGING_CON_DUENO] });
    expect((await correr(["--escribir"], gh)).codigo).toBe(0);
    expect(escrituras(gh).map((l) => `${l.metodo} ${l.ruta}`)).toContain("PUT /rulesets/24770007");
    expect(gh.rulesets.get(24770007).rules.map((r) => r.type)).toEqual(["required_status_checks"]);
  });
  it("--bypass-admin ya no existe", async () => {
    const gh = github();
    expect((await correr(["--escribir", "--bypass-admin"], gh)).codigo).toBe(2);
    expect(gh.llamadas).toEqual([]);
  });
  it("falla cerrado sin permiso de administrador: ni una escritura", async () => {
    const gh = github({ admin: false });
    const r = await correr(["--escribir"], gh);
    expect(r.codigo).toBe(2);
    expect(r.texto).toMatch(/no es de administrador/);
    expect(escrituras(gh)).toEqual([]);
  });
  it("si falla un PUT, sale 2, no enseña el token y muestra el estado tras lo ya escrito", async () => {
    const gh = github({ inicial: [STAGING_CON_DUENO], fallaEn: "PUT /rulesets/24770007" });
    const r = await correr(["--escribir"], gh);
    expect(r.codigo).toBe(2);
    expect(r.texto).toContain("500");
    expect(r.texto).not.toContain(TOKEN);
    expect(r.texto).toMatch(/se escribieron 2 de 3 y el siguiente falló/);
    expect(r.texto).toContain(`rulesets ${NOMBRE_MAIN}: ok`);
  });
  it("un 422 enseña errors[] sin secretos", async () => {
    const gh = github({ fallaEn: "POST /rulesets", fallaCuerpo: { message: "Validation Failed", errors: [`Invalid rule 'update' con ${TOKEN}`] } });
    const r = await correr(["--escribir"], gh);
    expect(r.codigo).toBe(2);
    expect(r.texto).toContain("Invalid rule 'update'");
    expect(r.texto).not.toContain(TOKEN);
  });
  it("falla si, tras escribir, GitHub no lo deja como se pidió", async () => {
    const gh = github({ inicial: [STAGING_CON_DUENO] });
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

// ── mercadona-sync: lo que sale con la deploy key ────────────────────────
describe("mercadona-sync.yml limita lo que empuja la deploy key (#330)", () => {
  const wf = readFileSync(join(RAIZ, ".github/workflows/mercadona-sync.yml"), "utf8");
  it("instala sin scripts", () => {
    expect(wf).toMatch(/run: npm ci --ignore-scripts/);
    expect(wf).not.toMatch(/run: npm ci\s*$/m);
  });
  it("antes de escribir la key comprueba commits y ficheros contra origin/staging", () => {
    const control = wf.indexOf("origin/staging..HEAD");
    const clave = wf.indexOf('printf \'%s\\n\' "$DEPLOY_KEY"');
    const pushToken = wf.indexOf("          git push\n");
    expect(control).toBeGreaterThan(0);
    expect(control).toBeLessThan(clave);
    expect(control).toBeLessThan(pushToken);
    expect(wf).toMatch(/rev-list --count origin\/staging\.\.HEAD\)" -gt 1/);
    expect(wf).toContain("git diff --name-only origin/staging..HEAD");
    expect(wf).toContain("public/store/mercadona.json");
    expect(wf).toContain("src/data/derived/recipeCoste.json");
    expect(wf).toMatch(/exit 1/);
  });
  it("solo esos dos ficheros se añaden al commit", () => {
    expect(wf).toContain("git add public/store/mercadona.json src/data/derived/recipeCoste.json");
  });
});
