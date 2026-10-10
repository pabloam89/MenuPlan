/**
 * Catálogos partidos: un fichero por entrada (#505, fondo #504).
 *
 * Varias ramas editaban a la vez entradas distintas de un mismo JSON grande (la forja, el
 * glosario y sus excepciones) y chocaban al fusionar, aunque no tocaran lo mismo: git choca
 * cuando dos cambios caen en líneas vecinas. Partido en un fichero por entrada, dos ramas que
 * tocan entradas distintas tocan ficheros distintos.
 *
 * La carpeta ES la fuente; no hay fichero agregado (ni commiteado ni generado), así que no hay
 * copia que pueda divergir. Todo lector pasa por `leerCatalogo` (o por su lector de siempre,
 * `leerForja`, `leerGlosario`…, que la llaman).
 *
 * Forma de una carpeta:
 *   <carpeta>/_catalogo.json         el objeto entero, salvo las colecciones partidas, que llevan
 *                                    en su sitio una marca:
 *                                      { "$partida": "lista", "clave": "id" }
 *                                      { "$partida": "mapa" }
 *   <carpeta>/<coleccion>/<nombre>.json
 *                                    una entrada. En una lista, la entrada tal cual, y <nombre> sale
 *                                    de su `clave`; en un mapa, { "clave": k, "valor": v }, y
 *                                    <nombre> sale de k.
 *
 * El orden de las entradas de una colección es el de sus nombres de fichero, y no se guarda en
 * ningún sitio: una lista de orden en `_catalogo.json` volvería a ser el punto que todas las ramas
 * editan al añadir o borrar una entrada (revisión de #505). Ningún lector depende del orden de
 * estas colecciones: las vistas que generan (FORJA.md, plantillas) salen en el de los nombres.
 * Una marca con `orden` es un error.
 *
 * Nombres de fichero (`nombreDeFichero`): ASCII en minúsculas, sin tildes ni ñ (ñ → n), y todo lo
 * que no es letra, cifra o «_» pasa a «-». Dos claves que dan el mismo nombre (también por mayúsculas,
 * que Windows no distingue) son un error al leer, no una pisada.
 *
 * Para partir otro catálogo: `node scripts/catalogos.mjs --partir <fichero.json> <coleccion>...`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const INDICE = "_catalogo.json";

/** Los catálogos partidos: su carpeta (la fuente, con «/» final) y el fichero que eran antes. */
export const CATALOGOS = {
  forja: { carpeta: "ops/forja/", antes: "ops/forja.json" },
  glosario: { carpeta: "ops/glosario/", antes: "ops/glosario.json" },
  "glosario-excepciones": { carpeta: "ops/glosario-excepciones/", antes: "ops/glosario-excepciones.json" },
};

/** Ruta vieja → carpeta. Lo que en un texto o un dato decía el fichero viejo pasa a decir la carpeta. */
export const RENOMBRADOS = Object.fromEntries(Object.values(CATALOGOS).map((c) => [c.antes, c.carpeta]));

const RE_RENOMBRADOS = new RegExp(Object.keys(RENOMBRADOS).sort((a, b) => b.length - a.length).map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");

/** Una ruta vieja, a su carpeta (las demás, igual). */
export const renombrarRuta = (ruta) => RENOMBRADOS[ruta] ?? ruta;

/** Cambia, en cada texto de un valor JSON, la ruta vieja de un catálogo por su carpeta. */
export function renombrarRutas(valor) {
  if (typeof valor === "string") return valor.replace(RE_RENOMBRADOS, (r) => RENOMBRADOS[r]);
  if (Array.isArray(valor)) return valor.map(renombrarRutas);
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [renombrarRutas(k), renombrarRutas(v)]));
  return valor;
}

/** El nombre de fichero (sin «.json») de una clave: ASCII en minúsculas, sin tildes, «-» en lo que no es letra, cifra ni «_». */
export function nombreDeFichero(clave) {
  const n = String(clave).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "");
  if (!n) throw new Error(`la clave «${clave}» no da ningún nombre de fichero`);
  return n;
}

const esMarca = (v) => v && typeof v === "object" && !Array.isArray(v) && (v.$partida === "lista" || v.$partida === "mapa");
const aTexto = (v) => `${JSON.stringify(v, null, 2)}\n`;

/**
 * Compone el objeto de un catálogo a partir de sus ficheros. `ficheros` es un Map ruta relativa a
 * la carpeta (con «/») → texto. Lanza con un mensaje claro si algo no cuadra: un nombre que no es
 * el de su clave, dos claves con el mismo nombre, una marca con `orden`, un fichero suelto o
 * una colección sin marca.
 */
