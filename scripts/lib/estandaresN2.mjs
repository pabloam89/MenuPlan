/**
 * El estándar de cada combinación acción × ámbitos (N2) de las tareas (#684, programa #652).
 *
 * Acuerdo del 13 oct 2026: cada combinación de acción y conjunto de ámbitos tiene UN estándar, que es una lista
 * fija de normas; la tarea apunta a su combinación por id (`n2`) y hereda esa lista. Hoy la tarea sigue llevando
 * además sus reglas propias, sus `normas` citadas y sus comunes: migrarlas es otro encargo.
 *
 * El dato vive en `ops/estandares-n2.json`, aparte de `ops/estandares-agentes.json`: es otra entidad (la comparten
 * tareas de agentes distintos) y así el catálogo de tareas, que ya es enorme, no crece. La lista de normas de cada
 * combinación es ESTÁTICA y versionada (se ve en el diff cuando una norma nueva entra en un estándar); la genera
 * `npm run estandar-n2 -- --escribir` con la misma consulta que usa la tarea (`normasPorConsulta`: ámbitos × acción,
 * y construir y juzgar consultan las dos), y `ops/estandares-n2.test.js` falla diciendo qué norma falta o sobra.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { accionesDeConsulta, normasPorConsulta, tareasDe } from "./estandaresAgentes.mjs";

export const RUTA_N2 = "ops/estandares-n2.json";

const COMENTARIO =
  "El estándar de cada combinación acción × ámbitos de las tareas (N2, #684, programa #652): una lista fija de ids de ops/normas.json. " +
  "Cada tarea de ops/estandares-agentes.json apunta a la suya por `n2`. La lista es estática y versionada; la genera `npm run estandar-n2 -- --escribir` " +
  "con la consulta ámbito × acción de scripts/lib/estandaresAgentes.mjs (construir y juzgar consultan las dos), y ops/estandares-n2.test.js " +
  "falla diciendo qué norma falta o sobra. Las `normas` citadas aparte y las comunes siguen en la tarea.";

/** El id de una combinación: la acción, un punto y los ámbitos ordenados con «+» (p. ej. `construir.code+infra`). */
export const idDeCombinacion = (accion, ambitos) => `${accion}.${[...(ambitos ?? [])].sort().join("+")}`;

/** Las combinaciones que piden las tareas: Map id → { accion, ambitos, tareas: ["agente/tarea", …] }, en orden de aparición. */
export function combinacionesDeTareas(datos) {
  const m = new Map();
  for (const { agente, tarea: t } of tareasDe(datos)) {
    const id = idDeCombinacion(t.accion, t.ambitos);
    if (!m.has(id)) m.set(id, { accion: t.accion, ambitos: [...(t.ambitos ?? [])].sort(), tareas: [] });
    m.get(id).tareas.push(`${agente}/${t.id}`);
  }
  return m;
}

/** Los ids de norma que dan unos ámbitos y una acción, en el orden del registro. */
export const normasDeCombinacion = (normas, accion, ambitos, deConsulta = accionesDeConsulta) =>
  normasPorConsulta(normas, ambitos, accion, deConsulta).map((n) => n.id);

/** El catálogo N2 que salen de las tareas y del registro de normas. */
export function generarN2(datos, normas) {
  const combinaciones = {};
  for (const [id, c] of combinacionesDeTareas(datos)) combinaciones[id] = { accion: c.accion, ambitos: c.ambitos, normas: normasDeCombinacion(normas, c.accion, c.ambitos) };
  return { $comentario: COMENTARIO, version: 1, combinaciones };
}

export const leerN2 = (raiz) => JSON.parse(readFileSync(join(raiz, RUTA_N2), "utf8"));
export const escribirN2 = (raiz, n2) => writeFileSync(join(raiz, RUTA_N2), JSON.stringify(n2, null, 2) + "\n");

/**
 * Errores del N2, una línea cada uno (lista vacía si está bien):
 *  - una combinación cuya lista no es la que dan su acción y sus ámbitos (dice qué norma falta y cuál sobra);
 *  - una combinación con norma que no existe, con id que no es el de su acción y ámbitos, o que ninguna tarea usa;
 *  - una tarea sin `n2`, con una que no existe, o que no coincide con su acción y sus ámbitos.
 * `deConsulta` se inyecta para ver el test fallar con otra consulta.
 */
export function problemasDeN2(n2, datos, normas, { deConsulta = accionesDeConsulta } = {}) {
  const malos = [];
  const combos = n2?.combinaciones ?? {};
  const ids = new Set((normas ?? []).map((n) => n.id));
  const usadas = new Set();
  for (const { agente, tarea: t } of tareasDe(datos)) {
    const donde = `${agente}/${t.id}`;
    if (!t.n2) { malos.push(`${donde}: no apunta a ninguna combinación (campo «n2»; le toca «${idDeCombinacion(t.accion, t.ambitos)}»)`); continue; }
    usadas.add(t.n2);
    if (!combos[t.n2]) { malos.push(`${donde}: apunta a la combinación «${t.n2}», que no está en ${RUTA_N2}`); continue; }
    if (t.n2 !== idDeCombinacion(t.accion, t.ambitos)) malos.push(`${donde}: su combinación es «${t.n2}» pero su acción y sus ámbitos dan «${idDeCombinacion(t.accion, t.ambitos)}»`);
  }
  for (const [id, c] of Object.entries(combos)) {
    if (id !== idDeCombinacion(c.accion, c.ambitos)) malos.push(`${id}: su id no es el de su acción y sus ámbitos (${idDeCombinacion(c.accion, c.ambitos)})`);
    if (!usadas.has(id)) malos.push(`${id}: ninguna tarea apunta a esta combinación`);
    const lista = c.normas ?? [];
    for (const x of lista) if (!ids.has(x)) malos.push(`${id}: cita la norma «${x}», que no está en ops/normas.json`);
    if (new Set(lista).size !== lista.length) malos.push(`${id}: repite una norma`);
    const debidas = normasDeCombinacion(normas, c.accion, c.ambitos, deConsulta);
    for (const x of debidas) if (!lista.includes(x)) malos.push(`${id}: falta la norma «${x}», que dan sus ámbitos (${c.ambitos.join(", ")}) × ${c.accion}`);
    for (const x of lista) if (ids.has(x) && !debidas.includes(x)) malos.push(`${id}: sobra la norma «${x}»: no la dan sus ámbitos (${c.ambitos.join(", ")}) × ${c.accion}`);
  }
  return malos;
}

/** Pone `n2` en cada tarea (tras `ambitos`) y devuelve el catálogo nuevo; no escribe. */
export function conN2EnTareas(datos) {
  const nuevo = structuredClone(datos);
  for (const ag of Object.values(nuevo.agentes ?? {})) {
    ag.tareas = ag.tareas.map((t) => {
      const fuera = {};
      for (const [k, v] of Object.entries(t)) {
        if (k === "n2") continue;
        fuera[k] = v;
        if (k === "ambitos") fuera.n2 = idDeCombinacion(t.accion, t.ambitos);
      }
      return fuera;
    });
  }
  return nuevo;
}

/** Las cifras: combinaciones, tareas por combinación y normas por combinación. */
export function contarN2(n2, datos) {
  const todas = tareasDe(datos);
  const porCombinacion = Object.entries(n2?.combinaciones ?? {}).map(([id, c]) => ({ id, normas: c.normas.length, tareas: todas.filter(({ tarea }) => tarea.n2 === id).length }));
  return { combinaciones: porCombinacion.length, tareas: porCombinacion.reduce((s, c) => s + c.tareas, 0), porCombinacion };
}
