/**
 * vigilanteLados.mjs — el vigilante de lados (#710, programa #652; punto 7: «el vigilante primero»). Dos cosas:
 *  1. Ninguna pieza horizontal cita una vertical. Se mira por los campos `lado`/`project` de los registros y por las
 *     citas que ya son campos (norma → principio, relación de entidad → entidad, estándar → norma). Lo de las normas
 *     (lado y project de cada registro, estándares) ya lo vigila ops/uniones.test.js con `problemasDeProyectos` y
 *     `verticalesEnEstandares`: aquí se reutilizan, no se repiten.
 *  2. Los techos: las cifras del inventario (scripts/lib/inventarioVertical.mjs, que es quien clasifica) no suben, y
 *     cuando bajan hay que bajar el techo (ops/techos-lados.json). Así una sesión que añade una duda o una cita
 *     vertical lo ve en su PR, y las que la quitan dejan el techo fijado más abajo.
 * Puro salvo `medir`, que lee el repo con `calcular`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { calcular } from "./inventarioVertical.mjs";

export const RUTA_TECHOS = "ops/techos-lados.json";

const leerJson = (raiz, ruta) => JSON.parse(readFileSync(join(raiz, ruta), "utf8"));

/**
 * Citas de una pieza horizontal a una vertical. `datos`: { principiosVerticales: ids, normasHorizontales: [{id, principio}],
 * entidades: [{id, scope}], relaciones: [{from, to}] }. Devuelve { normaAPrincipio, entidadAEntidad } con una cadena por cita.
 */
export function citasAVertical(datos) {
  const vert = new Set(datos.principiosVerticales);
  const scope = new Map(datos.entidades.map((e) => [e.id, e.scope]));
  return {
    normaAPrincipio: datos.normasHorizontales.filter((n) => vert.has(n.principio)).map((n) => `${n.id} → principio ${n.principio}`),
    entidadAEntidad: datos.relaciones.filter((r) => scope.get(r.from) === "horizontal" && scope.get(r.to) === "vertical").map((r) => `${r.from} → ${r.to}`),
  };
}

/** Las cifras que llevan techo, con el nombre con que aparecen en ops/techos-lados.json. */
export function medir(raiz) {
  const inv = calcular(raiz);
  const filas = Object.fromEntries(inv.filas.map((f) => [f.unidad, f]));
  const ent = leerJson(raiz, "ops/entidades.json");
  const citas = citasAVertical({
    principiosVerticales: inv.cifras.principiosVerticales,
    normasHorizontales: [],
    entidades: ent.entities,
    relaciones: ent.relations,
  });
  const medidas = { citas_de_entidad_horizontal_a_vertical: citas.entidadAEntidad.length, tests_de_la_casa_que_leen_homenu: inv.cifras.vigilanVertical };
  for (const f of inv.filas) medidas[`duda: ${f.unidad}`] = f.duda;
  medidas["verticales sin registro propio: principios de la casa"] = filas["principios de la casa (ops/principios/)"].vertical;
  medidas["verticales sin registro propio: fuentes documentales"] = filas["fuentes documentales (ops/fuentes-documentales/)"].vertical;
  return medidas;
}

/**
 * Compara medidas con techos. Sube = fallo (una cita o una duda nueva); baja = fallo también, para que el techo baje con
 * ella y no vuelva a subir sin verse; una cifra sin techo o un techo sin cifra, fallo (nombre cambiado).
 */
export function fallosDeTechos(medidas, techos) {
  const fallos = [];
  for (const [k, v] of Object.entries(medidas)) {
    if (!(k in techos)) fallos.push(`«${k}» (${v}) no tiene techo en ${RUTA_TECHOS}`);
    else if (v > techos[k]) fallos.push(`«${k}» sube a ${v} (techo ${techos[k]}): ha entrado algo del otro lado o una duda nueva`);
    else if (v < techos[k]) fallos.push(`«${k}» baja a ${v}: baja su techo de ${techos[k]} a ${v} en ${RUTA_TECHOS}`);
  }
  for (const k of Object.keys(techos)) if (!(k in medidas)) fallos.push(`el techo «${k}» ya no se mide: quítalo de ${RUTA_TECHOS}`);
  return fallos;
}

/** Los techos que lee el test. */
export const leerTechos = (raiz) => leerJson(raiz, RUTA_TECHOS).techos;
