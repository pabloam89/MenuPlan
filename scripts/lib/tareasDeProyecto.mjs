/**
 * Las tareas de un proyecto (#710, programa #652). Pablo decidió el 13 oct 2026 que toda norma, también las verticales, llega
 * al estándar de una tarea de un agente. Una tarea GENERAL vive en el agente (ops/estandares-agentes.json) y no nombra ningún
 * proyecto; las normas del proyecto le llegan por referencia, con `npm run estandar -- <agente> <tarea> --proyecto <id>`. Una
 * tarea que solo existe en un proyecto vive en su registro, ops/proyectos/<id>/tareas.json, y la hace un agente del catálogo:
 *
 *   { project, agentes: { <agente>: { tareas: [{ id, tarea, accion, ambitos, no_hace }] } } }
 *
 * No lleva reglas propias: su estándar son las normas del proyecto que le llegan por su ámbito y su acción o que cita en `normas`
 * (por id; con eso, `ambitos` puede ir vacío y la tarea recibe solo las que cita: dos tareas del mismo ámbito no se pasan todas las normas). Solo se ve con
 * `--proyecto <id>` y no entra en ningún estándar horizontal ni en los .md de los agentes. Su texto sigue lo mismo que el de
 * la Base: `tarea` es del tipo «norma» de ops/topes.json (lo mide `npm run topes`).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { AMBITOS } from "./ambitos.mjs";
import { normasDeTarea, tareasDe } from "./estandaresAgentes.mjs";
import { RUTA_PROYECTOS } from "./normas.mjs";

export const rutaTareasDeProyecto = (id) => `${RUTA_PROYECTOS}/${id}/tareas.json`;
export const CAMPOS_TAREA_DE_PROYECTO = ["id", "tarea", "accion", "ambitos", "normas", "no_hace"];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Los registros de tareas de proyecto que hay: { <id>: registro }. */
export function leerTareasDeProyecto(raiz, ids) {
  const fuera = {};
  for (const id of ids) {
    const ruta = join(raiz, rutaTareasDeProyecto(id));
    if (existsSync(ruta)) fuera[id] = JSON.parse(readFileSync(ruta, "utf8"));
  }
  return fuera;
}

/** El catálogo con las tareas de un proyecto sumadas a las de su agente (copia; cada una marcada con `proyecto`). */
export function conTareasDeProyecto(datos, registro) {
  if (!registro) return datos;
  const nuevo = structuredClone(datos);
  for (const [agente, ag] of Object.entries(registro.agentes ?? {})) {
    if (!nuevo.agentes[agente]) continue;
    nuevo.agentes[agente].tareas.push(...(ag.tareas ?? []).map((t) => ({ ...t, proyecto: registro.project })));
  }
  return nuevo;
}

/**
 * Errores de las tareas de un proyecto, una línea cada uno (lista vacía si está bien): el registro de su carpeta y su proyecto,
 * un agente que existe, los campos, el id único, la acción y los ámbitos del vocabulario, y que cada tarea reciba al menos una
 * norma del proyecto (una tarea sin norma no tiene estándar). `normas`: todas; `dominios`: los opcionales que declara el proyecto.
 */
