import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import {
  avisosDeLimpieza,
  ficheroPendientes,
  fusionarPendientes,
  guardarPendientes,
  leerPendientes,
  porTerminar,
  problemaDelBorrado,
  salidaDeProblemas,
  terminada,
  terminarCarpeta,
  tieneGitPropio,
  worktreesVivos,
} from "./limpiar-worktrees.mjs";

// #141: tras un merge, la limpieza quitó C:\dev\MenuPlan-estado-0088 de
// `git worktree list` pero la carpeta siguió en disco, y como al arrancar va
// en silencio, nadie se enteró.
describe("limpiar-worktrees: lo que no pudo borrar se dice (#141)", () => {
  const dir = "C:\\dev\\MenuPlan-estado-0088";
  const rama = "datos/estado-0088";

  it("git la quita de su lista pero la carpeta sigue: es un problema", () => {
    const p = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    expect(p).toMatchObject({ dir, rama });
    expect(p.motivo).toMatch(/sigue en disco/);
  });
  it("el remove falla y la carpeta sigue: es un problema", () =>
    expect(problemaDelBorrado({ dir, rama, quitado: false, sigue: true }).motivo).toMatch(/falló/));
  it("la carpeta ya no está: no hay problema", () =>
    expect(problemaDelBorrado({ dir, rama, quitado: true, sigue: false })).toBeNull());

  it("lo imprime siempre (no hay modo silencio para esto)", () => {
    const p = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    expect(salidaDeProblemas([p])).toContain(dir);
    expect(salidaDeProblemas([])).toBe("");
  });
  it("tras un merge (PostToolUse) va como contexto adicional, que es lo que llega a la sesión", () => {
    const p = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    const salida = JSON.parse(salidaDeProblemas([p], { hook: true }));
    expect(salida.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(salida.hookSpecificOutput.additionalContext).toContain(dir);
  });

  it("lo pendiente se guarda mientras la carpeta siga en disco, y sin repetir", () => {
    const viejo = { dir: "C:\\dev\\MenuPlan-vieja", rama: "ops/vieja", motivo: "x" };
    const ya = { dir: "C:\\dev\\MenuPlan-borrada", rama: "ops/borrada", motivo: "x" };
    const nuevo = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    const repetido = { ...nuevo, dir: dir.toUpperCase(), motivo: "antes" };
    const existe = (d) => d !== ya.dir;
    const r = fusionarPendientes([viejo, ya, repetido], [nuevo], existe);
    expect(r.map((p) => p.dir).sort()).toEqual([dir, viejo.dir].sort());
    expect(r.find((p) => p.dir === dir).motivo).toBe(nuevo.motivo);
  });

  it("el arranque lo enseña con un AVISO por carpeta que siga en disco", () => {
    const p = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    expect(avisosDeLimpieza([p], () => true)).toEqual([expect.stringMatching(/^AVISO: .*MenuPlan-estado-0088/)]);
    expect(avisosDeLimpieza([p], () => false)).toEqual([]);
  });

  // Revisor del PR #186: si la ruta se reutiliza, el aviso mandaba borrar un
  // worktree vivo. Secuencia: la limpieza falla y lo apunta; Pablo borra la
  // carpeta a mano; `npm run tarea` crea otra en la MISMA ruta.
  it("una ruta que vuelve a ser un worktree vivo sale del registro y del aviso", () => {
    const apuntado = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    const existe = () => true; // la carpeta nueva de `tarea` existe
    const vivos = worktreesVivos(`worktree C:/dev/MenuPlan\nHEAD abc\nbranch refs/heads/staging\n\nworktree C:/dev/MenuPlan-estado-0088\nHEAD def\nbranch refs/heads/datos/otra\n`);
    expect(fusionarPendientes([apuntado], [], existe, vivos)).toEqual([]);
    expect(avisosDeLimpieza([apuntado], existe, vivos)).toEqual([]);
    // y una huérfana de verdad sigue saliendo
    expect(avisosDeLimpieza([{ ...apuntado, dir: "C:\\dev\\MenuPlan-huerfana" }], existe, vivos)).toHaveLength(1);
  });

  it("guardar: vuelve a leer justo antes de escribir, conserva lo de otra limpieza y no deja temporales", () => {
    const comun = mkdtempSync(join(tmpdir(), "limpieza-"));
    try {
      const otra = { dir: "C:\\dev\\MenuPlan-otra", rama: "ops/otra", motivo: "m" };
      writeFileSync(ficheroPendientes(comun), JSON.stringify([otra])); // la escribió otra limpieza a la vez
      const nuevo = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
      guardarPendientes(comun, [nuevo], { existe: () => true, vivos: new Set() });
      expect(leerPendientes(comun).map((p) => p.dir).sort()).toEqual([otra.dir, dir].sort());
      expect(readdirSync(comun)).toEqual(["claude-limpieza.json"]);
    } finally {
      rmSync(comun, { recursive: true, force: true });
    }
  });

  it("guardar: un registro corrupto se reescribe y lo dice", () => {
    const comun = mkdtempSync(join(tmpdir(), "limpieza-"));
    try {
      writeFileSync(ficheroPendientes(comun), "{roto");
      const nuevo = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
      const r = guardarPendientes(comun, [nuevo], { existe: () => true, vivos: new Set() });
      expect(r.corrupto).toBeTruthy();
      expect(leerPendientes(comun)).toEqual([nuevo]);
    } finally {
      rmSync(comun, { recursive: true, force: true });
    }
  });

  it("lee el registro de la carpeta común; sin registro, nada; corrupto, lanza (y quien lee avisa)", () => {
    const comun = mkdtempSync(join(tmpdir(), "limpieza-"));
    try {
      expect(leerPendientes(comun)).toEqual([]);
      writeFileSync(ficheroPendientes(comun), JSON.stringify([{ dir, rama, motivo: "m" }]));
      expect(leerPendientes(comun)).toEqual([{ dir, rama, motivo: "m" }]);
      writeFileSync(ficheroPendientes(comun), "{roto");
      expect(() => leerPendientes(comun)).toThrow();
    } finally {
      rmSync(comun, { recursive: true, force: true });
    }
  });
});

const base = { rama: "ops/x", subida: true, contenida: false, remotaBorrada: false, sinSubir: "" };

describe("limpiar-worktrees: qué rama está terminada", () => {
  // El 8 oct 2026 borraba la carpeta recién creada de cualquier sesión: una
  // rama nueva desde staging, sin commits, también está «contenida en staging».
  it("una rama nueva, nunca subida, no se borra aunque esté contenida en staging", () =>
    expect(terminada({ ...base, subida: false, contenida: true })).toBe(false));
  it("subida y fusionada en staging, sí", () => expect(terminada({ ...base, contenida: true })).toBe(true));
  it("subida, con la remota borrada tras el merge y nada sin subir, sí", () =>
    expect(terminada({ ...base, remotaBorrada: true })).toBe(true));
  it("con la remota borrada pero commits sin subir, no", () =>
    expect(terminada({ ...base, remotaBorrada: true, sinSubir: "abc123 wip" })).toBe(false));
  it("subida pero ni fusionada ni con la remota borrada, no", () => expect(terminada(base)).toBe(false));
  it("desconectada (sin rama), no", () => expect(terminada({ ...base, rama: null, contenida: true })).toBe(false));
});

// #725: git quita el worktree de su lista, la carpeta no se borra y, como solo
// se recorren los worktrees que git lista, no volvía a entrar nunca. Estos
// tests ejecutan el borrado de verdad, sobre carpetas temporales.
describe("limpiar-worktrees: terminar el borrado de lo que quedó sin registro (#725)", () => {
  const temporal = () => realpathSync(mkdtempSync(join(tmpdir(), "limpieza-725-")));
  const huerfana = (padre, nombre = "MenuPlan-huerfana") => {
    const d = join(padre, nombre);
    mkdirSync(join(d, "src"), { recursive: true });
    writeFileSync(join(d, "src", "a.js"), "x");
    return d;
  };

  it("una carpeta sin registro, vacía o con ficheros, se borra entera", () => {
    const t = temporal();
    try {
      const vacia = join(t, "MenuPlan-vacia");
      mkdirSync(vacia);
      expect(terminarCarpeta(vacia)).toEqual({ ok: true });
      expect(existsSync(vacia)).toBe(false);
      const llena = huerfana(t);
      expect(terminarCarpeta(llena)).toEqual({ ok: true });
      expect(existsSync(llena)).toBe(false);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  it("con node_modules de verdad (carpeta) se borra con su contenido", () => {
    const t = temporal();
    try {
      const d = huerfana(t);
      mkdirSync(join(d, "node_modules", "pkg"), { recursive: true });
      writeFileSync(join(d, "node_modules", "pkg", "i.js"), "x");
      expect(terminarCarpeta(d).ok).toBe(true);
      expect(existsSync(d)).toBe(false);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  // El 8 oct 2026 borrar a mano a través de la unión vació el node_modules del repo principal.
  it("con node_modules UNIÓN: se suelta la unión y el destino queda intacto", () => {
    const t = temporal();
    try {
      const destino = join(t, "MenuPlan-anfitrion", "node_modules");
      mkdirSync(join(destino, "pkg"), { recursive: true });
      writeFileSync(join(destino, "pkg", "i.js"), "x");
      const d = huerfana(t);
      symlinkSync(destino, join(d, "node_modules"), "junction");
      expect(terminarCarpeta(d).ok).toBe(true);
      expect(existsSync(d)).toBe(false);
      expect(existsSync(join(destino, "pkg", "i.js"))).toBe(true);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  // MenuPlan-panel-lectura es un clon con su propio .git: no es un worktree y no se borra nunca.
  it("una carpeta con .git de carpeta no se toca", () => {
    const t = temporal();
    try {
      const d = huerfana(t, "MenuPlan-panel-lectura");
      mkdirSync(join(d, ".git"));
      writeFileSync(join(d, ".git", "HEAD"), "ref: refs/heads/main");
      expect(tieneGitPropio(d)).toBe(true);
      const r = terminarCarpeta(d);
      expect(r.ok).toBe(false);
      expect(r.motivo).toMatch(/\.git de carpeta/);
      expect(existsSync(join(d, "src", "a.js"))).toBe(true);
      // un worktree de verdad tiene un fichero .git (apunta al repo), no una carpeta
      rmSync(join(d, ".git"), { recursive: true });
      writeFileSync(join(d, ".git"), "gitdir: /x");
      expect(tieneGitPropio(d)).toBe(false);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  // OJO: este y el de «aunque el proceso se lance desde dentro» solo protegen en Windows local, donde una carpeta
  // que es el directorio de trabajo de un proceso no se puede borrar. En Linux/macOS (CI) el borrado sale bien
  // aunque falte el chdir, así que en el CI pasan igual sin él: no son la prueba del arreglo allí.
  it("con el proceso DENTRO de la carpeta: tras moverse a la raíz del repo se borra", () => {
    const t = temporal();
    try {
      const d = huerfana(t);
      const guion = join(t, "borrar.mjs");
      writeFileSync(
        guion,
        `import { terminarCarpeta } from ${JSON.stringify(pathToFileURL(resolve("scripts/limpiar-worktrees.mjs")).href)};\n` +
          `process.chdir(${JSON.stringify(t)});\n` +
          `console.log(JSON.stringify(terminarCarpeta(${JSON.stringify(d)})));\n`,
      );
      // cwd del proceso = la carpeta a borrar, como el hook que hereda la de la sesión
      const salida = execFileSync(process.execPath, [guion], { cwd: d, encoding: "utf8" });
      expect(JSON.parse(salida)).toEqual({ ok: true });
      expect(existsSync(d)).toBe(false);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  it("porTerminar: solo carpetas MenuPlan-… hermanas del repo, existentes y que no son worktrees vivos", () => {
    const raiz = "C:/dev/MenuPlan";
    const p = (dir) => ({ dir, rama: "ops/x", motivo: "m" });
    const lista = [
      p("C:/dev/MenuPlan-huerfana"),
      p("C:/dev/MenuPlan-viva"),
      p("C:/dev/MenuPlan-borrada"),
      p("C:/dev/otra-cosa"),
      p("C:/Users/pablo/OneDrive/MenuPlan-fuera"),
      p("C:/dev/MenuPlan"),
    ];
    const vivos = worktreesVivos("worktree C:/dev/MenuPlan-viva\n");
    const r = porTerminar(lista, { raiz, existe: (d) => !/borrada/.test(d), vivos });
    expect(r.map((x) => x.dir)).toEqual(["C:/dev/MenuPlan-huerfana"]);
  });

  it("el motivo lleva el error real de git", () => {
    const m = problemaDelBorrado({ dir: "C:\\dev\\MenuPlan-x", rama: "ops/x", quitado: false, sigue: true, detalle: "error: failed to delete 'C:/dev/MenuPlan-x': Permission denied\nmás" });
    expect(m.motivo).toMatch(/falló `git worktree remove`: error: failed to delete .*Permission denied/);
    expect(m.motivo).not.toMatch(/más/);
  });

  // De punta a punta: el script entero, en un repo temporal, con la carpeta
  // apuntada en el registro, sin registro de git, con node_modules unión y
  // lanzado desde el repo.
  it("la pasada completa la remata y la saca del registro", () => {
    const t = temporal();
    try {
      const repo = join(t, "MenuPlan");
      mkdirSync(repo);
      const g = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      g("init", "-q", "-b", "staging");
      g("commit", "-q", "--allow-empty", "-m", "ini");
      const d = huerfana(t);
      const anfitrion = join(t, "MenuPlan-anfitrion", "node_modules");
      mkdirSync(anfitrion, { recursive: true });
      writeFileSync(join(anfitrion, "i.js"), "x");
      symlinkSync(anfitrion, join(d, "node_modules"), "junction");
      const clon = huerfana(t, "MenuPlan-panel-lectura");
      mkdirSync(join(clon, ".git"));
      const apunte = (dir) => ({ dir, rama: "ops/x", motivo: "falló `git worktree remove`", cuando: "2026-10-13T05:36:00Z" });
      writeFileSync(ficheroPendientes(join(repo, ".git")), JSON.stringify([apunte(d), apunte(clon)]));

      const script = resolve("scripts/limpiar-worktrees.mjs");
      const salida = execFileSync(process.execPath, [script, "--si", "--silencio"], { cwd: repo, encoding: "utf8" });

      expect(existsSync(d)).toBe(false);
      expect(existsSync(join(anfitrion, "i.js"))).toBe(true);
      expect(existsSync(join(clon, "src", "a.js"))).toBe(true);
      expect(salida).toMatch(/MenuPlan-panel-lectura.*\.git de carpeta/);
      expect(leerPendientes(join(repo, ".git")).map((p) => p.dir)).toEqual([clon]);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  // La carpeta se remata, pero la rama con commits que no están en staging NO se fuerza a borrar (`-D` perdería trabajo).
  it("el remate borra la carpeta pero no fuerza la rama si tiene commits sin fusionar", () => {
    const t = temporal();
    try {
      const repo = join(t, "MenuPlan");
      mkdirSync(repo);
      const g = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      g("init", "-q", "-b", "staging");
      g("commit", "-q", "--allow-empty", "-m", "ini");
      g("checkout", "-q", "-b", "ops/sin-fusionar");
      g("commit", "-q", "--allow-empty", "-m", "trabajo sin fusionar");
      g("checkout", "-q", "staging");
      g("branch", "ops/fusionada"); // en el mismo commit que staging: `-d` la borra
      const d1 = huerfana(t, "MenuPlan-uno");
      const d2 = huerfana(t, "MenuPlan-dos");
      const apunte = (dir, rama) => ({ dir, rama, motivo: "falló `git worktree remove`", cuando: "2026-10-13T05:36:00Z" });
      writeFileSync(ficheroPendientes(join(repo, ".git")), JSON.stringify([apunte(d1, "ops/sin-fusionar"), apunte(d2, "ops/fusionada")]));
      execFileSync(process.execPath, [resolve("scripts/limpiar-worktrees.mjs"), "--si", "--silencio"], { cwd: repo, encoding: "utf8" });
      expect(existsSync(d1)).toBe(false);
      expect(existsSync(d2)).toBe(false);
      const ramas = g("branch", "--format=%(refname:short)");
      expect(ramas).toContain("ops/sin-fusionar");
      expect(ramas).not.toContain("ops/fusionada");
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  // El caso real del 13 oct: el hook corre tras `gh pr merge` con el directorio
  // de trabajo de la sesión, que está DENTRO del worktree mergeado. En Windows
  // eso bloquea el borrado si el script no se mueve antes a la raíz del repo.
  it("el worktree mergeado se borra aunque el proceso se lance desde dentro de él", () => {
    // Fuera de la carpeta temporal del sistema: el script no toca worktrees de AppData/Local/Temp (scratchpads de sesiones).
    const t = realpathSync(mkdtempSync(join(resolve(process.cwd(), ".."), "zz-limpieza-725-")));
    try {
      const sh = (cwd, ...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const origen = join(t, "origen.git");
      sh(t, "init", "-q", "--bare", "-b", "staging", origen);
      const repo = join(t, "MenuPlan");
      sh(t, "clone", "-q", origen, repo);
      sh(repo, "commit", "-q", "--allow-empty", "-m", "ini");
      sh(repo, "push", "-q", "-u", "origin", "staging");
      const d = join(t, "MenuPlan-tarea");
      sh(repo, "worktree", "add", "-q", "-b", "ops/tarea", d, "origin/staging");
      sh(d, "push", "-q", "-u", "origin", "ops/tarea"); // subida con su nombre; sin commits propios = contenida en staging
      const script = resolve("scripts/limpiar-worktrees.mjs");
      execFileSync(process.execPath, [script, "--si", "--silencio"], { cwd: d, encoding: "utf8" });
      expect(existsSync(d)).toBe(false);
      expect(sh(repo, "worktree", "list", "--porcelain")).not.toContain("MenuPlan-tarea");
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });
});
