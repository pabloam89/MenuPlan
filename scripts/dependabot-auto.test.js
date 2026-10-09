// La fusión sola de Dependabot (#193): qué PR entra y cuál no, y que el
// workflow no abra la puerta al código del PR.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { clasificar, commitsDeDependabot, decidir, DECISIONES, linea, motivoFicheros, MOTIVOS, saltoDe } from "./dependabot-auto.mjs";

const REPO = "pabloam89/MenuPlan";
const SHA = "a".repeat(40);

const commitBot = (msg = "") => ({
  author: { login: "dependabot[bot]" },
  committer: { login: "web-flow" },
  commit: { message: msg, verification: { verified: true, reason: "valid" } },
});
const verde = { id: 2, name: "tests", app: { slug: "github-actions" }, head_sha: SHA, status: "completed", conclusion: "success" };

function datos(extra = {}) {
  const { pr = {}, ...resto } = extra;
  return {
    repo: REPO,
    pr: {
      number: 170,
      title: "chore(deps): bump postcss from 8.5.15 to 8.5.29 in /dish-gallery",
      body: "",
      user: { login: "dependabot[bot]", type: "Bot" },
      base: { ref: "staging" },
      head: { sha: SHA, repo: { full_name: REPO } },
      mergeable: true,
      ...pr,
    },
    commits: [commitBot()],
    ficheros: ["dish-gallery/package-lock.json"],
    checks: [verde],
    staging: { atrasado: false, ficheros: [], truncado: false },
    evento: null,
    rebasePedido: false,
    ...resto,
  };
}

describe("dependabot-auto: tamaño del salto", () => {
  it("parche y menor, sí; mayor, no", () => {
    expect(saltoDe("8.5.15", "8.5.29")).toBe("menor");
    expect(saltoDe("2.9.0", "2.27.0")).toBe("menor");
    expect(saltoDe("9.39.4", "10.0.1")).toBe("mayor");
  });
  it("en 0.x, cambiar la menor es mayor", () => {
    expect(saltoDe("0.5.2", "0.5.7")).toBe("menor");
    expect(saltoDe("0.129.0", "0.131.0")).toBe("mayor");
  });
  it("prerelease o SHA: no se sabe", () => {
    expect(saltoDe("1.0.0", "1.1.0-beta.1")).toBe("desconocida");
    expect(saltoDe("3d3c42e", "1234abc")).toBe("desconocida");
  });
});

describe("dependabot-auto: clasificar un PR", () => {
  it("título «from A to B»", () => expect(clasificar({ titulo: "bump postcss from 8.5.15 to 8.5.29" }).tipo).toBe("menor"));
  it("sin versión en el título, la saca del cuerpo", () =>
    expect(clasificar({ titulo: "bump @vitest/mocker and vitest", textos: ["Updates `vitest` from 4.1.7 to 4.1.11\n"] }).tipo).toBe("menor"));
  it("un grupo con un solo salto mayor en la tabla es mayor", () => {
    const tabla = "| [eslint](x) | `9.39.4` | `10.12.0` |\n| [pg](x) | `8.23.0` | `8.23.1` |";
    expect(clasificar({ titulo: "bump the npm-semanal group with 27 updates", textos: [tabla] }).tipo).toBe("mayor");
  });
  it("el grupo -menores cuenta como menor, salvo que una versión 0.x lo desmienta", () => {
    expect(clasificar({ titulo: "bump the npm-menores group across 1 directory with 5 updates" }).tipo).toBe("menor");
    expect(clasificar({ titulo: "bump the npm-menores group", textos: ["Updates `x` from 0.3.1 to 0.4.0"] }).tipo).toBe("mayor");
  });
  it("el grupo -mayores es mayor siempre", () => expect(clasificar({ titulo: "bump the npm-mayores group with 2 updates" }).tipo).toBe("mayor"));
  it("sin versiones ni grupo, no se sabe", () => expect(clasificar({ titulo: "bump baseline-browser-mapping in /dish-gallery" }).tipo).toBe("desconocida"));
  it("el punto final de una frase no corta la versión", () =>
    expect(clasificar({ titulo: "x", textos: ["Bumps [a](u) from 1.2.1 to 2.0.0."] }).tipo).toBe("mayor"));
});

