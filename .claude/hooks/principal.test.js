import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { contextoReal } from "./guardia.mjs";
import { avisoRamaPrincipal, avisoTrasAdelantar, estadoDelArbol, planAdelantar, resumenReflog } from "./principal.mjs";
import { esSesionDeNube, nubePosible } from "./nube.mjs";

describe("la carpeta principal se adelanta al arrancar (#192)", () => {
  const base = { esWorktree: false, rama: "staging", detras: "3", sucio: "" };
  it("principal en staging, limpia y atrasada: se adelanta", () => expect(planAdelantar(base)).toEqual({ adelantar: true, aviso: null }));
  it.each([
    ["un worktree", { esWorktree: true }],
    ["otra rama", { rama: "ops/x" }],
    ["al día", { detras: "0" }],
    ["sin saber el atraso", { detras: null }],
  ])("%s: ni se toca ni se avisa", (_, cambio) => expect(planAdelantar({ ...base, ...cambio })).toEqual({ adelantar: false, aviso: null }));
  it("con cambios sin guardar: no se toca y se avisa", () => {
    const r = planAdelantar({ ...base, sucio: " M src/App.jsx" });
    expect(r.adelantar).toBe(false);
    expect(r.aviso).toMatch(/cambios sin guardar/);
  });
  it("sin poder leer el estado: no se toca y se avisa", () => expect(planAdelantar({ ...base, sucio: null }).adelantar).toBe(false));

  it("dice si cambian los hooks y si hace falta abrir sesión nueva", () => {
    expect(avisoTrasAdelantar("2", ["src/App.jsx"])).toBe("Carpeta principal adelantada 2 commits hasta origin/staging.");
    expect(avisoTrasAdelantar("2", [".claude/hooks/guardia.mjs"])).toMatch(/guardia\.mjs: los hooks ya corren con la versión nueva\.$/);
    expect(avisoTrasAdelantar("2", [".claude/settings.json"])).toMatch(/próxima sesión/);
    expect(avisoTrasAdelantar("2", [".claude/hooks/guardia.test.js"])).toBe("Carpeta principal adelantada 2 commits hasta origin/staging.");
  });
});

