import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { contextoReal } from "./guardia.mjs";
import { avisoRamaPrincipal, avisoTrasAdelantar, planAdelantar, resumenReflog } from "./principal.mjs";
import { esSesionDeNube } from "./nube.mjs";

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
  });
  it("en la nube el arranque no avisa de la rama; en el PC sí", () => {
    const c = { esWorktree: false, rama: RAMA, reflog: null };
    expect(avisoRamaPrincipal({ ...c, nube: true })).toBe(null);
    expect(avisoRamaPrincipal({ ...c, nube: false })).toMatch(/no en staging/);
    expect(avisoRamaPrincipal(c)).toMatch(/no en staging/);
  });

  describe("la guardia, con un repo de verdad", () => {
    const guardado = process.env.CLAUDE_CODE_REMOTE;
    afterEach(() => {
      if (guardado === undefined) delete process.env.CLAUDE_CODE_REMOTE;
      else process.env.CLAUDE_CODE_REMOTE = guardado;
    });
    const repo = (rama) => {
      const dir = mkdtempSync(join(tmpdir(), "principal-nube-"));
      const g = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });
      g("init", "-q", "-b", rama);
      g("-c", "user.email=a@b.c", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x");
      return dir;
    };
    it("la carpeta principal en ccr-… con la variable: es de tarea; sin ella o en otra rama, sigue bloqueada", () => {
      const ccr = repo(RAMA);
      process.env.CLAUDE_CODE_REMOTE = "true";
      expect(contextoReal(ccr).esPrincipal(ccr)).toBe(false);
      expect(contextoReal(ccr).rutaEnPrincipal(join(ccr, "a.txt"))).toBe(false);
      process.env.CLAUDE_CODE_REMOTE = "false";
      expect(contextoReal(ccr).esPrincipal(ccr)).toBe(true);
      delete process.env.CLAUDE_CODE_REMOTE;
      expect(contextoReal(ccr).esPrincipal(ccr)).toBe(true);
      const otra = repo("staging");
      process.env.CLAUDE_CODE_REMOTE = "true";
      expect(contextoReal(otra).esPrincipal(otra)).toBe(true);
    });
  });
});
