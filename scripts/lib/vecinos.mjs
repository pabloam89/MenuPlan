/**
 * vecinos.mjs — qué tests lanzar además de los del fichero que tocas (#356).
 *
 * La regla «lanza los tests de los ficheros que tocas» deja fuera a los tests
 * vigilantes de conjunto: los que miran TODOS los ficheros de una carpeta o de
 * un tipo. Un fichero o un texto nuevo rompe uno que está lejos, y el CI cae en
 * él (#356: sinErroresTragados por un catch nuevo; PR #424: rulesets, planos;
 * PR #446: rutas). La lista cerrada, con dueño, está en ops/vigilantes.json;
 * ops/vigilantes.test.js la vigila. Aquí, la lógica sin efectos (se prueba en
 * scripts/vecinos.test.js); el script que la lanza es scripts/vecinos.mjs.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RUTA_DATOS = "ops/vigilantes.json";
export const ES_TEST = /\.test\.(?:m?js|jsx)$/;

export function leerVigilantes(raiz = RAIZ) {
  return JSON.parse(readFileSync(join(raiz, RUTA_DATOS), "utf8"));
}

const escapar = (s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&");
const cacheRegex = new Map();

// Glob de rutas con «/» → RegExp: doble asterisco (con o sin barra detrás), asterisco, `?` y `{a,b}`.
export function globARegex(glob) {
  if (cacheRegex.has(glob)) return cacheRegex.get(glob);
  let r = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") { i++; r += "(?:.*/)?"; } else r += ".*";
      } else r += "[^/]*";
    } else if (c === "?") r += "[^/]";
    else if (c === "{") {
      const j = glob.indexOf("}", i);
      r += `(?:${glob.slice(i + 1, j).split(",").map(escapar).join("|")})`;
      i = j;
    } else r += escapar(c);
  }
  const re = new RegExp(`^${r}$`);
  cacheRegex.set(glob, re);
  return re;
}

export const casa = (globs, ruta) => (globs ?? []).some((g) => globARegex(g).test(ruta));

/** Faltas de forma de ops/vigilantes.json (vacío si está bien). */
export function faltasDeDatos(datos) {
  const f = [];
  const ids = new Set();
  const enVigilantes = new Set();
  const esTest = (t) => typeof t === "string" && ES_TEST.test(t);
  if (!Array.isArray(datos.conocidas) || !datos.conocidas.length) f.push("falta `conocidas`");
  for (const v of datos.vigilantes ?? []) {
    if (!v.id || ids.has(v.id)) f.push(`id repetido o vacío: ${v.id}`);
    ids.add(v.id);
    if (!Array.isArray(v.tests) || !v.tests.length || !v.tests.every(esTest)) f.push(`${v.id}: «tests» ha de ser una lista de ficheros *.test.*`);
    if (!Array.isArray(v.mira) || !v.mira.length) f.push(`${v.id}: «mira» vacío`);
    if (typeof v.porque !== "string" || v.porque.length < 25) f.push(`${v.id}: «porque» ha de explicar qué vigila (25 caracteres o más)`);
    for (const t of v.tests ?? []) {
      if (enVigilantes.has(t)) f.push(`${t}: está en dos grupos de vigilantes`);
      enVigilantes.add(t);
    }
  }
  const enExcepciones = new Set();
  for (const e of datos.excepciones ?? []) {
    if (!Array.isArray(e.tests) || !e.tests.length || !e.tests.every(esTest)) f.push("excepción sin «tests» válidos");
    if (typeof e.motivo !== "string" || e.motivo.length < 25) f.push(`excepción ${e.tests?.[0]}: «motivo» de 25 caracteres o más`);
    for (const t of e.tests ?? []) {
      if (enVigilantes.has(t)) f.push(`${t}: no puede ser vigilante y excepción a la vez`);
      if (enExcepciones.has(t)) f.push(`${t}: está en dos excepciones`);
      enExcepciones.add(t);
    }
  }
  for (const p of datos.pasos ?? []) {
    if (!p.id || !Array.isArray(p.cmd) || !p.cmd.length || !Array.isArray(p.mira) || !p.mira.length) f.push(`paso ${p.id}: id, mira y cmd son obligatorios`);
  }
  return f;
}

/** Ficheros del repo según git (versionados y nuevos sin ignorar). */
export function ficherosDelRepo(raiz = RAIZ) {
  const s = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: raiz, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return [...new Set(s.split("\0").filter(Boolean))].filter((f) => existsSync(join(raiz, f)));
}

/**
 * Lo tocado: la rama frente a su base con origin/staging más lo sin commitear
 * y lo nuevo. Cada elemento, { ruta, estado: "M" | "A" | "D" }; un renombrado
 * cuenta como borrado más alta.
 */
