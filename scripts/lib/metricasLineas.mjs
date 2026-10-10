/**
 * Las líneas `campo: valor` que emite el código (#480, fondo #479): de dónde sale
 * la lista que `ops/metricas.test.js` cruza con el registro `ops/metricas.json`.
 *
 * Dos lecturas, porque una sola no lo ve todo:
 *   - ESTÁTICA (`lineasDeFicheros`): recorre las cadenas de cada fichero con el
 *     parser de JavaScript (espree, el de ESLint) y se queda con las líneas que
 *     llevan dos o más pares `clave: ${…}`. Sigue los `import` relativos, así que
 *     una línea nueva en una librería que usa un script vigilado también sale.
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
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import * as espree from "espree";

/** Marca de una interpolación dentro de una cadena: no aparece en el código del repo. */
const HUECO = "\u0000";
const CLAVE = "[a-z][a-z0-9_]*";
const ANTES = "(?<![\\p{L}\\p{N}_`-])";
const PAR_ESTATICO = new RegExp(`${ANTES}(${CLAVE}): ${HUECO}`, "gu");
const PAR_TEXTO = new RegExp(`${ANTES}(${CLAVE}): (?=[^\\s:])`, "gu");

/** Las cadenas de un fuente (literales y plantillas, con las interpolaciones como HUECO) y sus imports. */
function cadenasEImports(fuente) {
  const ast = espree.parse(fuente, { ecmaVersion: "latest", sourceType: "module" });
  const cadenas = [];
  const imports = [];
  const recorrer = (n) => {
    if (!n || typeof n.type !== "string") return;
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(n.type) && n.source) imports.push(n.source.value);
    if (n.type === "ImportExpression" && n.source?.type === "Literal") imports.push(n.source.value);
    if (n.type === "TemplateLiteral") cadenas.push(n.quasis.map((q) => q.value.cooked ?? q.value.raw).join(HUECO));
    if (n.type === "Literal" && typeof n.value === "string") cadenas.push(n.value);
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(recorrer);
      else if (v && typeof v === "object") recorrer(v);
    }
  };
  recorrer(ast);
  return { cadenas, imports };
}

/** Firma y claves de una línea con HUECOs; null si no es contable (menos de dos pares). */
export function lineaEstatica(linea) {
  const pares = [...linea.matchAll(PAR_ESTATICO)];
  if (pares.length < 2) return null;
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
 * Las líneas contables de unos ficheros y de todo lo que importan (rutas relativas,
 * dentro de `raiz`, sin tests). → { ficheros: [ruta relativa], lineas: [{ emisor, firma, claves }] }
 */
export function lineasDeFicheros(raiz, raices) {
  const vistos = new Set();
  const cola = raices.map((r) => resolve(raiz, r));
  const lineas = [];
  while (cola.length) {
    const f = cola.shift();
    if (vistos.has(f)) continue;
    vistos.add(f);
    const { cadenas, imports } = cadenasEImports(readFileSync(f, "utf8"));
    for (const i of imports) {
      if (!i.startsWith(".")) continue;
      const r = resolve(dirname(f), i);
      if (existsSync(r) && !/\.test\.[cm]?js$/.test(r) && !relative(raiz, r).startsWith("..")) cola.push(r);
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
