/**
 * erroresTragados.mjs — encuentra los manejadores de error que se tragan el
 * error sin dejar aviso. Una sola fuente para todas las superficies (#177).
 *
 * Problema de fondo #177: un error que se calla no lo ve nadie. Pasó con la
 * limpieza de carpetas (#141): dejaba carpetas a medias y solo lo decía con
 * un `log()` que en silencio no imprime nada. La norma: ningún error se ignora
 * sin dejar aviso. Tragarse uno a propósito se puede, pero dejándolo escrito.
 *
 * ── API ──────────────────────────────────────────────────────────────────
 *   erroresTragados(src, { jsx = false } = {})
 *     → [{ linea, texto }]  los de un fuente; `texto` es la línea del
 *       manejador, recortada a 100 caracteres. Si el fuente no se puede
 *       analizar, LANZA (un fichero ilegible no se da por limpio).
 *
 *   erroresTragadosEn(carpetas, { raiz, excluir } = {})
 *     → { tragados: [{ fichero, linea, texto }], ilegibles: [{ fichero, error }] }
 *       Recorre las carpetas (relativas a `raiz`, por defecto la del repo) con
 *       sus subcarpetas: .js, .mjs, .cjs y .jsx, sin los tests (*.test.*) ni
 *       node_modules. `excluir(rutaRelativa)` → true deja fuera un fichero.
 *       `fichero` va relativo a `raiz` y con barras /.
 *
 *   Quien la use (scripts/sinErroresTragados.test.js para scripts/ y
 *   .claude/hooks/; el bot, cuando se una el suyo) pone su lista de conocidos
 *   por fichero y `texto`, y comprueba que solo baja.
 *
 * ── Qué es un manejador ──────────────────────────────────────────────────
 *   - el bloque de un `try { … } catch (e) { … }`;
 *   - el argumento de `.catch(f)` y el segundo de `.then(ok, f)`, sea flecha,
 *     `function () {}`, un nombre (`noop`, resuelto si está en el fichero) o
 *     `console.log`.
 *
 * ── Cuándo se traga el error ─────────────────────────────────────────────
 * Cuando todo lo que hace es callar:
 *   - nada (vacío);
 *   - devolver, asignar o declarar un valor que no nombra el error: literales
 *     (de varias líneas también), `({})`, `[]`, `new Map()`,
 *     `Promise.resolve(x)`, una variable…;
 *   - `continue` o `break`;
 *   - llamar solo a `console.log`, `console.info`, `console.debug`, a un
 *     `log`/`debug` local (en silencio no imprimen: la forma de #141) o a
 *     `process.exit(0)`.
 * Cualquier otra cosa (una llamada que hace algo, un `if`, usar el error) no
 * cuenta como tragado.
 *
 * ── Qué lo salva ─────────────────────────────────────────────────────────
 *   - un aviso en el manejador: `console.warn`, `console.error`,
 *     `process.stderr.write`, `avisos.push`, o relanzar (`throw`);
 *   - un COMENTARIO `a propósito: <porqué>` dentro del manejador (en una
 *     cadena no vale; sin porqué tampoco).
 *
 * Analiza el árbol con espree, el parser de ESLint (llega con `eslint`, que es
 * devDependency): un escáner de texto se quedaba ciego con una plantilla
 * anidada o una regex detrás de `return`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import * as espree from "espree";

const RAIZ_REPO = resolve(import.meta.dirname, "..", "..");
const A_PROPOSITO = /a prop[oó]sito:\s*[\p{L}\p{N}«"`]/iu;

const esNodo = (x) => x && typeof x === "object" && typeof x.type === "string";

/** Recorre el árbol; `visita(nodo, padre)`. Si devuelve false, no baja. */
function recorrer(nodo, visita, padre = null) {
  if (visita(nodo, padre) === false) return;
  for (const [k, v] of Object.entries(nodo)) {
    if (k === "parent" || k === "loc" || k === "range") continue;
    if (Array.isArray(v)) for (const h of v) esNodo(h) && recorrer(h, visita, nodo);
    else if (esNodo(v)) recorrer(v, visita, nodo);
  }
}

/** Nombres que declara un parámetro (`e`, `{ message }`, `[a, b]`). */
function nombresDe(patron, out = new Set()) {
  if (!patron) return out;
  recorrer(patron, (n) => {
    if (n.type === "Identifier") out.add(n.name);
  });
  return out;
}

