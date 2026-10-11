import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { OPCIONES_GIT, RESERVA_VALIDA, compartidos, construirZonas, informeZonas, leerReservas, rutasDeStatus } from "./lib/zonas.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));

const PORCELANA = [
  "worktree C:/dev/MenuPlan\nHEAD aaa\nbranch refs/heads/staging",
  "worktree C:/dev/MenuPlan-a\nHEAD bbb\nbranch refs/heads/ops/1-a",
  "worktree C:/dev/MenuPlan-b\nHEAD ccc\nbranch refs/heads/datos/b",
  "worktree C:/dev/MenuPlan-dep\nHEAD ddd\nbranch refs/heads/dependabot/npm/x",
  "worktree C:/dev/MenuPlan-rota\nHEAD eee\nbranch refs/heads/fix/3-rota",
  "worktree C:/dev/MenuPlan-suelta\nHEAD fff\ndetached",
].join("\n\n");

/** Un git de mentira: responde según los argumentos. */
function gitFalso({ sinReservas = false } = {}) {
  return (...a) => {
    const t = a.join(" ");
    if (t.includes("worktree list")) return PORCELANA;
    if (t.includes("config --get-regexp")) {
      if (sinReservas) throw new Error("exit 1");
      return "branch.datos/b.zona ops/forja.json\nbranch.datos/b.zona ../fuera\nbranch.ops/1-a.zona docs/ops/\n";
    }
    if (t.includes("fix/3-rota") || t.includes("MenuPlan-rota")) throw new Error("carpeta rota");
    if (t.includes("diff") && t.endsWith("origin/staging...ops/1-a")) return "ops/forja.json\0CLAUDE.md\0";
    if (t.includes("diff") && t.endsWith("origin/staging...datos/b")) return "";
    if (t.startsWith("-C C:/dev/MenuPlan-a status")) return " M ops/glosario.json\0?? ops/nuevo.json\0?? .claude/agent-memory/datos/MEMORY.md\0";
    if (t.startsWith("-C C:/dev/MenuPlan-b status")) return " M CLAUDE.md\0";
    if (t.includes("log") && t.endsWith("origin/staging..ops/1-a")) return "2026-10-10T19:00:00+02:00\n2026-10-10T18:00:00+02:00\n";
    if (t.includes("log")) return "";
    throw new Error(`orden inesperada: ${t}`);
  };
}

describe("la foto de zonas, sacada de git", () => {
  const foto = construirZonas("C:/dev/MenuPlan", { git: gitFalso(), ahora: new Date("2026-10-10T20:00:00Z") });

  it("una fila por carpeta de trabajo, sin la principal ni las ramas ajenas ni las sueltas", () => {
    expect(foto.hecho).toBe("2026-10-10T20:00:00.000Z");
    expect(foto.ramas.map((r) => r.rama)).toEqual(["ops/1-a", "datos/b", "fix/3-rota"]);
  });

  it("junta lo commiteado, lo no commiteado y lo reservado; la memoria de los agentes no cuenta", () => {
    const a = foto.ramas[0];
    expect(a).toMatchObject({ carpeta: "MenuPlan-a", issue: 1, desde: "2026-10-10T18:00:00+02:00", reservadas: ["docs/ops/"] });
    expect(a.ficheros).toEqual(["CLAUDE.md", "ops/forja.json", "ops/glosario.json", "ops/nuevo.json"]);
    expect(foto.ramas[1]).toMatchObject({ issue: null, desde: null, ficheros: ["CLAUDE.md"], reservadas: ["ops/forja.json"] });
  });

  it("una carpeta que git no sabe leer sale vacía y no tumba las demás", () => {
    expect(foto.ramas[2]).toMatchObject({ rama: "fix/3-rota", issue: 3, ficheros: [], desde: null });
  });

  it("sin ninguna reserva (git config sale con error) sigue", () => {
    expect(construirZonas("C:/dev/MenuPlan", { git: gitFalso({ sinReservas: true }) }).ramas[1].reservadas).toEqual([]);
  });

  it("cuenta los ficheros que llevan dos ramas o más, con lo cambiado por delante de lo reservado", () => {
    expect(compartidos(foto)).toEqual([
      { fichero: "CLAUDE.md", ramas: [{ rama: "ops/1-a", issue: 1, desde: "2026-10-10T18:00:00+02:00", como: "cambiado" }, { rama: "datos/b", issue: null, desde: null, como: "cambiado" }] },
      { fichero: "ops/forja.json", ramas: [{ rama: "ops/1-a", issue: 1, desde: "2026-10-10T18:00:00+02:00", como: "cambiado" }, { rama: "datos/b", issue: null, desde: null, como: "reservado" }] },
    ]);
    const una = { ramas: [{ rama: "a/x", ficheros: ["f"], reservadas: ["f"] }] };
    expect(compartidos(una)).toEqual([]);
    // Reservado y ya cambiado en la misma rama: cuenta una vez, como cambiado.
    const dos = { ramas: [...una.ramas, { rama: "a/y", ficheros: ["f"], reservadas: [] }] };
    expect(compartidos(dos)[0].ramas.map((r) => [r.rama, r.como])).toEqual([["a/x", "cambiado"], ["a/y", "cambiado"]]);
  });

  it("el informe empieza por una línea contable y cuenta los avisos de la semana", () => {
    const registro = "ts: 2026-10-10T10:00:00.000Z zona: ops/forja.json rama: datos/b issue: - como: reservado aviso: si\nts: 2026-09-01T10:00:00.000Z zona: CLAUDE.md rama: x issue: - como: cambiado aviso: si\n";
    const l = informeZonas(foto, { ahora: new Date("2026-10-10T20:00:00Z"), registro });
    expect(l[0]).toBe("zonas-compartidas: 2 ramas-vivas: 3 ramas-con-ficheros: 2");
    expect(l).toContain("      datos/b  sin issue  reservado  sin fecha");
    expect(l).toContain("      ops/1-a  #1  con cambios  desde hace 4,0 h");
    expect(l.at(-1)).toBe("avisos-de-zona-7-dias: 1 ficheros: 1");
    expect(informeZonas({ ramas: [] })[1]).toMatch(/Ningún fichero/);
  });
});

