#!/usr/bin/env node
/**
 * Estándar por tarea de cada agente (#413, por campos en #516). Fuente: ops/estandares-agentes.json.
 *
 *   npm run estandar                      lista de agentes con sus cifras
 *   npm run estandar -- <agente>          sus tareas, con su acción
 *   npm run estandar -- <agente> <tarea>  el estándar de esa tarea (lo que /orquestar pega en el brief)
 *   npm run estandar -- comunes           las tareas comunes a varios agentes
 *   npm run estandar -- comunes <id>      el estándar de una tarea común
 *   npm run estandar -- --escribir        regenera la sección «Tareas y su estándar» de cada agente y docs/ops/ESTANDARES.md
 *   npm run estandar -- --contar          la cifra: tareas, reglas, comunes, acciones y fuentes
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bajarJuicioMaximo, contar, contarJuicio, escribirMd, escribirSecciones, leerEstandares, textoDeComun, textoDeTarea } from "./lib/estandaresAgentes.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const datos = leerEstandares(RAIZ);

if (args.includes("--escribir")) {
  const cambiados = escribirSecciones(RAIZ, datos);
  console.log(cambiados.length ? `Sección regenerada en: ${cambiados.join(", ")}` : "Las secciones ya estaban al día.");
  console.log(escribirMd(RAIZ, datos) ? "docs/ops/ESTANDARES.md regenerado." : "docs/ops/ESTANDARES.md ya estaba al día.");
  console.log(`Tope de reglas a juicio: ${bajarJuicioMaximo(RAIZ, datos)} (hoy ${contarJuicio(datos)}).`);
} else if (args.includes("--contar") || !args.length) {
  const c = contar(datos);
  for (const [n, a] of Object.entries(c.porAgente)) console.log(`${n.padEnd(14)} ${a.conEstandar}/${a.tareas} tareas con estándar, ${a.reglas} reglas`);
  console.log(`TOTAL ${c.conEstandar}/${c.total} tareas con estándar; ${c.pendientes} pendientes; ${c.reglas} reglas propias; ${c.comunes} comunes con ${c.reglasComunes} reglas`);
  console.log(`reglas a juicio: ${contarJuicio(datos)}`);
  console.log(`acciones: ${Object.entries(c.porAccion).map(([a, n]) => `${a}=${n}`).join(" ")}`);
  console.log(`fuentes: ${c.fuentes.externas} externas [F] y ${c.fuentes.casa} de la casa [I]`);
} else if (args[0] === "comunes") {
  if (!args[1]) { for (const [id, c] of Object.entries(datos.comunes)) console.log(`${id} — ${c.tarea} (acción: ${c.accion})`); }
  else {
    const txt = textoDeComun(args[1], datos);
    if (!txt) { console.error(`No hay común «${args[1]}». Las hay: ${Object.keys(datos.comunes).join(", ")}`); process.exit(1); }
    console.log(txt);
  }
} else {
  const [agente, tarea] = args;
  const ag = datos.agentes[agente];
  if (!ag) { console.error(`No hay agente «${agente}». Los hay: ${Object.keys(datos.agentes).join(", ")}`); process.exit(1); }
  if (!tarea) { for (const t of ag.tareas) console.log(`${t.id} — ${t.tarea} (acción: ${t.accion})`); }
  else {
    const txt = textoDeTarea(agente, tarea, datos);
    if (!txt) { console.error(`${agente} no tiene la tarea «${tarea}». Tiene: ${ag.tareas.map((t) => t.id).join(", ")}`); process.exit(1); }
    console.log(txt);
  }
}
