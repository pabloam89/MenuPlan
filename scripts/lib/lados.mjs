/**
 * lados.mjs — el vigilante de lados (#710, programa #652): una pieza horizontal (vale para cualquier proyecto) no cita
 * una vertical (solo vale para un proyecto), y las dudas de clasificación solo bajan.
 *
 * Mide dos clases, las dos con un techo en ops/lados-techos.json que solo baja:
 *  - `dudas`: las piezas que el inventario (scripts/lib/inventarioVertical.mjs) no sabe asignar a un lado, por capa;
 *  - `citas`: una horizontal que cita una vertical, contada por tipo de cita.
 * Las comprobaciones son funciones puras: ops/lados.test.js las prueba con datos buenos y con datos rotos.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { calcular } from "./inventarioVertical.mjs";
import { cargarNormas } from "./normas.mjs";
import { clasificar, compilar, leerZonas } from "./zonasProyecto.mjs";

export const RUTA_TECHOS = "ops/lados-techos.json";

/** Palabras que nombran un proyecto concreto (no «casa» ni «bot», castellano corriente de la factoría). */
const NOMBRA_PROYECTO = /\b(HoMenu|MenuPlan|Lola|homenu)\b/;

const leer = (raiz, ruta) => JSON.parse(readFileSync(join(raiz, ruta), "utf8"));
const jsonsDe = (raiz, dir) => readdirSync(join(raiz, dir)).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort().map((f) => leer(raiz, `${dir}/${f}`));
const leerFuentes = (raiz) => jsonsDe(raiz, "ops/fuentes-documentales/fuentes");
const leerPrincipios = (raiz) => jsonsDe(raiz, "ops/principios/principios");
const textoDeRegla = (r) => [r.nombre, r.exigencia, r.porque, r.nota, r.ejemplo_bueno, r.ejemplo_malo].filter(Boolean).join(" ");

/** Todas las tareas de los estándares, comunes y de cada agente, con las reglas de cada una. */
function tareasDeEstandares(est) {
  const comunes = Object.entries(est.comunes ?? {}).map(([id, t]) => ({ id: `común/${id}`, ...t }));
  const deAgentes = Object.entries(est.agentes ?? {}).flatMap(([a, v]) => (v.tareas ?? []).map((t) => ({ id: `${a}/${t.id}`, ...t })));
  return [...comunes, ...deAgentes];
}

/**
 * Cuenta las dudas por capa y las citas de una horizontal a una vertical. Devuelve { dudas, citas, detalle }: `detalle`
 * lista las citas una a una (para el mensaje del fallo).
 */
export function medirLados(raiz) {
  const inv = calcular(raiz);
  const dudas = {};
  for (const d of inv.dudosos) dudas[d.capa] = (dudas[d.capa] ?? 0) + 1;

  const carga = cargarNormas(raiz);
  const decisiones = leer(raiz, "ops/inventario-vertical.json");
  const idsVerticales = new Set(Object.values(carga.delProyecto).flat().map((n) => n.id));
  const principiosVerticales = new Set(Object.keys(decisiones.principios_verticales ?? {}));
  const zonas = compilar(leerZonas(raiz));
  const detalle = { estandar_nombra_proyecto: [], estandar_recibe_norma_vertical: [], norma_cita_principio_vertical: [], norma_nombra_proyecto: [], principio_cita_fuente_de_proyecto: [] };

  // Estándares: una regla horizontal no nombra el proyecto, y una tarea no lista una norma vertical.
  for (const t of tareasDeEstandares(leer(raiz, "ops/estandares-agentes.json"))) {
    for (const r of t.reglas ?? []) if (NOMBRA_PROYECTO.test(textoDeRegla(r))) detalle.estandar_nombra_proyecto.push(`${t.id} · ${r.nombre}`);
    for (const n of t.normas ?? []) if (idsVerticales.has(n)) detalle.estandar_recibe_norma_vertical.push(`${t.id} → ${n}`);
  }

  // Normas horizontales: ni citan un principio vertical ni nombran el proyecto.
  for (const n of carga.horizontales) {
    if (principiosVerticales.has(n.principio)) detalle.norma_cita_principio_vertical.push(`${n.id} → ${n.principio}`);
    if (NOMBRA_PROYECTO.test([n.nombre, n.exigencia, n.condicion].filter(Boolean).join(" "))) detalle.norma_nombra_proyecto.push(n.id);
  }

  // Principios que no son verticales cuya fuente de la casa vive en una ruta de producto (zona «producto»).
  const fuentes = new Map(leerFuentes(raiz).map((f) => [f.id, f]));
  for (const p of leerPrincipios(raiz)) {
    if (principiosVerticales.has(p.id)) continue;
    for (const s of p.fuentes ?? []) {
      const f = fuentes.get(s.fuente);
      if (f?.tipo === "casa" && clasificar(f.ruta, zonas).zona === "producto") detalle.principio_cita_fuente_de_proyecto.push(`${p.id} → ${f.id}`);
    }
  }

  const citas = Object.fromEntries(Object.entries(detalle).map(([k, v]) => [k, v.length]));
  return { dudas, citas, detalle };
}


/**
 * Contra los techos: ninguna cifra pasa de su techo, y un techo que sobra (la cifra bajó) hay que bajarlo, para que
 * el techo solo baje y no deje holgura. Una cifra sin techo, o un techo sin cifra, también falla.
 */
export function fallosDeTechos(medida, techos) {
  const fallos = [];
  for (const clase of ["dudas", "citas"]) {
    const m = medida[clase] ?? {};
    const t = techos[clase] ?? {};
    for (const k of new Set([...Object.keys(m), ...Object.keys(t)])) {
      const hoy = m[k] ?? 0;
      if (!(k in t)) fallos.push(`${clase}.${k}: hay ${hoy} y no tiene techo en ${RUTA_TECHOS}`);
      else if (hoy > t[k]) fallos.push(`${clase}.${k}: ${hoy} pasa del techo ${t[k]}`);
      else if (hoy < t[k]) fallos.push(`${clase}.${k}: hay ${hoy} y el techo es ${t[k]}; bájalo a ${hoy}`);
    }
  }
  return fallos;
}

/** Los techos no suben respecto a la versión de origin/staging (null si no se puede leer: no hay nada que comparar). */
export function fallosDeSubida(techos, deStaging) {
  if (!deStaging) return [];
  const fallos = [];
  for (const clase of ["dudas", "citas"]) {
    for (const [k, v] of Object.entries(deStaging[clase] ?? {})) {
      if ((techos[clase]?.[k] ?? 0) > v) fallos.push(`${clase}.${k}: el techo sube de ${v} a ${techos[clase][k]}`);
    }
  }
  return fallos;
}