export function componer(ficheros, donde = "catálogo") {
  const leer = (ruta) => {
    try { return JSON.parse(ficheros.get(ruta)); } catch (e) { throw new Error(`${donde}${ruta}: no es JSON válido (${e.message})`, { cause: e }); }
  };
  if (!ficheros.has(INDICE)) throw new Error(`${donde}: falta ${INDICE}`);
  const indice = leer(INDICE);
  const usados = new Set([INDICE]);
  const fuera = {};
  for (const [seccion, v] of Object.entries(indice)) {
    if (!esMarca(v)) { fuera[seccion] = v; continue; }
    if ("orden" in v) throw new Error(`${donde}${INDICE}: ${seccion} lleva «orden»; el orden es el de los nombres de fichero (#505)`);
    const dir = `${nombreDeFichero(seccion)}/`;
    const entradas = new Map();
    for (const ruta of [...ficheros.keys()].filter((r) => r.startsWith(dir)).sort()) {
      const nombre = ruta.slice(dir.length);
      if (nombre.includes("/") || !nombre.endsWith(".json")) throw new Error(`${donde}${ruta}: en una colección solo van ficheros .json, sin subcarpetas`);
      const e = leer(ruta);
      usados.add(ruta);
      const clave = v.$partida === "lista" ? e?.[v.clave] : e?.clave;
      if (typeof clave !== "string" || !clave) throw new Error(`${donde}${ruta}: le falta su clave (${v.$partida === "lista" ? v.clave : "clave"})`);
      if (v.$partida === "mapa" && (Object.keys(e).length !== 2 || !("valor" in e))) throw new Error(`${donde}${ruta}: una entrada de mapa es { "clave", "valor" } y nada más`);
      if (`${nombreDeFichero(clave)}.json` !== nombre) throw new Error(`${donde}${ruta}: su clave «${clave}» pide el nombre ${nombreDeFichero(clave)}.json`);
      if (entradas.has(clave)) throw new Error(`${donde}${ruta}: la clave «${clave}» está repetida`);
      entradas.set(clave, v.$partida === "lista" ? e : e.valor);
    }
    const claves = [...entradas.keys()];
    fuera[seccion] = v.$partida === "lista" ? claves.map((k) => entradas.get(k)) : Object.fromEntries(claves.map((k) => [k, entradas.get(k)]));
  }
  const sueltos = [...ficheros.keys()].filter((r) => !usados.has(r));
  if (sueltos.length) throw new Error(`${donde}: ficheros que no son de ninguna colección: ${sueltos.join(", ")}`);
  return fuera;
}

/**
 * Parte un objeto en sus ficheros (Map ruta relativa → texto). `colecciones` es { seccion: clave }
 * para una lista (la clave es el campo que la identifica) o { seccion: null } para un mapa.
 * Inversa de `componer` salvo el orden de cada colección, que pasa a ser el de los nombres de fichero.
 */