describe("dependabot-auto: quién y qué", () => {
  it("commits de Dependabot firmados por GitHub, sí", () => expect(commitsDeDependabot([commitBot()])).toBe(true));
  it("un commit de otra persona, aunque se haga pasar por el bot en el correo, no", () => {
    const falso = { ...commitBot(), committer: { login: "pabloam89" }, commit: { verification: { verified: false, reason: "unsigned" } } };
    expect(commitsDeDependabot([commitBot(), falso])).toBe(false);
    expect(commitsDeDependabot([{ ...commitBot(), author: { login: "pabloam89" } }])).toBe(false);
  });
  it("firmado y con el correo del bot, pero empujado por otra persona: no", () =>
    expect(commitsDeDependabot([{ ...commitBot(), committer: { login: "pabloam89" } }])).toBe(false));
  it("del bot y por web-flow, pero sin firma válida: no", () =>
    expect(commitsDeDependabot([{ ...commitBot(), commit: { verification: { verified: true, reason: "unknown_key" } } }])).toBe(false));
  it("solo package.json y package-lock.json", () => {
    expect(motivoFicheros(["package.json", "package-lock.json"])).toBe(null);
    expect(motivoFicheros([".github/workflows/tests.yml"])).toBe("toca-workflows");
    expect(motivoFicheros(["package-lock.json", "scripts/x.mjs"])).toBe("ficheros-fuera");
    expect(motivoFicheros([])).toBe("ficheros-fuera");
  });
});

