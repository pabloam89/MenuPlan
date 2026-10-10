import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { elegir, leerWorktrees, motivosParaNo, sinMarcaInicial } from "./retirar.mjs";
import { commitInicial, leerRama } from "./tarea.mjs";

describe("tarea: el nombre de la rama", () => {
  it.each(["datos/descartes", "ops/oficio", "fix/iconos-alergenos"])("acepta %s", (r) => expect(leerRama(r).rama).toBe(r));
  it("saca el nombre de la carpeta", () => expect(leerRama("datos/descartes").nombre).toBe("descartes"));
  it("con issue, el número va delante del nombre y la carpeta no cambia (#206)", () =>
    expect(leerRama("ops/dependabot", "193")).toEqual({ rama: "ops/193-dependabot", nombre: "dependabot", issue: 193 }));
  it("acepta #193 y no lo duplica si ya venía", () => {
    expect(leerRama("ops/dependabot", "#193").rama).toBe("ops/193-dependabot");
    expect(leerRama("ops/193-dependabot", "193").rama).toBe("ops/193-dependabot");
  });
  it("un issue que no es número, error", () => expect(leerRama("ops/x", "abc").error).toBeTruthy());
  it.each(["descartes", "Datos/Descartes", "datos/con espacio", "cosas/x", "datos/", "staging", "../fuera"])("rechaza %s", (r) =>
    expect(leerRama(r).error).toBeTruthy());
});

describe("tarea: el commit inicial protege la carpeta", () => {
  // El hook de usuario `limpiar-worktrees` borra las carpetas cuya rama es
  // ancestro de staging (8 oct 2026: se llevó dos recién creadas, la segunda
  // mientras `npm ci` seguía instalando). Aquí se reproduce ese criterio.
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const esAncestro = (cwd, rama, destino) => {
    try {
      git(cwd, "merge-base", "--is-ancestor", rama, destino);
      return true;
    } catch {
      return false;
    }
  };
  const repo = () => {
    const dir = mkdtempSync(join(tmpdir(), "tarea-test-"));
    git(dir, "init", "-q", "-b", "staging");
    git(dir, "config", "user.email", "t@t.t");
    git(dir, "config", "user.name", "t");
    writeFileSync(join(dir, "a.txt"), "a");
    git(dir, "add", "a.txt");
    git(dir, "commit", "-q", "-m", "base");
    git(dir, "checkout", "-q", "-b", "ops/prueba");
    return dir;
  };

  it("sin el commit, una rama recién creada es ancestro de staging (lo que el hook da por fusionado)", () => {
    const dir = repo();
    try {
      expect(esAncestro(dir, "ops/prueba", "staging")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("con el commit inicial deja de serlo", () => {
    const dir = repo();
    try {
      commitInicial(dir, "ops/prueba");
      expect(esAncestro(dir, "ops/prueba", "staging")).toBe(false);
      expect(git(dir, "log", "-1", "--format=%s")).toBe("tarea: arranca ops/prueba");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no cambia ningún fichero: el commit es vacío", () => {
    const dir = repo();
    try {
      commitInicial(dir, "ops/prueba");
      expect(git(dir, "diff", "--stat", "staging", "HEAD")).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("retirar: el commit inicial no cuenta como trabajo sin subir", () => {
  it("lo quita de la lista", () => expect(sinMarcaInicial(["abc1234 tarea: arranca ops/x"])).toEqual([]));
  it("deja los commits de verdad", () =>
    expect(sinMarcaInicial(["abc1234 tarea: arranca ops/x", "def5678 fix: algo"])).toEqual(["def5678 fix: algo"]));
  it("no se deja engañar por un asunto parecido", () =>
    expect(sinMarcaInicial(["abc1234 fix: tarea: arranca algo"])).toEqual(["abc1234 fix: tarea: arranca algo"]));
});

describe("retirar", () => {
  const porcelana = [
    "worktree C:/dev/MenuPlan\nHEAD 1\nbranch refs/heads/staging",
    "worktree C:/dev/MenuPlan-descartes\nHEAD 2\nbranch refs/heads/datos/descartes",
    "worktree C:/dev/MenuPlan-suelto\nHEAD 3\ndetached",
  ].join("\n\n");
  const wts = leerWorktrees(porcelana);

  it("lee los worktrees", () =>
    expect(wts).toEqual([
      { ruta: "C:/dev/MenuPlan", rama: "staging" },
      { ruta: "C:/dev/MenuPlan-descartes", rama: "datos/descartes" },
      { ruta: "C:/dev/MenuPlan-suelto", rama: null },
    ]));

  it.each(["descartes", "MenuPlan-descartes", "datos/descartes"])("encuentra «%s»", (t) => expect(elegir(wts, t)).toHaveLength(1));

  const base = { principal: "C:/dev/MenuPlan", ruta: "C:/dev/MenuPlan-descartes", sucios: [], sesiones: [], sinSubir: [] };
  it("limpio y subido: se puede", () => expect(motivosParaNo(base)).toEqual([]));
  it("la carpeta principal, nunca", () => expect(motivosParaNo({ ...base, ruta: "c:\\dev\\menuplan" })).toHaveLength(1));
  it("con cambios sin commitear, no", () => expect(motivosParaNo({ ...base, sucios: [" M src/App.jsx"] })[0]).toMatch(/sin commitear/));
  it("con commits sin subir, no", () => expect(motivosParaNo({ ...base, sinSubir: ["abc fix"] })[0]).toMatch(/no están en GitHub/));
  it("con una sesión activa dentro, no", () => expect(motivosParaNo({ ...base, sesiones: [{ id: "x" }] })[0]).toMatch(/sesión/));
});
