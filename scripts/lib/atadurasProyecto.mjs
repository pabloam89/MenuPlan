/**
 * atadurasProyecto.mjs — las ataduras a un id de proyecto en lo de la casa (#710, programa #652; requisito de Pablo del
 * 14 oct 2026: la casa escala a cualquier número de proyectos). Lo de la casa (la factoría) no escribe el id de un
 * proyecto a mano: lo recorre en la lista única (`projects` de ops/entidades.json) o lo lee de un campo `project: <id>`.
 * Una atadura es una línea de un fichero de la casa que escribe el id de un proyecto como literal: entre comillas,
 * como carpeta (`proyectos/<id>`) o como argumento (`--proyecto <id>`). Se cuentan por línea, en tres grupos:
 *  - código: scripts/ (menos tests) y los hooks de .claude/ — son las ataduras reales, a arreglar;
 *  - registros: ops/**\/*.json — sus campos `"project": "<id>"` / `"proyecto": "<id>"` son legítimos (es el dato), el resto no;
 *  - tests: los *.test.js, que repiten un id como fixture; menos grave, pero a leer de la lista.
 * Solo cuentan los ficheros de zona factoría o mixta de ops/zonas.json: lo de la zona producto es de un proyecto y puede nombrarlo.
 * Las líneas de comentario no cuentan. Quedan fuera lo que ES el registro de proyectos (ops/entidades.json, ops/proyectos/, el registro de lados) y lo que
 * `ops/ataduras-proyecto.json` declara legítimo con su razón (un homónimo, p. ej. una palabra común que es también un id).
 * Puro salvo `medirAtaduras`, que lee el repo. Lo vigila ops/vigilante-lados.test.js con un techo que solo baja.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ficherosDeGit } from "../../ops/ficherosGit.js";
import { clasificar, compilar, leerZonas } from "./zonasProyecto.mjs";

export const RUTA_LEGITIMOS = "ops/ataduras-proyecto.json";
/** Los registros que SON la lista de proyectos o dicen de qué proyecto es cada pieza: nombrar un id es su trabajo. */
const REGISTROS_DE_PROYECTO = [/^ops\/entidades\.json$/, /^ops\/proyectos\//, /^ops\/lados-ficheros\.json$/, /^ops\/ataduras-proyecto\.json$/];

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** La expresión que reconoce un id escrito como literal. */
export function reDeId(id) {
  const x = escapar(id);
  return new RegExp(`["'\`]${x}["'\`]|proyectos/${x}(?![\\w-])|--proyecto[ =]${x}(?![\\w-])`);
}

/** Un campo de registro `"project": "<id>"` o `"proyecto": "<id>"`: es el dato, no una atadura. */
const esCampoDeRegistro = (linea) => /^\s*"(project|proyecto)"\s*:\s*"[^"]*"\s*,?\s*$/.test(linea);

/** Una línea de comentario de código: una atadura en un comentario es prosa, no código. */
const esComentario = (linea) => /^\s*(\/\/|\*|\/\*)/.test(linea);

/** A qué grupo cuenta un fichero (null si no es de la casa o no se mira). */
export function grupoDe(ruta) {
  if (REGISTROS_DE_PROYECTO.some((r) => r.test(ruta))) return null;
  if (/\.test\.(js|jsx|mjs)$/.test(ruta)) return /^(scripts|ops|\.claude)\//.test(ruta) ? "tests" : null;
  if (/^scripts\/.+\.(mjs|js)$/.test(ruta) || /^\.claude\/hooks\/.+\.mjs$/.test(ruta)) return "codigo";
  if (/^ops\/.+\.json$/.test(ruta)) return "registros";
  return null;
}

/**
 * Las ataduras de los ficheros dados. `ids`: los ids de la lista única; `legitimos`: [{fichero, razon}]; `leer(ruta)`: su
 * texto. Devuelve { codigo: [«fichero:línea → id»], registros: [...], tests: [...] }, ordenadas.
 */
export function atadurasAProyecto(ids, ficheros, leer, legitimos = [], zonaDe = () => "factoria") {
  const exentos = new Set(legitimos.map((l) => l.fichero));
  const res = { codigo: [], registros: [], tests: [] };
  const res_ = ids.map((id) => [id, reDeId(id)]);
  for (const f of ficheros) {
    const g = grupoDe(f);
    if (!g || exentos.has(f) || zonaDe(f) === "producto") continue;
    const lineas = leer(f).split("\n");
    lineas.forEach((l, i) => {
      if (g === "registros" ? esCampoDeRegistro(l) : esComentario(l)) return;
      for (const [id, re] of res_) if (re.test(l)) res[g].push(`${f}:${i + 1} → ${id}`);
    });
  }
  for (const g of Object.keys(res)) res[g].sort();
  return res;
}

/** Los legítimos declarados: [{fichero, razon}] (cada uno con una razón de verdad). */
export function leerLegitimos(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_LEGITIMOS), "utf8")).legitimos ?? [];
}

/** Mide el repo: las ataduras por grupo. */
export function medirAtaduras(raiz) {
  const ids = JSON.parse(readFileSync(join(raiz, "ops/entidades.json"), "utf8")).projects.map((p) => p.id);
  const zonas = compilar(leerZonas(raiz));
  return atadurasAProyecto(ids, ficherosDeGit(raiz), (f) => readFileSync(join(raiz, f), "utf8"), leerLegitimos(raiz), (f) => clasificar(f, zonas).zona);
}