/** ¿Nombra la expresión alguno de los nombres del error? */
function nombra(nodo, nombres) {
  if (!nombres.size || !nodo) return false;
  let si = false;
  recorrer(nodo, (n, padre) => {
    if (si) return false;
    if (n.type !== "Identifier" || !nombres.has(n.name)) return;
    // `x.e` o `{ e: 1 }` no nombran `e`
    if (padre?.type === "MemberExpression" && padre.property === n && !padre.computed) return;
    if (padre?.type === "Property" && padre.key === n && !padre.computed && !padre.shorthand) return;
    si = true;
  });
  return si;
}

const nombreDe = (callee) => {
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "MemberExpression" && !callee.computed) {
    const obj = nombreDe(callee.object);
    return obj ? `${obj}.${callee.property.name}` : null;
  }
  return null;
};

const AVISOS = new Set(["console.warn", "console.error", "process.stderr.write", "avisos.push"]);
const CALLAN = new Set(["console.log", "console.info", "console.debug", "log", "debug"]);

/** ¿Hay un aviso (o un throw) en algún sitio del nodo? */
function avisa(nodo) {
  let si = false;
  recorrer(nodo, (n) => {
    if (si) return false;
    if (n.type === "ThrowStatement") si = true;
    else if (n.type === "CallExpression" && AVISOS.has(nombreDe(n.callee))) si = true;
  });
  return si;
}

/** ¿Es una llamada que calla: un log que no avisa o `process.exit(0)`? */
function llamadaQueCalla(n) {
  if (n?.type !== "CallExpression") return false;
  const nombre = nombreDe(n.callee);
  if (CALLAN.has(nombre)) return true;
  if (nombre === "process.exit") {
    const a = n.arguments[0];
    return !a || (a.type === "Literal" && a.value === 0);
  }
  return false;
}

/** ¿Es un valor que no nombra el error (sin hacer nada más)? */
function esValor(n, nombres) {
  if (!n) return true;
  if (nombra(n, nombres)) return false;
  switch (n.type) {
    case "Literal":
    case "Identifier":
    case "ThisExpression":
    case "MemberExpression":
    case "TemplateLiteral":
    case "ArrowFunctionExpression":
    case "FunctionExpression":
      return n.type !== "TemplateLiteral" || n.expressions.every((e) => esValor(e, nombres));
    case "ArrayExpression":
      return n.elements.every((e) => !e || esValor(e.type === "SpreadElement" ? e.argument : e, nombres));
    case "ObjectExpression":
      return n.properties.every((p) => esValor(p.type === "SpreadElement" ? p.argument : p.value, nombres));
    case "UnaryExpression":
      return esValor(n.argument, nombres);
    case "BinaryExpression":
    case "LogicalExpression":
      return esValor(n.left, nombres) && esValor(n.right, nombres);
    case "ConditionalExpression":
      return esValor(n.consequent, nombres) && esValor(n.alternate, nombres);
    case "NewExpression":
      return n.arguments.every((a) => esValor(a, nombres));
    case "AwaitExpression":
      return esValor(n.argument, nombres);
    case "CallExpression":
      // Promise.resolve(x) es un valor; cualquier otra llamada hace algo.
      return nombreDe(n.callee) === "Promise.resolve" && n.arguments.every((a) => esValor(a, nombres));
    default:
      return false;
  }
}

/** ¿Solo calla esta expresión (usada como sentencia o como cuerpo de flecha)? */
function expresionQueCalla(n, nombres) {
  if (n.type === "SequenceExpression") return n.expressions.every((e) => expresionQueCalla(e, nombres));
  if (n.type === "AssignmentExpression") return esValor(n.right, nombres);
  if (n.type === "UpdateExpression") return true;
  if (llamadaQueCalla(n)) return true;
  if (n.type === "AwaitExpression") return expresionQueCalla(n.argument, nombres);
  return esValor(n, nombres);
}

/** ¿Solo calla esta sentencia? */
function sentenciaQueCalla(s, nombres) {
  switch (s.type) {
    case "EmptyStatement":
    case "ContinueStatement":
    case "BreakStatement":
      return true;
    case "BlockStatement":
      return s.body.every((x) => sentenciaQueCalla(x, nombres));
    case "ReturnStatement":
      return esValor(s.argument, nombres) || llamadaQueCalla(s.argument);
    case "VariableDeclaration":
      return s.declarations.every((d) => esValor(d.init, nombres));
    case "ExpressionStatement":
      return expresionQueCalla(s.expression, nombres);
    default:
      return false;
  }
}