describe("con un git de verdad: el cálculo en segundo plano deja la foto", () => {
  it("commiteado, sin commitear, nuevo y reservado; la principal no cuenta", () => {
    const base = mkdtempSync(join(tmpdir(), "zonas-git-"));
    const g = (...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { encoding: "utf8" });
    g("init", "-q", base);
    writeFileSync(join(base, "CLAUDE.md"), "uno\n");
    g("-C", base, "add", "CLAUDE.md");
    g("-C", base, "commit", "-q", "-m", "base");
    g("-C", base, "update-ref", "refs/remotes/origin/staging", "HEAD");
    const wt = join(base, "..", `${basename(base)}-x`);
    g("-C", base, "worktree", "add", "-q", "-b", "ops/7-x", wt);
    mkdirSync(join(wt, "ops"));
    writeFileSync(join(wt, "ops", "forja.json"), "{}\n");
    g("-C", wt, "add", "ops/forja.json");
    g("-C", wt, "commit", "-q", "-m", "forja");
    writeFileSync(join(wt, "CLAUDE.md"), "dos\n");
    writeFileSync(join(wt, "ops", "nuevo.json"), "{}\n");
    g("-C", base, "config", "--add", "branch.ops/7-x.zona", "ops/glosario.json");
    const dirReg = join(base, ".git", "claude-sesiones");
    const r = spawnSync(process.execPath, [join(AQUI, "lib", "zonas.mjs"), "--refrescar", dirReg], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const foto = JSON.parse(readFileSync(join(dirReg, "zonas.json"), "utf8"));
    expect(foto.ramas).toHaveLength(1);
    expect(foto.ramas[0]).toMatchObject({ rama: "ops/7-x", issue: 7, ficheros: ["CLAUDE.md", "ops/forja.json", "ops/nuevo.json"], reservadas: ["ops/glosario.json"] });
    expect(Date.parse(foto.ramas[0].desde)).toBeGreaterThan(0);
  });
});

describe("lo que se lee de git, por piezas", () => {
  it("status -z: quita la marca de dos letras", () => {
    expect(rutasDeStatus(" M a.js\0?? b/c.md\0A  d e.txt\0")).toEqual(["a.js", "b/c.md", "d e.txt"]);
    expect(rutasDeStatus("")).toEqual([]);
  });

  it("las reservas: rama con puntos y barras, y fuera lo que no es una ruta del repo", () => {
    const r = leerReservas("branch.ops/1-a.b.zona CLAUDE.md\nbranch.x/y.zona /etc/passwd\nbranch.x/y.zona ../a\nbranch.x/y.zona ops/a/../../b\nbranch.x/y.otra z\n");
    expect([...r.entries()]).toEqual([["ops/1-a.b", ["CLAUDE.md"]]]);
    expect(RESERVA_VALIDA.test("docs/ops/")).toBe(true);
    expect(RESERVA_VALIDA.test("a b")).toBe(false);
    expect(RESERVA_VALIDA.test("Avatares/cards/mismo_menu_niños.png")).toBe(true);
    expect(RESERVA_VALIDA.test("docs/diseño/señal-acción.md")).toBe(true);
    expect(RESERVA_VALIDA.test("a​b")).toBe(false);
  });

  it("cada git del cálculo va oculto: sin windowsHide, una ventana por git en Windows (#506)", () => {
    expect(OPCIONES_GIT.windowsHide).toBe(true);
    expect(OPCIONES_GIT.stdio).toEqual(["ignore", "pipe", "ignore"]);
  });
});
