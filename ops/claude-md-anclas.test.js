import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ficherosDeGit } from "./ficherosGit.js";

/**
 * Vigilante de la clase «un test no obliga a copiar en CLAUDE.md lo que vive en otro
 * sitio» (#690, D3 de docs/ops/CLAUDE-MD-AFIRMACIONES.md). Cinco tests fijaban texto en
 * CLAUDE.md (agentes, skills, voz, issues, consulta) y así impedían dejarlo como índice
 * corto; ahora miran su fuente. Este recorre todos los tests del repo y falla si uno lee
 * el CLAUDE.md de la raíz sin estar en ops/claude-md-anclas.json con su porqué, o si una
 * fila de la lista ya no lo lee. Registrado en ops/vigilantes.json («claude-md-anclas»).
 *
 * «Leer» es: una llamada de lectura (`readFileSync`, `readFile`, `leer…`) con el literal
 * "CLAUDE.md" (o "../CLAUDE.md") en la misma línea, o un `for (const f of [… "CLAUDE.md" …])`
 * cuyo `f` se lee en las tres líneas siguientes. Nombrar CLAUDE.md como dato de prueba
 * (una zona, un diff de mentira) no es leerlo.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
// Este fichero se excluye a sí mismo: sus pruebas del detector llevan lecturas de mentira, como texto.
const ESTE = "ops/claude-md-anclas.test.js";
const TESTS = ficherosDeGit(RAIZ).filter((f) => /\.test\.(js|jsx|mjs)$/.test(f) && f !== ESTE);
const DATOS = JSON.parse(readFileSync(join(RAIZ, "ops", "claude-md-anclas.json"), "utf8"));

const LITERAL = /(["'`])(?:\.\.?\/)*CLAUDE\.md\1/;
const LEE = String.raw`\b(?:readFileSync|readFile|leer\w*)\s*\(`;

/** Las líneas (desde 1) en las que el texto de un test lee el CLAUDE.md del repo. */
export function lecturasDeClaudeMd(texto) {
  const lineas = String(texto).split(/\r?\n/);
  const salida = [];
  lineas.forEach((l, i) => {
    if (!LITERAL.test(l)) return;
    if (new RegExp(LEE).test(l)) return void salida.push(i + 1);
    const bucle = l.match(/\bfor\s*\(\s*(?:const|let|var)\s+(\w+)\s+of\s*\[/);
    if (!bucle) return;
    const leeVariable = new RegExp(`${LEE}[^)]*\\b${bucle[1]}\\b`);
    if (lineas.slice(i + 1, i + 4).some((x) => leeVariable.test(x))) salida.push(i + 1);
  });
  return salida;
}

describe("el detector de lecturas de CLAUDE.md", () => {
  it("ve una lectura directa, con ruta relativa y por un bucle", () => {
    expect(lecturasDeClaudeMd(`const c = readFileSync(join(RAIZ, "CLAUDE.md"), "utf8");`)).toEqual([1]);
    expect(lecturasDeClaudeMd(`expect(leer("CLAUDE.md")).toMatch(/x/);`)).toEqual([1]);
    expect(lecturasDeClaudeMd(`const c = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");`)).toEqual([1]);
    expect(lecturasDeClaudeMd(`a();\nfor (const f of ["CLAUDE.md", "x.md"]) {\n  const t = leer(f);\n}`)).toEqual([2]);
  });

  it("no confunde nombrar CLAUDE.md como dato de prueba con leerlo", () => {
    expect(lecturasDeClaudeMd(`expect(otrasRamas(rota, "CLAUDE.md")).toEqual([]);`)).toEqual([]);
    expect(lecturasDeClaudeMd(`const r = comprobarNormasPr({ diff: diffDe("CLAUDE.md", ["Nunca."]) });`)).toEqual([]);
    expect(lecturasDeClaudeMd(`writeFileSync(join(base, "CLAUDE.md"), "uno");`)).toEqual([]);
    expect(lecturasDeClaudeMd(`for (const [n, t] of [["CLAUDE.md", claude]]) expect(t, n).toMatch(/x/);`)).toEqual([]);
    expect(lecturasDeClaudeMd(`expect(leerZonasArg(["--zona=CLAUDE.md,docs/ops/"])).toEqual({});`)).toEqual([]);
    expect(lecturasDeClaudeMd(`const x = readFileSync(join(RAIZ, "docs/CLAUDE.md.bak"));`)).toEqual([]);
  });
});

describe("ningún test fija texto en CLAUDE.md fuera de las anclas permitidas (#690, D3)", () => {
  const lectores = TESTS.map((f) => ({ f, lineas: lecturasDeClaudeMd(readFileSync(join(RAIZ, f), "utf8")) })).filter((x) => x.lineas.length);
  const anclas = DATOS.anclas.map((a) => a.test);

  it("la búsqueda ve los tests que leen CLAUDE.md (no pasa en vacío)", () => {
    expect(lectores.length).toBeGreaterThanOrEqual(4);
  });

  it("cada fila de la lista lleva test, lo que fija y su porqué, sin repetirse", () => {
    for (const a of DATOS.anclas) {
      for (const campo of ["test", "fija", "porque"]) expect(String(a[campo] ?? "").trim(), `${a.test}: ${campo}`).not.toBe("");
      expect(Object.keys(a).sort(), a.test).toEqual(["fija", "porque", "test"]);
    }
    expect(new Set(anclas).size).toBe(anclas.length);
  });

  it("todo test que lee CLAUDE.md está en la lista de anclas", () => {
    const fuera = lectores.filter((x) => !anclas.includes(x.f)).map((x) => `${x.f}:${x.lineas.join(",")}`);
    expect(fuera, "Comprueba la fuente de datos (la cabecera, el mapa, la norma, la skill), no su copia en CLAUDE.md; si es un puntero del índice, añádelo a ops/claude-md-anclas.json con su porqué").toEqual([]);
  });

  it("cada ancla de la lista sigue leyendo CLAUDE.md (si no, sale de la lista)", () => {
    const leen = new Set(lectores.map((x) => x.f));
    expect(anclas.filter((t) => !leen.has(t))).toEqual([]);
  });
});
