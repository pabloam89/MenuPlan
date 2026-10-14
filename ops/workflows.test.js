// Todo workflow de .github/workflows/ se puede leer como YAML (#480, fondo #525).
//
// Por qué: el 10 oct 2026 flujo-semanal.yml se quedó con dos `printf '\n…'` cuyos `\n` se
// habían convertido en saltos de línea de verdad. Esas líneas salían del bloque `run: |` sin
// sangría y el fichero dejó de ser YAML: GitHub marca cada run en rojo a los 0 s y el informe
// del lunes no habría salido. Los tests del workflow lo leían como texto y no lo vieron.
//
// Lo que decide es un parser de verdad (`yaml`, devDependency). La heurística de los bloques
// solo sirve para explicar el fallo más típico (una línea que se sale de un `run: |`).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

const RAIZ = resolve(import.meta.dirname, "..");
const DIR = join(RAIZ, ".github", "workflows");
const PENDIENTES = join(RAIZ, "ops", "workflows-pendientes");

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

/**
 * Las líneas de un `run:` con un `\n` escrito tal cual fuera de comillas, entre espacios. En
 * bash eso no es un salto de línea: es la letra «n» como argumento suelto (`gh … n --search …`),
 * la orden falla con «unknown argument» y, dentro de un `if !`, el paso sale en verde sin hacer
 * nada. Pasó el 10 oct 2026 al reponer las continuaciones `\` con un script (#526). Antes se
 * quitan las cadenas entre comillas simples y dobles: ahí un `\n` es de printf o de jq.
 */
function nSueltas(run) {
  return String(run).split("\n").flatMap((l, i) => {
    const sinComillas = l.replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    return /(^|\s)\\n(\s|$)/.test(sinComillas) ? [`línea ${i + 1} del run: \\n suelto fuera de comillas`] : [];
  });
}

/**
 * Las órdenes de un `run:` que buscan un issue (#450): `gh issue list`, `gh search issues`, la
 * API `search/issues`, el listado `gh api repos/…/issues` y `gh api graphql` con `search(`, con
 * las continuaciones «\» unidas en una sola línea.
 */