// #675: el índice con entradas preparadas contaba como «sucio» y la principal no se adelantaba nunca.
describe("el índice sucio de la principal se deshace antes de adelantar (#675)", () => {
  const base = { esWorktree: false, rama: "staging", detras: "3" };
  it("limpio: se adelanta sin reset", () =>
    expect(planAdelantar({ ...base, sucio: "", sinPreparar: "" })).toEqual({ adelantar: true, aviso: null }));
  it("solo índice: reset y se adelanta", () => {
    const r = planAdelantar({ ...base, sucio: "A  scripts/tripo.mjs", sinPreparar: "" });
    expect(r).toEqual({ adelantar: true, reset: true, aviso: null });
  });
  it("solo sin preparar en seguidos: no se toca y se avisa", () => {
    const r = planAdelantar({ ...base, sucio: " M src/App.jsx", sinPreparar: "src/App.jsx" });
    expect(r.adelantar).toBe(false);
    expect(r.reset).toBeUndefined();
    expect(r.aviso).toMatch(/cambios sin guardar/);
  });
  it("índice más sin preparar: no hace reset y avisa", () => {
    const r = planAdelantar({ ...base, sucio: "A  a.mjs\nAM b.mjs", sinPreparar: "b.mjs" });
    expect(r.adelantar).toBe(false);
    expect(r.reset).toBeUndefined();
    expect(r.aviso).toMatch(/cambios sin guardar/);
  });
  it("sin poder leer lo sin preparar, no hace reset", () =>
    expect(planAdelantar({ ...base, sucio: "A  a.mjs", sinPreparar: null }).adelantar).toBe(false));

  describe("con un repositorio de verdad", () => {
    const git = (dir, ...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const repo = (preparar) => {
      const dir = mkdtempSync(join(tmpdir(), "principal-indice-"));
      git(dir, "init", "-q");
      git(dir, "config", "user.email", "t@t");
      git(dir, "config", "user.name", "t");
      writeFileSync(join(dir, "seguido.txt"), "uno\n");
      git(dir, "add", "seguido.txt");
      git(dir, "commit", "-q", "-m", "base");
      preparar(dir);
      return dir;
    };
    const plan = (dir) => planAdelantar({ ...base, ...estadoDelArbol((...a) => git(dir, ...a)) });
    const con = (preparar, fn) => {
      const dir = repo(preparar);
      try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
    };

    it("limpio", () => con(() => {}, (d) => expect(plan(d).adelantar).toBe(true)));
    it("solo un fichero nuevo sin seguir: se adelanta sin reset", () =>
      con((d) => writeFileSync(join(d, "nuevo.txt"), "x\n"), (d) => expect(plan(d)).toEqual({ adelantar: true, aviso: null })));
    it("solo índice: reset y el contenido del fichero queda igual", () =>
      con((d) => { writeFileSync(join(d, "memoria.md"), "dato\n"); git(d, "add", "memoria.md"); }, (d) => {
        expect(plan(d).reset).toBe(true);
        git(d, "reset", "-q");
        expect(git(d, "status", "--porcelain", "--untracked-files=no")).toBe("");
        expect(git(d, "status", "--porcelain")).toBe("?? memoria.md");
      }));
    it("solo sin preparar en seguidos: avisa", () =>
      con((d) => writeFileSync(join(d, "seguido.txt"), "dos\n"), (d) => {
        const p = plan(d);
        expect(p.adelantar).toBe(false);
        expect(p.aviso).toMatch(/cambios sin guardar/);
      }));
    it("índice más sin preparar: no hace reset", () =>
      con((d) => { writeFileSync(join(d, "memoria.md"), "dato\n"); git(d, "add", "memoria.md"); writeFileSync(join(d, "seguido.txt"), "dos\n"); }, (d) => {
        const p = plan(d);
        expect(p.adelantar).toBe(false);
        expect(p.reset).toBeUndefined();
      }));
  });
});

describe("la carpeta principal fuera de staging avisa al arrancar (#348, #384)", () => {
  const reflog = "checkout: moving from staging to ccr-0df6959e-29yha0|2 hours ago\ncommit: algo|3 hours ago\ncheckout: moving from main to staging|1 day ago";
  it("resume los cambios de rama y deja fuera lo que no lo es", () => {
    expect(resumenReflog(reflog)).toEqual(["staging → ccr-0df6959e-29yha0 (2 hours ago)", "main → staging (1 day ago)"]);
    expect(resumenReflog(null)).toEqual([]);
  });
  it("en la principal fuera de staging avisa, con el reflog y el camino a buscar", () => {
    const a = avisoRamaPrincipal({ esWorktree: false, rama: "ccr-0df6959e-29yha0", reflog });
    expect(a).toMatch(/ccr-0df6959e-29yha0, no en staging/);
    expect(a).toMatch(/staging → ccr-0df6959e/);
    expect(a).toMatch(/npm run buscar/);
  });
  it.each([
    ["un worktree", { esWorktree: true, rama: "ops/x" }],
    ["staging", { esWorktree: false, rama: "staging" }],
    ["sin saber la rama", { esWorktree: false, rama: null }],
  ])("en %s, nada", (_, c) => expect(avisoRamaPrincipal({ ...c, reflog })).toBe(null));
});

describe("la sesión de la nube no es la carpeta principal de Pablo (#635, fondo #622)", () => {
  const NUBE = { CLAUDE_CODE_REMOTE: "true" };
  const RAMA = "ccr-3565adf4-ao1355";
  const RUTA = "/home/user/MenuPlan";
  const nube = (env = NUBE, rama = RAMA, ruta = RUTA, plataforma = "linux") => esSesionDeNube(env, rama, ruta, plataforma);

  it("nube, rama ccr-… y ruta de Linux: sí", () => expect(nube()).toBe(true));
  it.each([
    ["nube sin ccr- en la rama", NUBE, "staging"],
    ["nube con una rama de tarea", NUBE, "ops/635-guardia-nube"],
    ["ccr- sin la variable", {}, RAMA],
    ["variable en false", { CLAUDE_CODE_REMOTE: "false" }, RAMA],
    ["variable vacía", { CLAUDE_CODE_REMOTE: "" }, RAMA],
    ["variable con otro valor (1)", { CLAUDE_CODE_REMOTE: "1" }, RAMA],
    ["variable con mayúsculas", { CLAUDE_CODE_REMOTE: "True" }, RAMA],
    ["sin entorno", null, RAMA],
    ["entorno que no es un objeto", "true", RAMA],
    ["sin rama legible", NUBE, null],
    ["rama con nombre raro", NUBE, "ccr-x y;rm"],
    ["rama sin guion tras ccr", NUBE, "ccrx"],
  ])("%s: no", (_, env, rama) => expect(nube(env, rama)).toBe(false));

  it("la ruta de Windows con la variable y la rama puestas: no abre la principal real", () => {
    expect(nube(NUBE, RAMA, "C:\\dev\\MenuPlan")).toBe(false);
    expect(nube(NUBE, RAMA, "C:/dev/MenuPlan")).toBe(false);
    expect(nube(NUBE, RAMA, RUTA, "win32")).toBe(false);
  });
  it("un entorno ilegible (lanza al leerse) falla cerrado", () => {
    const hostil = new Proxy({}, { get() { throw new Error("ilegible"); } });
    expect(nube(hostil)).toBe(false);
    expect(nubePosible(hostil, "linux")).toBe(false);
  });
  it("en la nube el arranque no avisa de la rama; en el PC sí", () => {
    const c = { esWorktree: false, rama: RAMA, reflog: null };
    expect(avisoRamaPrincipal({ ...c, nube: true })).toBe(null);
    expect(avisoRamaPrincipal({ ...c, nube: false })).toMatch(/no en staging/);
    expect(avisoRamaPrincipal(c)).toMatch(/no en staging/);
  });

  describe("la guardia, con git inyectado (corre igual en Windows)", () => {
    const COMUN = "/repo/.git";
    const fake = (rama, llamadas = [], { falla = false } = {}) => (args) => {
      llamadas.push(args.join(" "));
      if (args.includes("--abbrev-ref")) {
        if (falla) throw new Error("git expiró");
        return rama;
      }
      return args.includes("--git-dir") ? `${COMUN}\n${COMUN}` : COMUN;
    };
    const principal = (rama, env, plataforma, extra = {}, llamadas = []) => {
      const c = contextoReal("/repo", {}, { env, plataforma, gitDado: fake(rama, llamadas, extra) });
      return [c.esPrincipal("/repo"), llamadas];
    };
    it("la principal en ccr-… con la variable en Linux es de tarea", () => expect(principal(RAMA, NUBE, "linux")[0]).toBe(false));
    it("rutaEnPrincipal sigue a esPrincipal", () => {
      const c = contextoReal("/repo", {}, { env: NUBE, plataforma: "linux", gitDado: fake(RAMA) });
      expect(c.rutaEnPrincipal("/repo/a.txt")).toBe(false);
    });
    it.each([
      ["sin variable", RAMA, {}, "linux"],
      ["variable en false", RAMA, { CLAUDE_CODE_REMOTE: "false" }, "linux"],
      ["rama que no es ccr-", "staging", NUBE, "linux"],
      ["Windows con la variable y ccr-", RAMA, NUBE, "win32"],
    ])("%s: sigue bloqueada", (_, rama, env, plataforma) => expect(principal(rama, env, plataforma)[0]).toBe(true));
    it("un git que falla o expira al pedir la rama: sigue siendo la principal (cerrado)", () => {
      expect(principal(RAMA, NUBE, "linux", { falla: true })[0]).toBe(true);
    });
    it("sin variable o en Windows no se lanza el git de la rama", () => {
      for (const [env, plat] of [[{}, "linux"], [NUBE, "win32"], [{ CLAUDE_CODE_REMOTE: "false" }, "linux"]]) {
        const [, llamadas] = principal(RAMA, env, plat);
        expect(llamadas.some((l) => l.includes("--abbrev-ref"))).toBe(false);
      }
      expect(principal(RAMA, NUBE, "linux")[1].some((l) => l.includes("--abbrev-ref"))).toBe(true);
    });
  });
});
