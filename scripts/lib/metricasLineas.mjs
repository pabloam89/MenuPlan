/**
 * Las líneas `campo: valor` que emite el código (#480, fondo #479): de dónde sale
 * la lista que `ops/metricas.test.js` cruza con el registro `ops/metricas.json`.
 *
 * Dos lecturas, porque una sola no lo ve todo:
 *   - ESTÁTICA (`lineasDeFicheros`): recorre las cadenas de cada fichero con el
 *     parser de JavaScript (espree, el de ESLint) y se queda con las líneas que
 *     llevan dos o más pares `clave: ${…}`, o una que empieza con `<palabra> <clave>: ${…}`
 *     (la cabecera de una línea montada por trozos). Lee entera una línea montada
 *     por trozos: una plantilla dentro de otra (también en un `cond ? `…` : ""` o un
 *     `a && `…``), una suma con `+`, un `[…].join(sep)` y lo acumulado con `+=`.
 *     Sigue los `import` relativos de JavaScript, así que una línea nueva en una
 *     librería que usa un script vigilado también sale. Las raíces pueden llevar `*`.
 *     Los comentarios no cuentan (el parser no los da como cadenas).
 *   - DINÁMICA (`lineasDeTexto`): sobre un texto ya escrito (el informe semanal),
 *     las líneas con dos o más pares `clave: valor`. Ve las líneas que se arman
 *     con claves de un objeto (`glosario ${…}`), que la estática no puede leer.
 *
 * La «firma» de una línea es su principio hasta la primera clave con valor
 * (`indicador`, `criterios skill`, `<x>: <x> criterio`): con ella se busca en el
 * registro. Las interpolaciones se escriben `<x>`.
 *
 * Solo la usan los tests: importa espree, que no está en el workflow semanal (sin `npm ci`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import * as espree from "espree";

/** Marca de una interpolación dentro de una cadena: no aparece en el código del repo. */
const HUECO = "\u0000";
const CLAVE = "[a-z][a-z0-9_]*";
const ANTES = "(?<![\\p{L}\\p{N}_`-])";
const PAR_ESTATICO = new RegExp(`${ANTES}(${CLAVE}): ${HUECO}`, "gu");
const PAR_TEXTO = new RegExp(`${ANTES}(${CLAVE}): (?=[^\\s:])`, "gu");

/** Las cadenas de un fuente (literales y plantillas, con las interpolaciones como HUECO) y sus imports. */
function cadenasEImports(fuente) {
  const ast = espree.parse(fuente, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } });
  const cadenas = [];
  const imports = [];
  // Lo que se acumula con `x += …` sobre una variable que empezó siendo texto: nombre → texto montado.
  const acumulados = new Map();
  const recorrer = (n, padre = null) => {
    if (!n || typeof n.type !== "string") return;
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(n.type) && n.source) imports.push(n.source.value);
    if (n.type === "ImportExpression" && n.source?.type === "Literal") imports.push(n.source.value);
    if (n.type === "TemplateLiteral" || (n.type === "Literal" && typeof n.value === "string")) cadenas.push(textoDe(n));
    // Una suma o un join de trozos se lee entera, además de cada trozo por su lado.
    if (n.type === "BinaryExpression" && n.operator === "+" && !(padre?.type === "BinaryExpression" && padre.operator === "+")) cadenas.push(textoDe(n));
    if (esJoin(n)) cadenas.push(textoDe(n));
    if (n.type === "VariableDeclarator" && n.id?.type === "Identifier" && n.init && esTexto(n.init)) acumulados.set(n.id.name, textoDe(n.init));
    if (n.type === "AssignmentExpression" && n.operator === "+=" && n.left.type === "Identifier") {
      const montado = (acumulados.get(n.left.name) ?? "") + textoDe(n.right);
      acumulados.set(n.left.name, montado);
      cadenas.push(montado);
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === "parent") continue;
      if (Array.isArray(v)) v.forEach((x) => recorrer(x, n));
      else if (v && typeof v === "object") recorrer(v, n);
    }
  };
  recorrer(ast);
  return { cadenas, imports };
}

const esJoin = (n) => n.type === "CallExpression" && n.callee?.type === "MemberExpression" && n.callee.property?.name === "join" && n.callee.object?.type === "ArrayExpression";
const esTexto = (n) => (n.type === "Literal" && typeof n.value === "string") || n.type === "TemplateLiteral" || (n.type === "BinaryExpression" && n.operator === "+" && (esTexto(n.left) || esTexto(n.right)));

/**
 * El texto de una expresión, con HUECO donde va un valor. Una plantilla dentro de otra
 * (`${cond ? ` skills: ${x}` : ""}` o `${a && `…`}`) se lee dentro de su madre: así se ven
 * las líneas montadas por trozos.
 */