export function problemasDeTareasDeProyecto(registro, id, { datos, normas, proyectos, dominios }) {
  const malos = [];
  const ruta = rutaTareasDeProyecto(id);
  if (!proyectos.includes(id)) malos.push(`${ruta}: «${id}» no es un proyecto con normas (${proyectos.join(", ")})`);
  if (registro?.project !== id) malos.push(`${ruta}: su «project» es «${registro?.project}» y la carpeta es «${id}»`);
  for (const k of Object.keys(registro ?? {})) if (!["$comentario", "version", "project", "agentes"].includes(k)) malos.push(`${ruta}: campo «${k}» no admitido`);
  const horizontales = new Set(tareasDe(datos).map((x) => `${x.agente}/${x.tarea.id}`));
  const vistas = new Set();
  const conProyecto = conTareasDeProyecto(datos, registro);
  for (const [agente, ag] of Object.entries(registro?.agentes ?? {})) {
    if (!(agente in (datos?.agentes ?? {}))) { malos.push(`${ruta}: el agente «${agente}» no está en ops/estandares-agentes.json`); continue; }
    for (const k of Object.keys(ag ?? {})) if (k !== "tareas") malos.push(`${ruta} · ${agente}: campo «${k}» no admitido (un agente solo lleva tareas)`);
    for (const t of ag?.tareas ?? []) {
      const d = `${agente}/${t?.id ?? "(sin id)"} (proyecto ${id})`;
      for (const c of Object.keys(t ?? {})) if (!CAMPOS_TAREA_DE_PROYECTO.includes(c)) malos.push(`${d}: campo «${c}» no admitido`);
      if (typeof t?.id !== "string" || !ID.test(t.id)) malos.push(`${d}: el id va en minúsculas con guiones`);
      else if (horizontales.has(`${agente}/${t.id}`)) malos.push(`${d}: el id ya es una tarea general de ${agente}; una tarea general no se repite en el proyecto`);
      else if (vistas.has(`${agente}/${t.id}`)) malos.push(`${d}: id repetido`);
      else vistas.add(`${agente}/${t.id}`);
      if (typeof t?.tarea !== "string" || t.tarea.trim().length < 20) malos.push(`${d}: «tarea» dice qué se hace, en una frase`);
      if (!(t?.accion in (datos?.acciones ?? {}))) malos.push(`${d}: acción «${t?.accion}» fuera del vocabulario (${Object.keys(datos?.acciones ?? {}).join(", ")})`);
      const cita = t?.normas !== undefined;
      if (cita && (!Array.isArray(t.normas) || !t.normas.length)) malos.push(`${d}: «normas» es una lista de ids de normas del proyecto`);
      if (Array.isArray(t?.normas)) {
        for (const n of t.normas) {
          const norma = normas.find((x) => x.id === n);
          if (!norma || norma.project !== id) malos.push(`${d}: la norma «${n}» no es una norma del proyecto ${id}`);
          else if (t?.accion in (datos?.acciones ?? {}) && !norma.acciones.includes(t.accion)) malos.push(`${d}: la norma «${n}» no se aplica al «${t.accion}» (${norma.acciones.join(", ")})`);
        }
      }
      if (!Array.isArray(t?.ambitos) || (!t.ambitos.length && !(Array.isArray(t.normas) && t.normas.length))) malos.push(`${d}: «ambitos» es una lista de ámbitos (${Object.keys(AMBITOS).join(", ")}) o, vacía, la tarea cita sus «normas»`);
      else {
        for (const a of t.ambitos) if (!(a in AMBITOS)) malos.push(`${d}: ámbito «${a}» fuera del vocabulario`);
        if (new Set(t.ambitos).size !== t.ambitos.length) malos.push(`${d}: repite un ámbito`);
      }
      if (!Array.isArray(t?.no_hace) || !t.no_hace.length || t.no_hace.some((x) => typeof x !== "string" || !x.trim())) malos.push(`${d}: «no_hace» es una lista de lo que queda fuera`);
      // Una tarea sin norma del proyecto no tiene estándar.
      if (Array.isArray(t?.ambitos) && t?.accion in (datos?.acciones ?? {})) {
        const tarea = tareasDe(conProyecto).find((x) => x.agente === agente && x.tarea.id === t.id)?.tarea;
        const llegan = tarea ? normasDeTarea(tarea, conProyecto, normas, { deConsulta: (a) => [a], proyecto: id, dominios }).filter((x) => x.norma?.project === id) : [];
        if (!llegan.length) malos.push(`${d}: ninguna norma del proyecto le llega por su ámbito y su acción; sin normas no tiene estándar`);
      }
    }
  }
  return malos;
}