export function partir(objeto, colecciones) {
  const ficheros = new Map();
  const indice = {};
  for (const [seccion, v] of Object.entries(objeto)) {
    if (!(seccion in colecciones)) { indice[seccion] = v; continue; }
    const clave = colecciones[seccion];
    const pares = clave ? v.map((e) => [e[clave], e]) : Object.entries(v);
    const dir = nombreDeFichero(seccion);
    const vistos = new Map();
    for (const [k, e] of pares) {
      const nombre = `${dir}/${nombreDeFichero(k)}.json`;
      if (vistos.has(nombre)) throw new Error(`«${k}» y «${vistos.get(nombre)}» dan el mismo fichero ${nombre}`);
      vistos.set(nombre, k);
      ficheros.set(nombre, aTexto(clave ? e : { clave: k, valor: e }));
    }
    indice[seccion] = clave ? { $partida: "lista", clave } : { $partida: "mapa" };
  }
  ficheros.set(INDICE, aTexto(indice));
  return new Map([...ficheros].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Los ficheros de una carpeta del disco, como Map ruta relativa (con «/») → texto. */
export function ficherosDeCarpeta(dir) {
  const fuera = new Map();
  const andar = (abs, rel) => {
    for (const n of readdirSync(abs).sort()) {
      const a = join(abs, n);
      if (statSync(a).isDirectory()) andar(a, `${rel}${n}/`);
      else fuera.set(`${rel}${n}`, readFileSync(a, "utf8"));
    }
  };
  andar(dir, "");
  return fuera;
}

/** ¿Es esta ruta del repo la carpeta de un catálogo partido? */
export const esCatalogo = (raiz, ruta) => existsSync(join(raiz, ruta, INDICE));

/** El objeto de un catálogo partido, leído del disco. */
export function leerCatalogo(raiz, carpeta) {
  return componer(ficherosDeCarpeta(join(raiz, carpeta)), carpeta);
}

/** Un JSON del repo, sea un fichero o la carpeta de un catálogo partido. */
export function leerJsonOCatalogo(raiz, ruta) {
  return esCatalogo(raiz, ruta) ? leerCatalogo(raiz, ruta) : JSON.parse(readFileSync(join(raiz, ruta), "utf8"));
}

/** El texto de una ruta del repo; el de un catálogo partido, su JSON compuesto (para buscar una clave en él). */
export function leerTexto(raiz, ruta) {
  return esCatalogo(raiz, ruta) ? `${JSON.stringify(leerCatalogo(raiz, ruta), null, 2)}\n` : readFileSync(join(raiz, ruta), "utf8");
}

/** Escribe en el disco los ficheros de `partir` (crea las carpetas). */
export function escribirPartido(raiz, carpeta, ficheros) {
  for (const [rel, texto] of ficheros) {
    const abs = join(raiz, carpeta, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, texto);
  }
}

const git = (raiz, args, input) => execFileSync("git", args, { cwd: raiz, windowsHide: true, stdio: "pipe", maxBuffer: 1 << 26, ...(input === undefined ? { encoding: "utf8" } : { input }) });

/** Los ficheros de una carpeta tal como está en una referencia de git (Map vacío si no está). */
export function ficherosEnReferencia(raiz, ref, carpeta) {
  const dir = carpeta.endsWith("/") ? carpeta : `${carpeta}/`;
  const lista = git(raiz, ["ls-tree", "-r", "-z", "--full-tree", ref, "--", dir]).split("\0").filter(Boolean).map((l) => {
    const [meta, ruta] = l.split("\t");
    return { oid: meta.split(" ")[2], ruta: ruta.slice(dir.length) };
  });
  if (!lista.length) return new Map();
  // Un solo proceso para todos los blobs: «cat-file --batch» da «<oid> blob <bytes>\n<contenido>\n» por cada uno.
  const salida = git(raiz, ["cat-file", "--batch"], `${lista.map((x) => x.oid).join("\n")}\n`);
  const fuera = new Map();
  let i = 0;
  for (const { oid, ruta } of lista) {
    const fin = salida.indexOf(10, i);
    const cabecera = salida.subarray(i, fin).toString("utf8").split(" ");
    if (cabecera[0] !== oid || cabecera[1] !== "blob") throw new Error(`git cat-file: esperaba el blob ${oid} de ${ruta} y llegó «${cabecera.join(" ")}»`);
    const bytes = Number(cabecera[2]);
    fuera.set(ruta, salida.subarray(fin + 1, fin + 1 + bytes).toString("utf8"));
    i = fin + 1 + bytes + 1;
  }
  return fuera;
}

/**
 * Un catálogo tal como está en una referencia (origin/staging, para los trinquetes), sea ya
 * partido o todavía en su fichero viejo (el PR que lo parte, y las ramas que salieron antes):
 * en ese caso, con las rutas ya renombradas, para que se compare con lo de hoy.
 * Devuelve null si no hay git, si la referencia no existe o si no tiene ni lo uno ni lo otro.
 */
export function catalogoEnReferencia(raiz, ref, nombre) {
  const c = CATALOGOS[nombre];
  if (!c) throw new Error(`«${nombre}» no es un catálogo partido: ${Object.keys(CATALOGOS).join(", ")}`);
  let ficheros, viejo = null;
  try {
    git(raiz, ["rev-parse", "--verify", "--quiet", ref]);
    ficheros = ficherosEnReferencia(raiz, ref, c.carpeta);
    if (!ficheros.size) viejo = git(raiz, ["show", `${ref}:${c.antes}`]);
  } catch {
    // a propósito: sin git, sin la referencia o sin el catálogo en ella, el trinquete que lo pide
    // se salta y lo dice; un catálogo roto en la referencia sí revienta (abajo, al componer).
    return null;
  }
  return viejo === null ? componer(ficheros, `${ref}:${c.carpeta}`) : renombrarRutas(JSON.parse(viejo));
}