export function ficherosTocados(raiz = RAIZ) {
  const git = (args) => execFileSync("git", args, { cwd: raiz, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let base = "HEAD";
  try {
    base = git(["merge-base", "origin/staging", "HEAD"]).trim();
  } catch {
    // a propósito: sin origin/staging (no se ha hecho fetch) se compara con HEAD, y solo se ve lo sin commitear; se avisa en el script
  }
  const tocados = new Map();
  const partes = git(["diff", "--name-status", "--no-renames", "-z", base]).split("\0").filter(Boolean);
  for (let i = 0; i + 1 < partes.length; i += 2) tocados.set(partes[i + 1], partes[i][0]);
  for (const nuevo of git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)) tocados.set(nuevo, "A");
  return { base, tocados: [...tocados].map(([ruta, estado]) => ({ ruta, estado })).sort((a, b) => a.ruta.localeCompare(b.ruta)) };
}

const EXTENSIONES_IMPORT = ["", ".js", ".mjs", ".jsx", ".json", "/index.js"];

/** Rutas relativas que un test importa o cita con `new URL("./x", import.meta.url)`, ya resueltas contra la raíz. */
function importsDe(test, texto, existe) {
  const salida = new Set();
  const re = /(?:from\s*|import\s*\(\s*|import\s+|new URL\(\s*)["'](\.{1,2}\/[^"']+)["']/g;
  for (const m of texto.matchAll(re)) {
    const base = posix.normalize(posix.join(posix.dirname(test), m[1]));
    for (const ext of EXTENSIONES_IMPORT) if (existe(base + ext)) { salida.add(base + ext); break; }
  }
  return salida;
}

/** Índice de los tests del repo: { test → { texto, imports } }. */
export function indiceDeTests(raiz, ficheros) {
  const conjunto = new Set(ficheros);
  const indice = new Map();
  for (const t of ficheros.filter((f) => ES_TEST.test(f))) {
    const texto = readFileSync(join(raiz, t), "utf8");
    indice.set(t, { texto, imports: importsDe(t, texto, (r) => conjunto.has(r)) });
  }
  return indice;
}

/** Los tests propios de un fichero: él mismo si es test, el que se llama igual, los que lo importan o lo citan por ruta. */
export function propiosDe(ruta, indice) {
  const salida = [];
  if (ES_TEST.test(ruta)) return indice.has(ruta) ? [{ test: ruta, porque: "es el test que has tocado" }] : [];
  const dir = posix.dirname(ruta);
  const nombre = posix.basename(ruta).replace(/\.[^.]+$/, "");
  for (const [test, { texto, imports }] of indice) {
    if (posix.dirname(test) === dir && posix.basename(test).replace(/\.test\.[^.]+$/, "") === nombre) salida.push({ test, porque: `se llama igual que ${ruta}` });
    else if (imports.has(ruta)) salida.push({ test, porque: `importa ${ruta}` });
    else if (/\.(?:json|ya?ml|sql)$/.test(ruta) && !/^package(?:-lock)?\.json$/.test(ruta) && texto.includes(ruta)) salida.push({ test, porque: `cita ${ruta}` });
  }
  return salida;
}

const esConocida = (ruta, conocidas) => conocidas.some((c) => (c.endsWith("/") ? ruta.startsWith(c) : ruta === c));

/**
 * El plan: qué tests (propios y vigilantes), qué pasos del CI y qué ficheros no
 * se entienden. Sin efectos: recibe todo lo que necesita.
 *   tocados  [{ ruta, estado }]    datos  ops/vigilantes.json    indice  indiceDeTests
 */
export function elegir({ tocados, datos, indice }) {
  const tests = new Map();
  const anota = (test, tipo, porque) => {
    if (!indice.has(test)) return;
    const t = tests.get(test) ?? { test, tipos: new Set(), porque: [] };
    t.tipos.add(tipo);
    if (!t.porque.includes(porque)) t.porque.push(porque);
    tests.set(test, t);
  };
  const pasos = new Map();
  const sinEntender = [];
  for (const { ruta, estado } of tocados) {
    if (!esConocida(ruta, datos.conocidas)) sinEntender.push(ruta);
    if (estado !== "D") for (const p of propiosDe(ruta, indice)) anota(p.test, "propio", p.porque);
    else for (const p of propiosDe(ruta, indice)) if (!ES_TEST.test(ruta)) anota(p.test, "propio", `${p.porque} (borrado)`);
    for (const v of datos.vigilantes) {
      // Un test tocado solo activa a los vigilantes que nombran tests en su `mira`: el código que vigilan excluye los *.test.*
      if (ES_TEST.test(ruta) && !v.mira.some((g) => g.includes(".test."))) continue;
      const activa = estado === "D" ? casa(v.mira, ruta) || casa(v.borrados, ruta) : casa(v.mira, ruta);
      if (activa) for (const t of v.tests) anota(t, "vigilante", `vigilante ${v.id}: ${ruta}`);
    }
    if (estado !== "D") for (const p of datos.pasos ?? []) if (casa(p.mira, ruta)) pasos.set(p.id, p);
  }
  // Plan B: un fichero que no entiendo → los vigilantes más amplios.
  for (const ruta of sinEntender) for (const v of datos.vigilantes.filter((x) => x.amplio)) for (const t of v.tests) anota(t, "vigilante", `plan B (no entiendo ${ruta}): vigilante ${v.id}`);
  const lista = [...tests.values()].map((t) => ({ test: t.test, tipos: [...t.tipos], porque: t.porque })).sort((a, b) => a.test.localeCompare(b.test));
  return { tests: lista, pasos: [...pasos.values()], sinEntender };
}

/**
 * Búsqueda sistemática (no a ojo) de los tests que enumeran ficheros del repo:
 * los que leen carpetas o `git ls-files`, y los que importan un módulo (no test)
 * que lo hace. Devuelve [{ test, via }].
 */
export function detectarEnumeradores(raiz, ficheros) {
  const ENUMERA = /readdirSync|readdir\(|globSync|ls-files|ficherosDeGit/;
  const conjunto = new Set(ficheros);
  const salida = [];
  for (const t of ficheros.filter((f) => ES_TEST.test(f))) {
    const texto = readFileSync(join(raiz, t), "utf8");
    if (ENUMERA.test(texto)) { salida.push({ test: t, via: "directo" }); continue; }
    for (const mod of importsDe(t, texto, (r) => conjunto.has(r))) {
      if (ES_TEST.test(mod) || !/\.(?:m?js|jsx)$/.test(mod)) continue;
      if (ENUMERA.test(readFileSync(join(raiz, mod), "utf8"))) { salida.push({ test: t, via: mod }); break; }
    }
  }
  return salida;
}
