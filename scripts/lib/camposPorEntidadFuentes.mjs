/**
 * camposPorEntidadFuentes.mjs — lee del disco las fuentes que declara ops/campos-por-entidad.json
 * y las devuelve como listas de registros (#711). Solo lectura. La clasificación vive en
 * camposPorEntidad.mjs (pura); aquí solo está la entrada y salida de ficheros.
 *
 * Tipos de fuente (FUENTES): json (un fichero y el camino a sus registros), json-directorio
 * (cada .json de un directorio es un registro, o una lista de ellos), cabecera-md (la cabecera de
 * cada .md de un directorio, o del `fichero` de cada subcarpeta) y export-js (un export de un
 * módulo del repo, cuyos valores son los registros). Una fuente que no existe LANZA un error.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cabeceraMd, registrosDe } from "./camposPorEntidad.mjs";

export const RUTA_REGISTRO = "ops/campos-por-entidad.json";

export const FUENTES = Object.freeze({
  json: "Un JSON: `ruta` y, si no son la raíz, `registros` (camino con puntos y *)",
  "json-directorio": "Un directorio: cada .json es un registro o una lista de registros",
  "cabecera-md": "La cabecera de cada .md de `directorio` (o de su `fichero` en cada subcarpeta)",
  "export-js": "Un export de un módulo JS (`ruta`, `export`): sus valores son los registros",
});

const leerJson = (raiz, ruta) => JSON.parse(readFileSync(join(raiz, ruta), "utf8"));
const esObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Los registros de una fuente: { registros, ficheros } (cuántos ficheros se leyeron). */
export async function registrosDeFuente(raiz, fuente) {
  const t = fuente.tipo;
  if (t === "json") {
    const j = leerJson(raiz, fuente.ruta);
    const r = fuente.registros ? registrosDe(j, fuente.registros) : Array.isArray(j) ? j : [j];
    return { registros: r, ficheros: 1 };
  }
  if (t === "json-directorio") {
    const dir = join(raiz, fuente.directorio);
    const nombres = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
    if (!nombres.length) throw new Error(`${fuente.directorio}: ningún .json`);
    const r = [];
    for (const f of nombres) {
      const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
      r.push(...(Array.isArray(j) ? j : [j]));
    }
    return { registros: r, ficheros: nombres.length };
  }
  if (t === "cabecera-md") {
    const dir = join(raiz, fuente.directorio);
    const textos = [];
    for (const n of readdirSync(dir).sort()) {
      if (fuente.fichero) {
        if (statSync(join(dir, n)).isDirectory()) { try { textos.push(readFileSync(join(dir, n, fuente.fichero), "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; /* a propósito: una subcarpeta sin ese fichero no es una skill */ } }
      } else if (n.endsWith(".md")) textos.push(readFileSync(join(dir, n), "utf8"));
    }
    const r = textos.map(cabeceraMd).filter(Boolean);
    if (!r.length) throw new Error(`${fuente.directorio}: ninguna cabecera`);
    return { registros: r, ficheros: textos.length };
  }
  if (t === "export-js") {
    const m = await import(pathToFileURL(join(raiz, fuente.ruta)).href);
    if (!(fuente.export in m)) throw new Error(`${fuente.ruta}: no exporta ${fuente.export}`);
    const x = m[fuente.export];
    return { registros: Array.isArray(x) ? x : Object.values(x).filter(esObj), ficheros: 1 };
  }
  throw new Error(`fuente de tipo «${t}» desconocido (${Object.keys(FUENTES).join(", ")})`);
}

/** Una etiqueta corta de la fuente para las líneas de salida. */
export function nombreDeFuente(f) {
  return [f.ruta ?? f.directorio, f.registros ? `#${f.registros}` : ""].join("");
}