describe("dependabot-auto: decidir", () => {
  const motivo = (d) => decidir(datos(d)).motivo;
  it("el caso bueno se fusiona", () => expect(decidir(datos())).toMatchObject({ decision: "fusionado", motivo: "-", tipo: "menor" }));
  it("abierto por otro: no", () => expect(motivo({ pr: { user: { login: "dependabot[bot]", type: "User" } } })).toBe("autor"));
  it("contra main: no", () => expect(motivo({ pr: { base: { ref: "main" } } })).toBe("base"));
  it("desde un fork: no", () => expect(motivo({ pr: { head: { sha: SHA, repo: { full_name: "otro/MenuPlan" } } } })).toBe("rama-ajena"));
  it("con un commit ajeno: no", () => expect(motivo({ commits: [commitBot(), { ...commitBot(), author: { login: "algbarc" } }] })).toBe("commits-ajenos"));
  it("mayor: se queda", () => expect(motivo({ pr: { title: "bump vite from 5.4.21 to 8.3.4 in /dish-gallery" } })).toBe("mayor"));
  it("tests en rojo, o en verde pero de otro SHA: no", () => {
    expect(motivo({ checks: [{ ...verde, conclusion: "failure" }] })).toBe("tests-no-verde");
    expect(motivo({ checks: [{ ...verde, head_sha: "b".repeat(40) }] })).toBe("tests-no-verde");
    expect(motivo({ checks: [verde, { ...verde, id: 3, conclusion: "failure" }] })).toBe("tests-no-verde");
    expect(motivo({ checks: [] })).toBe("tests-no-verde");
  });
  it("el run que lo lanzó es de un SHA viejo: no", () => expect(motivo({ evento: { headSha: "b".repeat(40), prs: [170] } })).toBe("tests-otro-sha"));
  it("con conflicto, o sin calcular: no", () => {
    expect(motivo({ pr: { mergeable: false } })).toBe("conflicto");
    expect(motivo({ pr: { mergeable: null } })).toBe("mergeable-desconocido");
  });
  it("atrasado sin pisar sus ficheros: se fusiona", () =>
    expect(decidir(datos({ staging: { atrasado: true, ficheros: ["src/a.js"], truncado: false } })).decision).toBe("fusionado"));
  it("atrasado y staging tocó sus ficheros: pide rebase, una vez", () => {
    const staging = { atrasado: true, ficheros: ["dish-gallery/package-lock.json"], truncado: false };
    expect(decidir(datos({ staging })).decision).toBe("rebase");
    expect(decidir(datos({ staging, rebasePedido: true })).motivo).toBe("rebase-ya-pedido");
    expect(decidir(datos({ staging: { atrasado: true, ficheros: [], truncado: true } })).decision).toBe("rebase");
  });
  it("cada línea usa el vocabulario cerrado", () => {
    const l = linea({ pr: 170, ...decidir(datos()) });
    expect(l).toBe("dependabot-auto pr: 170 decision: fusionado motivo: - tipo: menor");
    const fuente = readFileSync(new URL("./dependabot-auto.mjs", import.meta.url), "utf8");
    for (const m of fuente.matchAll(/espera\("([\w-]+)"/g)) expect(MOTIVOS).toContain(m[1]);
    for (const m of fuente.matchAll(/decision: "([\w-]+)"/g)) expect(DECISIONES).toContain(m[1]);
  });
});

describe("dependabot-auto.yml: no abre la puerta al PR", () => {
  const yml = readFileSync(new URL("../.github/workflows/dependabot-auto.yml", import.meta.url), "utf8");
  const sinComentarios = yml.replace(/\s#.*$/gm, "");

  it("solo workflow_run de Tests y a mano; nunca pull_request_target", () => {
    expect(sinComentarios).not.toMatch(/pull_request_target/);
    expect(sinComentarios).toMatch(/workflow_run:\s*\n\s*workflows: \[Tests\]/);
  });
  it("cada acción fijada por SHA", () => {
    const usos = [...sinComentarios.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(usos.length).toBeGreaterThan(0);
    for (const u of usos) expect(u).toMatch(/@[0-9a-f]{40}$/);
  });
  it("el único checkout es de la rama por defecto, sin credenciales y solo del script", () => {
    expect(sinComentarios.match(/actions\/checkout@/g)).toHaveLength(1);
    expect(sinComentarios).toMatch(/ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
    expect(sinComentarios).toMatch(/persist-credentials: false/);
    expect(sinComentarios).toMatch(/sparse-checkout: scripts\/dependabot-auto\.mjs\n/);
    expect(sinComentarios).not.toMatch(/head_sha|head_branch\s*\}\}|pull_request\.head|refs\/pull/);
  });
  it("permisos: ninguno arriba y en el job solo los tres que hacen falta", () => {
    expect(sinComentarios).toMatch(/^permissions: \{\}$/m);
    const job = /^ {4}permissions:\n((?: {6}\S.*\n)+)/m.exec(sinComentarios)?.[1] ?? "";
    const permisos = job.trim().split("\n").map((l) => l.trim()).sort();
    expect(permisos).toEqual(["checks: read", "contents: write", "pull-requests: write"]);
  });
  it("no usa secretos: solo el token del workflow", () => expect(sinComentarios).not.toMatch(/secrets\./));
});

describe("dependabot.yml: lo pequeño y lo grande, por separado", () => {
  const yml = readFileSync(new URL("../.github/dependabot.yml", import.meta.url), "utf8");
  it("cada ecosistema con su grupo -menores (minor y patch) y -mayores (major)", () => {
    for (const eco of ["npm", "actions"]) {
      expect(yml).toMatch(new RegExp(`${eco}-menores:\\n(?: {8}.*\\n)*? {8}update-types: \\[minor, patch\\]`));
      expect(yml).toMatch(new RegExp(`${eco}-mayores:\\n(?: {8}.*\\n)*? {8}update-types: \\[major\\]`));
    }
  });
  it("todo contra staging", () => {
    const ramas = [...yml.matchAll(/target-branch: (\S+)/g)].map((m) => m[1]);
    expect(ramas).toEqual(["staging", "staging"]);
  });
});