function textoDe(n) {
  if (!n) return HUECO;
  if (n.type === "Literal" && typeof n.value === "string") return n.value;
  if (n.type === "TemplateLiteral") return n.quasis.map((q, i) => (q.value.cooked ?? q.value.raw) + (i < n.expressions.length ? trozo(n.expressions[i]) : "")).join("");
  if (n.type === "BinaryExpression" && n.operator === "+") return textoDe(n.left) + textoDe(n.right);
  if (esJoin(n)) {
    const sep = n.arguments[0]?.type === "Literal" && typeof n.arguments[0].value === "string" ? n.arguments[0].value : ",";
    return n.callee.object.elements.map((e) => (e ? textoDe(e) : "")).join(sep);
  }
  return HUECO;
}

/** Una interpolación: si es una plantilla (o un condicional que da una), su texto; si no, un valor. */
function trozo(n) {
  if (n.type === "TemplateLiteral" || esJoin(n)) return textoDe(n);
  if (n.type === "ConditionalExpression") {
    const lleno = [n.consequent, n.alternate].find((x) => esTexto(x) && textoDe(x).includes(":"));
    return lleno ? textoDe(lleno) : HUECO;
  }
  // `a && ` total: ${x}`` es un trozo de la línea; `x ?? "-"` es un valor con su defecto.
  if (n.type === "LogicalExpression" && n.operator === "&&" && esTexto(n.right) && textoDe(n.right).includes(":")) return textoDe(n.right);
  return HUECO;
}

/** Línea de un solo par que empieza con «<palabra> <clave>: ${…}» (la cabecera de una línea montada por trozos). */
const CABECERA = new RegExp(`^[a-z][\\w-]* ${CLAVE}: ${HUECO}`, "u");

/** Firma y claves de una línea con HUECOs; null si no es contable. */
export function lineaEstatica(linea) {
  const pares = [...linea.matchAll(PAR_ESTATICO)];
  if (pares.length < 2 && !(pares.length === 1 && CABECERA.test(linea))) return null;
  const fin = pares[0].index + pares[0][1].length;
  return { firma: linea.slice(0, fin).replaceAll(HUECO, "<x>").trim(), claves: [...new Set(pares.map((m) => m[1]))] };
}

/** Las líneas contables de un fuente, sin seguir imports: [{ firma, claves }]. */
export function lineasDeFuente(fuente) {
  return cadenasEImports(fuente).cadenas
    .flatMap((c) => c.split("\n"))
    .map((l) => lineaEstatica(l.trim()))
    .filter(Boolean);
}

/**
 * Las raíces, con `*` en el nombre del fichero (`scripts/*.mjs`): los ficheros que casan,
 * sin tests, ordenados. Una ruta sin `*` se queda tal cual.
 */
export function expandirRaices(raiz, raices) {
  return raices.flatMap((r) => {
    if (!r.includes("*")) return [r];
    const dir = dirname(r);
    const patron = new RegExp(`^${basename(r).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*")}$`);
    return readdirSync(join(raiz, dir)).filter((f) => patron.test(f) && !/\.test\.[cm]?js$/.test(f)).sort().map((f) => `${dir}/${f}`);
  });
}

/**
 * Las líneas contables de unos ficheros y de todo lo que importan (rutas relativas,
 * dentro de `raiz`, sin tests). → { ficheros: [ruta relativa], lineas: [{ emisor, firma, claves }] }
 */
export function lineasDeFicheros(raiz, raices) {
  const vistos = new Set();
  const cola = expandirRaices(raiz, raices).map((r) => resolve(raiz, r));
  const lineas = [];
  while (cola.length) {
    const f = cola.shift();
    if (vistos.has(f)) continue;
    vistos.add(f);
    let leido;
    try {
      leido = cadenasEImports(readFileSync(f, "utf8"));
    } catch (e) {
      throw new Error(`${relative(raiz, f)}: no se puede leer como módulo (${e.message})`, { cause: e });
    }
    const { cadenas, imports } = leido;
    for (const i of imports) {
      if (!i.startsWith(".")) continue;
      const r = resolve(dirname(f), i);
      // Solo código JavaScript: un import de JSON (catálogos) no emite líneas.
      if (existsSync(r) && /\.[cm]?jsx?$/.test(r) && !/\.test\.[cm]?js$/.test(r) && !relative(raiz, r).startsWith("..")) cola.push(r);
    }
    const emisor = relative(raiz, f).replaceAll("\\", "/");
    for (const l of cadenas.flatMap((c) => c.split("\n"))) {
      const x = lineaEstatica(l.trim());
      if (x) lineas.push({ emisor, ...x });
    }
  }
  return { ficheros: [...vistos].map((f) => relative(raiz, f).replaceAll("\\", "/")).sort(), lineas };
}

/** Las líneas contables de un texto ya escrito: [{ linea, claves }] (dos o más pares `clave: valor`). */
export function lineasDeTexto(texto) {
  return String(texto ?? "").split(/\r?\n/).map((l) => l.trim()).flatMap((linea) => {
    const claves = [...linea.matchAll(PAR_TEXTO)].map((m) => m[1]);
    return claves.length >= 2 ? [{ linea, claves: [...new Set(claves)] }] : [];
  });
}
