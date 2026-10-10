#!/usr/bin/env node
/**
 * Estándar por tarea de cada agente (#413). Fuente: ops/estandares-agentes.json.
 *
 *   npm run estandar                      lista de agentes con sus cifras
 *   npm run estandar -- <agente>          sus tareas
 *   npm run estandar -- <agente> <tarea>  el estándar de esa tarea (lo que /orquestar pega en el brief)
 *   npm run estandar -- --escribir        regenera la sección «Tareas y su estándar» de cada agente
 *   npm run estandar -- --contar          la cifra: tareas con estándar / tareas
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contar, escribirSecciones, leerEstandares, textoDeTarea } from "./lib/estandaresAgentes.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const datos = leerEstandares(RAIZ);

if (args.includes("--escribir")) {
  const cambiados = escribirSecciones(RAIZ, datos);
  console.log(cambiados.length ? `Sección regenerada en: ${cambiados.join(", ")}` : "Las secciones ya estaban al día.");
} else if (args.includes("--contar") || !args.length) {
  const c = contar(datos);
  for (const [n, a] of Object.entries(c.porAgente)) console.log(`${n.padEnd(14)} ${a.estado.padEnd(9)} ${a.conEstandar}/${a.tareas} tareas con estándar`);
  console.log(`TOTAL ${c.conEstandar}/${c.total} tareas con estándar; ${c.pendientes} pendientes`);
} else {
  const [agente, tarea] = args;
  const ag = datos.agentes[agente];
  if (!ag) { console.error(`No hay agente «${agente}». Los hay: ${Object.keys(datos.agentes).join(", ")}`); process.exit(1); }
  if (!tarea) { for (const t of ag.tareas) console.log(`${t.id} — ${t.tarea}`); }
  else {
    const txt = textoDeTarea(agente, tarea, datos);
    if (!txt) { console.error(`${agente} no tiene la tarea «${tarea}». Tiene: ${ag.tareas.map((t) => t.id).join(", ")}`); process.exit(1); }
    console.log(txt);
  }
}
