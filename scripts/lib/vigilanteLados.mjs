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

import { NO_ES_PROSA, calcular, nombraProyecto, nombraServicio, textoDe } from "./inventarioVertical.mjs";

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

/**
 * Estándares de agentes: cuántas tareas y reglas nombran el proyecto o un servicio suyo, leyendo TODOS los campos de
 * prosa (tarea, no_hace, fuente, porque, nota, ejemplos…, también dentro de listas), sin distinguir mayúsculas.
 * Devuelve { proyecto: [«agente/tarea · regla»], servicio: [...] }, con una cadena por cita.
 */
export function citasDeEstandares(est) {
  const tareas = [
    ...Object.entries(est.comunes ?? {}).map(([id, t]) => ({ ...t, id: `común/${id}` })),
    ...Object.entries(est.agentes ?? {}).flatMap(([a, v]) => (v.tareas ?? []).map((t) => ({ ...t, id: `${a}/${t.id}` }))),
  ];
  const fuera = [...NO_ES_PROSA, "accion", "origen", "ambitos", "n2", "reglas", "sujeto", "fuerza"];
  const res = { proyecto: [], servicio: [] };
  const mirar = (pieza, donde) => {
    const t = textoDe(pieza, fuera);
    if (nombraProyecto(t)) res.proyecto.push(donde);
    if (nombraServicio(t)) res.servicio.push(donde);
  };
  for (const t of tareas) {
    mirar(t, `${t.id} · (tarea)`);
    for (const r of t.reglas ?? []) mirar(r, `${t.id} · ${r.nombre}`);
  }
  return res;
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
  const est = citasDeEstandares(leerJson(raiz, "ops/estandares-agentes.json"));
  const medidas = { estandares_que_nombran_el_proyecto: est.proyecto.length, estandares_que_nombran_un_servicio: est.servicio.length, citas_de_entidad_horizontal_a_vertical: citas.entidadAEntidad.length, tests_de_la_casa_que_leen_homenu: inv.cifras.vigilanVertical, normas_horizontales_que_nombran_un_servicio: inv.cifras.normasConServicio };
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

/** Las subidas declaradas: { clave: { hasta, razon } } (vacío si no hay). */
export const leerDeclaradas = (raiz) => leerJson(raiz, RUTA_TECHOS).subida_declarada ?? {};

/**
 * Los techos no suben respecto a los de origin/staging (null si no se puede leer: no hay nada que comparar). Así un
 * fallo no se «arregla» subiendo el techo en el mismo PR. Una clave que staging no tiene cuenta como subida desde 0, y
 * no puede traer un techo mayor que su medida (si no, nace con holgura). La única excepción es una subida declarada
 * (`subida_declarada` en el fichero de techos) y solo si: (1) la declaración la añade este PR, es decir, staging NO la
 * tenía ya (`declaradasStaging`): una declaración fusionada caduca y no ampara una subida posterior; (2) lleva razón
 * que nombra un issue o PR (#n), de 20 letras o más; (3) su tope `hasta` no pasa de la medida actual (se sube porque
 * la medida subió, no por holgura) y el techo no pasa de `hasta`. Que la razón sea cierta es control del juez.
 */
export function fallosDeSubida(techos, deStaging, medidas = null, declaradas = {}, declaradasStaging = {}) {
  if (!deStaging) return [];
  const fallos = [];
  for (const [k, v] of Object.entries(techos)) {
    const nueva = !(k in deStaging);
    const base = deStaging[k] ?? 0;
    const d = declaradas[k];
    if (v > base) {
      const permitida = !!d && !Object.hasOwn(declaradasStaging ?? {}, k) && typeof d.razon === "string" && d.razon.length >= 20 && /#\d+/.test(d.razon)
        && Number.isInteger(d.hasta) && v <= d.hasta && (!medidas || !(k in medidas) || d.hasta <= medidas[k]);
      if (!permitida) fallos.push(nueva ? `«${k}»: clave nueva con techo ${v}, sube desde 0 sin subida declarada válida` : `«${k}»: el techo sube de ${base} a ${v} sin subida declarada válida (nueva en este PR, con #issue y tope ≤ la medida)`);
    }
    if (nueva && medidas && k in medidas && v > medidas[k]) fallos.push(`«${k}»: clave nueva con techo ${v} mayor que la medida ${medidas[k]}`);
  }
  return fallos;
}

/** Declaraciones nuevas de este PR (no estaban en staging) que no tienen sentido: staging ya alcanza su tope. */
export function declaracionesCaducadas(declaradas, deStaging, declaradasStaging = {}) {
  if (!deStaging) return [];
  return Object.entries(declaradas).filter(([k, d]) => !Object.hasOwn(declaradasStaging ?? {}, k) && (deStaging[k] ?? 0) >= d.hasta).map(([k]) => `«${k}»: staging ya tiene ${deStaging[k] ?? 0}, la declaración sobra`);
}