function busquedasDeIssue(run) {
  return String(run)
    .replace(/\\\r?\n/g, " ")
    .split("\n")
    .filter((l) =>
      /\bgh\s+(?:issue\s+list|search\s+issues)\b|search\/issues/.test(l) ||
      /\bgh\s+api\b.*\brepos\/\S*?\/issues(?=[?\s'"]|$)/.test(l) ||
      (/\bgh\s+api\s+graphql\b/.test(l) && /\bsearch\s*\(/.test(l)));
}

/**
 * Lo que le falta a una búsqueda de issue para no publicar en el de otro (#450). El repo es
 * público: cualquiera abre un issue con el mismo título, y la búsqueda de GitHub es difusa, así
 * que el primer resultado de `in:title` puede ser suyo y recibir el informe y la mención a Pablo.
 * Cada búsqueda filtra por el autor del bot (`--author app/github-actions` o `author:` en la
 * consulta) y compara el título exacto en el jq (`select(.title==…)`), como flujo-semanal.yml (#341).
 */
function faltasDeBusqueda(orden) {
  const faltas = [];
  // `-author:` niega y `OR` abre la consulta a otros autores o títulos: ninguno de los dos vale.
  if (!/(?:--author[ =]["']?|(?<![-\w])author:["']?)app\/github-actions(?=["'\s&]|$)/.test(orden)) faltas.push("sin filtro de autor del bot (--author app/github-actions)");
  if (/\bOR\b/.test(orden)) faltas.push("con OR en la consulta: abre la búsqueda a otros autores o títulos");
  const comparaTitulo = /select\(\s*\.title\s*==/.test(orden);
  if (!comparaTitulo) faltas.push("sin comparar el título exacto (select(.title==…) en el --jq)");
  const json = orden.match(/--json[ =]["']?([\w,]+)/);
  if (comparaTitulo && json && !json[1].split(",").includes("title")) faltas.push("compara .title sin pedirlo en --json (sale null y nunca coincide)");
  return faltas;
}

/** Lo que se le dice a quien rompe un workflow: el error del parser y, si la hay, la pista. */
const problemas = (texto) => {
  const e = erroresYaml(texto);
  return e.length ? [...e, ...bloquesRotos(texto)] : [];
};

describe("los workflows se pueden leer como YAML", () => {
  // Rutas desde la raíz: los de .github/workflows/ y los que esperan en ops/workflows-pendientes/
  // a que Pablo los mueva (la App de las sesiones no puede empujar workflows, #844).
  const yamls = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => relative(RAIZ, join(dir, f)).replace(/\\/g, "/")) : []);
  const ficheros = [...yamls(DIR), ...yamls(PENDIENTES)];
  it("hay workflows que mirar", () => expect(ficheros.length).toBeGreaterThan(5));
  for (const f of ficheros) {
    it(`${f}: YAML válido, con jobs y cada paso con run o uses`, () => {
      const texto = readFileSync(join(RAIZ, f), "utf8");
      expect(problemas(texto), "Un \\n escrito como salto de línea de verdad saca la línea del bloque; un «: » en un valor sin comillas lo rompe").toEqual([]);
      const wf = parseDocument(texto).toJS();
      expect(Object.keys(wf.jobs ?? {}).length, "sin jobs").toBeGreaterThan(0);
      for (const job of Object.values(wf.jobs)) {
        for (const p of job.steps ?? []) expect(typeof p.run === "string" || typeof p.uses === "string", JSON.stringify(p).slice(0, 80)).toBe(true);
      }
    });
    it(`${f}: ningún «\\n» suelto fuera de comillas en un run (bash lo lee como la letra «n»)`, () => {
      const wf = parseDocument(readFileSync(join(RAIZ, f), "utf8")).toJS() ?? {};
      const malos = Object.entries(wf.jobs ?? {}).flatMap(([j, job]) => (job.steps ?? []).flatMap((p, k) => nSueltas(p.run ?? "").map((m) => `${j} paso ${k + 1}: ${m}`)));
      expect(malos, "Una orden por línea, o un «\\» de verdad al final de la línea; un «\\n» escrito tal cual es un argumento «n»").toEqual([]);
    });
  }
  it("cada workflow que busca un issue lo filtra por el autor del bot y por el título exacto (#450)", () => {
    const malos = ficheros.flatMap((f) => {
      const wf = parseDocument(readFileSync(join(RAIZ, f), "utf8")).toJS() ?? {};
      return Object.entries(wf.jobs ?? {}).flatMap(([j, job]) =>
        (job.steps ?? []).flatMap((p, k) => busquedasDeIssue(p.run ?? "").flatMap((orden) => faltasDeBusqueda(orden).map((m) => `${f} ${j} paso ${k + 1}: ${m}`))));
    });
    expect(malos, "Copia la búsqueda de flujo-semanal.yml: --author \"app/github-actions\" y --jq \"map(select(.title==\\\"$titulo\\\"))[0].number // empty\"").toEqual([]);
  });
  it("hay workflows que buscan su issue (si no, la regla anterior no mira nada)", () => {
    const con = ficheros.filter((f) => {
      const wf = parseDocument(readFileSync(join(RAIZ, f), "utf8")).toJS() ?? {};
      return Object.values(wf.jobs ?? {}).some((job) => (job.steps ?? []).some((p) => busquedasDeIssue(p.run ?? "").length > 0));
    });
    expect(con.length).toBeGreaterThanOrEqual(4);
  });
  it("la regla de la búsqueda de issue distingue autor y título exacto", () => {
    const soloTitulo = 'issue=$(gh issue list --repo "$R" --state open \\\n  --search "\\"$titulo\\" in:title" --json number --jq \'.[0].number // empty\')';
    expect(busquedasDeIssue(soloTitulo)).toHaveLength(1);
    expect(faltasDeBusqueda(busquedasDeIssue(soloTitulo)[0])).toHaveLength(2);
    const sinExacto = 'gh issue list --author "app/github-actions" --search "\\"$t\\" in:title" --json number --jq \'.[0].number\'';
    expect(faltasDeBusqueda(sinExacto)).toEqual(["sin comparar el título exacto (select(.title==…) en el --jq)"]);
    const otroAutor = 'gh issue list --author "app/github-actions-falso" --json number,title --jq "map(select(.title==\\"$t\\"))[0].number"';
    expect(faltasDeBusqueda(otroAutor)).toHaveLength(1);
    const bueno = 'if ! n=$(gh issue list --repo "$R" --state open --author "app/github-actions" \\\n    --search "\\"$t\\" in:title" --json number,title \\\n    --jq "map(select(.title==\\"$t\\"))[0].number // empty"); then';
    expect(faltasDeBusqueda(busquedasDeIssue(bueno)[0])).toEqual([]);
    expect(faltasDeBusqueda("gh api 'search/issues?q=author:app/github-actions' --jq 'map(select(.title == \"x\"))'")).toEqual([]);
    expect(busquedasDeIssue('gh issue comment "$n" --body-file f\ngh issue create --title x')).toEqual([]);
  });
  it("la regla de la búsqueda de issue no se deja engañar por una negación, un OR ni un --json sin title", () => {
    const jq = ' --jq "map(select(.title==\\"$t\\"))[0].number"';
    const negado = `gh search issues "-author:app/github-actions in:title x" --json number,title${jq}`;
    expect(faltasDeBusqueda(negado)).toContain("sin filtro de autor del bot (--author app/github-actions)");
    const conOr = `gh issue list --author "app/github-actions" --search "x in:title OR author:otro" --json number,title${jq}`;
    expect(faltasDeBusqueda(conOr)).toEqual(["con OR en la consulta: abre la búsqueda a otros autores o títulos"]);
    const sinTitle = `gh issue list --author "app/github-actions" --search "x in:title" --json number${jq}`;
    expect(faltasDeBusqueda(sinTitle)).toEqual(["compara .title sin pedirlo en --json (sale null y nunca coincide)"]);
  });
  it("la búsqueda de issue también se ve por gh api (REST de issues y graphql con search)", () => {
    expect(busquedasDeIssue('n=$(gh api "repos/$GITHUB_REPOSITORY/issues?state=open" --jq ".[0].number")')).toHaveLength(1);
    expect(busquedasDeIssue("gh api repos/o/r/issues --paginate --jq '.[0].number'")).toHaveLength(1);
    expect(busquedasDeIssue("gh api graphql -f query='{ search(query: \"x in:title\", type: ISSUE, first: 1) { nodes { id } } }'")).toHaveLength(1);
    expect(busquedasDeIssue('gh api "repos/o/r/issues/$n/comments" --jq ".[].body"')).toEqual([]);
    expect(busquedasDeIssue("gh api graphql -f query='{ viewer { login } }'")).toEqual([]);
  });
  it("la regla del \\n suelto distingue las comillas", () => {
    expect(nSueltas("gh issue list --repo x \\n            --search y")).toHaveLength(1);
    expect(nSueltas("cmd a \\n")).toHaveLength(1);
    expect(nSueltas("printf '%s\\n' x")).toEqual([]);
    expect(nSueltas('echo "a\\nb" | jq -r ".x"')).toEqual([]);
    expect(nSueltas("gh issue list \\\n  --search y")).toEqual([]);
  });
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
