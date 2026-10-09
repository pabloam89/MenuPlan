import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El mínimo del catálogo de Mercadona (#351, norma catalogo-mercadona-minimo).
 *
 * El paso «Comprobar que el catálogo tiene sentido» de mercadona-sync.yml es lo
 * único que impide que el cron guarde un catálogo vacío o a medias. Este test
 * saca del workflow el código de ese paso, tal cual, y lo ejecuta en un repo
 * de mentira con el catálogo de antes commiteado y el nuevo en disco. Así, si
 * alguien cambia el paso, lo mueve detrás del commit o lo deja pasar en falso,
 * falla aquí y no un lunes en staging. No toca el workflow.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = readFileSync(join(RAIZ, ".github/workflows/mercadona-sync.yml"), "utf8").replace(/\r\n/g, "\n");
const NOMBRE = "Comprobar que el catálogo tiene sentido";

/** Los pasos del job, en orden: [{ nombre, texto }]. */
function pasos(yml) {
  const trozos = yml.split(/^ {6}- /m).slice(1);
  return trozos.map((t) => ({ nombre: t.match(/^(?:name:\s*(.+)|uses:\s*(.+)|run:\s*(.+))$/m)?.slice(1).find(Boolean)?.trim(), texto: t }));
}

/** El programa del `node -e '…'` del paso, sin la sangría del bloque. */
function programaDelPaso(texto) {
  const m = texto.match(/node -e '\n([\s\S]*?)\n\s*'\s*$/m);
  if (!m) return null;
  return m[1].split("\n").map((l) => l.replace(/^ {12}/, "")).join("\n");
}

/** Ejecuta el paso con el catálogo de antes (en HEAD) y el de ahora (en disco). */
function comprobar(antes, ahora) {
  const dir = mkdtempSync(join(tmpdir(), "mercadona-comprobar-"));
  try {
    const git = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8" });
    mkdirSync(join(dir, "public/store"), { recursive: true });
    const ruta = join(dir, "public/store/mercadona.json");
    git("init", "-q");
    writeFileSync(ruta, JSON.stringify({ productCount: antes }));
    git("add", ".");
    git("commit", "-q", "-m", "antes");
    if (ahora === undefined) rmSync(ruta);
    else writeFileSync(ruta, JSON.stringify({ productCount: ahora }));
    const r = spawnSync(process.execPath, ["-e", programaDelPaso(paso.texto)], { cwd: dir, encoding: "utf8" });
    return r.status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const lista = pasos(WORKFLOW);
const paso = lista.find((p) => p.nombre === NOMBRE);

describe("mercadona-sync.yml: el paso que comprueba el catálogo", () => {
  it("existe, va después de descargar y antes de commitear, y no se deja pasar en falso", () => {
    expect(paso, `falta el paso «${NOMBRE}»`).toBeDefined();
    const i = lista.indexOf(paso);
    expect(i).toBeGreaterThan(lista.findIndex((p) => p.nombre === "Descargar el catálogo"));
    expect(i).toBeLessThan(lista.findIndex((p) => /^Commitear/.test(p.nombre ?? "")));
    expect(paso.texto).not.toMatch(/continue-on-error|\|\|\s*true|^\s+if:/m);
    expect(programaDelPaso(paso.texto)).toMatch(/process\.exit\(1\)/);
  });

  it("deja pasar un catálogo normal y una bajada pequeña", () => {
    expect(comprobar(3000, 3000)).toBe(0);
    expect(comprobar(3000, 3100)).toBe(0);
    expect(comprobar(1000, 800)).toBe(0);
  });

  it("para con menos de 500 productos o con una caída de más del 20 %", () => {
    expect(comprobar(600, 499)).toBe(1);
    expect(comprobar(3000, 0)).toBe(1);
    expect(comprobar(1000, 799)).toBe(1);
  });

  it("si el catálogo nuevo no está, para (falla cerrado)", () => {
    expect(comprobar(3000, undefined)).not.toBe(0);
  });
});
