// Todo workflow de .github/workflows/ se puede leer como YAML (#480, fondo #525).
//
// Por qué: el 10 oct 2026 flujo-semanal.yml se quedó con dos `printf '\n…'` cuyos `\n` se
// habían convertido en saltos de línea de verdad. Esas líneas salían del bloque `run: |` sin
// sangría y el fichero dejó de ser YAML: GitHub marca cada run en rojo a los 0 s y el informe
// del lunes no habría salido. Los tests del workflow lo leían como texto y no lo vieron.
//
// Lo que decide es un parser de verdad (`yaml`, devDependency). La heurística de los bloques
// solo sirve para explicar el fallo más típico (una línea que se sale de un `run: |`).
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

const RAIZ = resolve(import.meta.dirname, "..");
const DIR = join(RAIZ, ".github", "workflows");

/** Los errores del parser: [«línea N: código»]. */
function erroresYaml(texto) {
  const doc = parseDocument(String(texto), { prettyErrors: true });
  return doc.errors.map((e) => `línea ${e.linePos?.[0]?.line ?? "?"}: ${e.code}`);
}

/** Pista: las líneas que se salen de un bloque literal (`|` o `>`) sin ser una clave. */
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
      if (!esClave(l)) rotas.push(`línea ${j + 1} se sale de un bloque «|»: ${l.slice(0, 40)}`);
      break;
    }
  }
  return rotas;
}

/** Lo que se le dice a quien rompe un workflow: el error del parser y, si la hay, la pista. */
const problemas = (texto) => {
  const e = erroresYaml(texto);
  return e.length ? [...e, ...bloquesRotos(texto)] : [];
};

describe("los workflows se pueden leer como YAML", () => {
  const ficheros = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
  it("hay workflows que mirar", () => expect(ficheros.length).toBeGreaterThan(5));
  for (const f of ficheros) {
    it(`${f}: YAML válido, con jobs y cada paso con run o uses`, () => {
      const texto = readFileSync(join(DIR, f), "utf8");
      expect(problemas(texto), "Un \\n escrito como salto de línea de verdad saca la línea del bloque; un «: » en un valor sin comillas lo rompe").toEqual([]);
      const wf = parseDocument(texto).toJS();
      expect(Object.keys(wf.jobs ?? {}).length, "sin jobs").toBeGreaterThan(0);
      for (const job of Object.values(wf.jobs)) {
        for (const p of job.steps ?? []) expect(typeof p.run === "string" || typeof p.uses === "string", JSON.stringify(p).slice(0, 80)).toBe(true);
      }
    });
  }
  it("detecta el fallo del 10 oct (printf con saltos de línea de verdad) y lo explica", () => {
    const roto = ["jobs:", "  a:", "    steps:", "      - run: |", "          printf '", "%s", "' \"x\" >> f", "      - run: echo"].join("\n");
    const p = problemas(roto);
    expect(p.length).toBeGreaterThan(1);
    expect(p.join("\n")).toMatch(/línea 6 se sale de un bloque «\|»: %s/);
    const bueno = ["jobs:", "  a:", "    steps:", "      - run: |", "          printf '\\n%s\\n' x", "", "          echo b", "      - run: echo"].join("\n");
    expect(problemas(bueno)).toEqual([]);
  });
  it("detecta un «: » sin comillas en el nombre de un paso, que la heurística no ve", () => {
    const roto = ["jobs:", "  a:", "    steps:", "      - name: Paso: uno", "        run: echo"].join("\n");
    expect(bloquesRotos(roto)).toEqual([]);
    expect(erroresYaml(roto).length).toBeGreaterThan(0);
  });
});
