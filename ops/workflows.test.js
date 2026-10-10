// Todo workflow de .github/workflows/ se puede leer como YAML (#480).
//
// Por qué: el 10 oct 2026 flujo-semanal.yml se quedó con dos `printf '\n…'` cuyos `\n` se
// habían convertido en saltos de línea de verdad. Esas líneas salían del bloque `run: |` sin
// sangría y el fichero dejó de ser YAML: GitHub marca cada run en rojo a los 0 s y el informe
// del lunes no habría salido. Los tests del workflow lo leían como texto y no lo vieron.
//
// La comprobación no usa un parser (no hay ninguno entre las dependencias directas): dentro de
// un bloque `|` o `>`, una línea con menos sangría que el bloque tiene que ser una clave o un
// elemento de lista de YAML; si es otra cosa (un `%s`, una comilla suelta), el bloque se rompió.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = resolve(import.meta.dirname, "..");
const DIR = join(RAIZ, ".github", "workflows");

/** Las líneas que rompen un bloque literal: [{ linea, texto }]. */
function bloquesRotos(texto) {
  const lineas = String(texto).replace(/\r\n/g, "\n").split("\n");
  const sangria = (l) => l.length - l.trimStart().length;
  const esClave = (l) => /^\s*(?:- )?(?:[\w.-]+|"[^"]*"|'[^']*'):(?:\s|$)/.test(l) || /^\s*-(?:\s|$)/.test(l) || /^\s*#/.test(l);
  const rotas = [];
  for (let i = 0; i < lineas.length; i++) {
    if (!/:\s*[|>][-+]?\s*(?:#.*)?$/.test(lineas[i])) continue;
    const base = sangria(lineas[i]);
    let bloque = null;
    for (let j = i + 1; j < lineas.length; j++) {
      const l = lineas[j];
      if (!l.trim()) continue;
      if (bloque === null) {
        if (sangria(l) <= base) break;
        bloque = sangria(l);
        continue;
      }
      if (sangria(l) >= bloque) continue;
      if (!esClave(l)) rotas.push({ linea: j + 1, texto: l.slice(0, 60) });
      break;
    }
  }
  return rotas;
}

describe("los workflows se pueden leer como YAML", () => {
  const ficheros = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
  it("hay workflows que mirar", () => expect(ficheros.length).toBeGreaterThan(5));
  for (const f of ficheros) {
    it(`${f}: ningún bloque «run: |» se rompe por una línea sin sangría`, () => {
      expect(bloquesRotos(readFileSync(join(DIR, f), "utf8")), "Una línea dentro de un bloque `|` va con su sangría: un \\n escrito como salto de línea de verdad la saca").toEqual([]);
    });
  }
  it("detecta el fallo del 10 oct (printf con saltos de línea de verdad)", () => {
    const roto = ["jobs:", "  a:", "    steps:", "      - run: |", "          printf '", "%s", "' \"x\" >> f", "      - run: echo"].join("\n");
    expect(bloquesRotos(roto)).toEqual([{ linea: 6, texto: "%s" }]);
    const bueno = ["jobs:", "  a:", "    steps:", "      - run: |", "          printf '\\n%s\\n' x", "", "          echo b", "      - run: echo", "  b:", "    steps: []"].join("\n");
    expect(bloquesRotos(bueno)).toEqual([]);
  });
});