/** ¿Se traga el error este cuerpo, con estos nombres para el error? */
function cuerpoTraga(cuerpo, nombres) {
  if (avisa(cuerpo)) return false;
  if (cuerpo.type === "BlockStatement") return cuerpo.body.every((s) => sentenciaQueCalla(s, nombres));
  return expresionQueCalla(cuerpo, nombres); // flecha con cuerpo de expresión
}

function analizar(src, jsx) {
  const opciones = { ecmaVersion: "latest", range: true, loc: true, comment: true, ecmaFeatures: { jsx } };
  try {
    return espree.parse(src, { ...opciones, sourceType: "module" });
  } catch (e) {
    // a propósito: un .cjs o un script viejo no es módulo; se reintenta como script y, si tampoco, lanza
    try {
      // CommonJS admite un `return` fuera de función
      return espree.parse(src, { ...opciones, sourceType: "script", ecmaFeatures: { jsx, globalReturn: true } });
    } catch {
      throw e;
    }
  }
}

/** Los manejadores que se tragan el error en `src`. Lanza si no se puede analizar. */
export function erroresTragados(src, { jsx = false } = {}) {
  const ast = analizar(src, jsx);
  const lineas = src.split(/\r?\n/);
  const comentarios = ast.comments.filter((c) => A_PROPOSITO.test(c.value));
  const aProposito = ([a, b]) => comentarios.some((c) => c.range[0] >= a && c.range[1] <= b);

  // Funciones con nombre del propio fichero, para `.catch(noop)`.
  const funciones = new Map();
  recorrer(ast, (n) => {
    if (n.type === "FunctionDeclaration" && n.id) funciones.set(n.id.name, n);
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && /Function/.test(n.init?.type ?? "")) funciones.set(n.id.name, n.init);
  });

  const hallados = [];
  const apunta = (nodo) => {
    const l = nodo.loc.start.line;
    hallados.push({ linea: l, texto: lineas[l - 1].trim().slice(0, 100) });
  };

  /** ¿Se traga el error este argumento de .catch / .then? */
  const manejadorTraga = (f) => {
    if (!f) return false;
    if (f.type === "ArrowFunctionExpression" || f.type === "FunctionExpression") {
      return cuerpoTraga(f.body, nombresDe(f.params[0]));
    }
    const nombre = nombreDe(f);
    if (AVISOS.has(nombre)) return false;
    if (CALLAN.has(nombre)) return true;
    if (f.type === "Identifier") {
      const fn = funciones.get(f.name);
      if (fn) return cuerpoTraga(fn.body, nombresDe(fn.params[0]));
      return /^(noop|nada|ignora[r]?|ignore)$/i.test(f.name);
    }
    return false;
  };

  recorrer(ast, (n) => {
    if (n.type === "CatchClause") {
      if (!aProposito(n.body.range) && cuerpoTraga(n.body, nombresDe(n.param))) apunta(n);
    } else if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && !n.callee.computed) {
      const metodo = n.callee.property.name;
      const f = metodo === "catch" ? n.arguments[0] : metodo === "then" ? n.arguments[1] : null;
      // El comentario vale dentro de los paréntesis de la llamada.
      if (f && !aProposito([n.callee.range[1], n.range[1]]) && manejadorTraga(f)) apunta(f);
    }
  });
  return hallados.sort((a, b) => a.linea - b.linea);
}

const EXTENSIONES = new Set([".js", ".mjs", ".cjs", ".jsx"]);

function ficheros(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : ficheros(ruta);
    return EXTENSIONES.has(extname(e.name)) && !/\.test\.[cm]?jsx?$/.test(e.name) ? [ruta] : [];
  });
}

/** Recorre carpetas (relativas a `raiz`). Ver la API en la cabecera. */
export function erroresTragadosEn(carpetas, { raiz = RAIZ_REPO, excluir = () => false } = {}) {
  const tragados = [];
  const ilegibles = [];
  for (const carpeta of carpetas) {
    for (const ruta of ficheros(join(raiz, carpeta))) {
      const fichero = relative(raiz, ruta).split("\\").join("/");
      if (excluir(fichero)) continue;
      try {
        for (const h of erroresTragados(readFileSync(ruta, "utf8"), { jsx: ruta.endsWith(".jsx") })) tragados.push({ fichero, ...h });
      } catch (e) {
        ilegibles.push({ fichero, error: String(e.message).split("\n")[0] });
      }
    }
  }
  return { tragados, ilegibles };
}
