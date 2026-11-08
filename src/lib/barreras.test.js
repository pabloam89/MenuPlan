/**
 * Barreras de código: lo que ya nos pasó y no debe volver.
 *
 * - lucide: los iconos son Nucleo (regla `ui`, DESIGN_SYSTEM.md). lucide se
 *   quitó y volvía en cada pantalla nueva que alguien copiaba de un ejemplo.
 * - Regex sobre nombres de alimento con frontera de palabra (regla
 *   `catalogo`): sin ella, «pera» casa dentro de «pimienta negra molida en
 *   pera…» y «sal» dentro de «salmón». Aquí se vigilan los `new RegExp` que
 *   montan un patrón con texto de fuera (`${…}`): tienen que llevar `\b`,
 *   `^`/`$`, un lookbehind o una clase que haga de frontera. Si uno no lo
 *   necesita (no busca nombres), va a SIN_FRONTERA con su porqué.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rel = (p) => relative(RAIZ, p).replace(/\\/g, "/");

function ficheros(dir, ext = /\.(m?js|jsx)$/) {
  const fuera = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) fuera.push(...ficheros(p, ext));
    else if (ext.test(n) && !/\.test\.(m?js|jsx)$/.test(n)) fuera.push(p);
  }
  return fuera;
}

describe("sin lucide", () => {
  it("ni en las dependencias", () => {
    const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
    const todas = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
    expect(todas.filter((d) => /lucide/i.test(d)), "Los iconos son Nucleo: `npm run build:icons` (regla ui)").toEqual([]);
  });

  it("ni importado en src/ ni en api/", () => {
    const importan = [...ficheros(join(RAIZ, "src")), ...ficheros(join(RAIZ, "api"))]
      .filter((f) => /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*lucide/.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(importan, "Los iconos son Nucleo: `npm run build:icons` (regla ui)").toEqual([]);
  });
});

// `new RegExp(` con texto de fuera que no busca nombres: no necesita frontera.
const SIN_FRONTERA = new Map([
  ["api/_bot/telegram.js", "trocea un mensaje largo por tamaño; ${max} es un número"],
]);

// Una frontera en el patrón: \b, ^, $, un lookaround, (^|…), (?:^|…) o una
// clase negada de letras como [^a-z0-9] o [\p{L}\p{N}]. Un \s suelto no
// cuenta: [\s\S] no es frontera.
const FRONTERA = /\\\\b|`\^|\(\^\||\(\?:\^\||\(\?<?[!=]|\[\^a-z|\\\\p\{L\}|\$`/;

/** `new RegExp(\`…${…}…\`` de un fuente, con su línea. */
export function regexConTexto(fuente) {
  const fuera = [];
  const re = /new RegExp\(\s*(`(?:[^`\\]|\\.)*`)/g;
  for (let m; (m = re.exec(fuente)); ) {
    if (!m[1].includes("${")) continue;
    fuera.push({ linea: fuente.slice(0, m.index).split("\n").length, patron: m[1] });
  }
  return fuera;
}

describe("regex con nombres de alimento llevan frontera", () => {
  it("distingue con y sin frontera", () => {
    const con = (s) => regexConTexto(s).map((r) => FRONTERA.test(r.patron));
    expect(con("new RegExp(`\\\\b${x}\\\\b`)")).toEqual([true]);
    expect(con("new RegExp(`(?:^|\\\\s)${x}(?:\\\\s|$)`)")).toEqual([true]);
    expect(con("new RegExp(`(?<![\\\\p{L}\\\\p{N}])${x}`, \"iu\")")).toEqual([true]);
    expect(con("new RegExp(`${x}`, \"i\")")).toEqual([false]);
    expect(con("new RegExp(`(?:${xs.join(\"|\")})`)")).toEqual([false]);
    expect(con("new RegExp(\"a\")")).toEqual([]);
  });

  it("en las zonas del catálogo (src/data, src/utils, src/lib, api/_bot)", () => {
    const zonas = ["src/data", "src/utils", "src/lib", "api/_bot"].flatMap((z) => ficheros(join(RAIZ, z)));
    const malas = zonas.flatMap((f) => {
      if (SIN_FRONTERA.has(rel(f))) return [];
      return regexConTexto(readFileSync(f, "utf8"))
        .filter((r) => !FRONTERA.test(r.patron))
        .map((r) => `${rel(f)}:${r.linea} ${r.patron.slice(0, 60)}`);
    });
    expect(malas, "Regex sobre nombres sin frontera de palabra: usa \\b (regla catalogo). Si no busca nombres, añádela a SIN_FRONTERA con su porqué").toEqual([]);
  });

  it("SIN_FRONTERA no guarda ficheros que ya no existen o ya no lo necesitan", () => {
    for (const f of SIN_FRONTERA.keys()) {
      const sinFrontera = regexConTexto(readFileSync(join(RAIZ, f), "utf8")).filter((r) => !FRONTERA.test(r.patron));
      expect(sinFrontera.length, `${f} ya no tiene regex sin frontera: quítalo de SIN_FRONTERA`).toBeGreaterThan(0);
    }
  });
});
