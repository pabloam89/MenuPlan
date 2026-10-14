#!/usr/bin/env node
/**
 * Estándar por tarea de cada agente (#413, por campos en #516). Fuente: ops/estandares-agentes.json.
 *
 *   npm run estandar                      lista de agentes con sus cifras
 *   npm run estandar -- <agente>          sus tareas, con su acción
 *   npm run estandar -- <agente> <tarea> [--ficheros a,b,…]
 *                                         el estándar de esa tarea (lo que /orquestar pega en el brief): las
 *                                         normas que le tocan (sus ámbitos × su acción, más las del ámbito de
 *                                         cada fichero tocado y las que cita), con su frase, su control y su
 *                                         principio, la precedencia entre áreas (qué gana si dos normas chocan,
 *                                         #621) y sus reglas propias
 *   npm run estandar -- <agente> <tarea> --proyecto homenu   lo mismo, y además las normas de ese proyecto (ops/proyectos/<id>/normas.json)
 *                                         cuyo ámbito y acción coinciden con los de la tarea, por referencia (el estándar base
 *                                         no lleva ninguna norma vertical, #704), y las tareas que solo existen en ese proyecto
 *                                         (ops/proyectos/<id>/tareas.json); las del bot solo si el proyecto declara el dominio (#710)
 *   npm run estandar -- <agente> <tarea> --diff   lo mismo con los ficheros de la rama frente a origin/staging
 *                                         (los de `skills-encargo --diff`); es lo que /orquestar pega al juez
 *   npm run estandar -- comunes           las tareas comunes a varios agentes
 *   npm run estandar -- comunes <id>      el estándar de una tarea común
 *   npm run estandar -- --escribir        regenera la sección «Tareas y su estándar» de cada agente y docs/ops/ESTANDARES.md
 *   npm run estandar -- --contar          la cifra: tareas, reglas, comunes, acciones y fuentes
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ficherosDeLaRama } from "./lib/vecinos.mjs";
import { leerPrecedencia } from "./lib/precedencia.mjs";
import { dominiosDeProyecto, proyectosDeEntidades } from "./lib/normas.mjs";
import { conTareasDeProyecto, leerTareasDeProyecto } from "./lib/tareasDeProyecto.mjs";
import { bajarJuicioMaximo, contar, contarJuicio, escribirMd, escribirSecciones, leerEstandares, leerNormasEn, textoDeComun, textoDeTarea } from "./lib/estandaresAgentes.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const todos = process.argv.slice(2);
// --ficheros a,b,… (o --ficheros=a,b): los ficheros tocados, que suman las normas de su ámbito.
const iFich = todos.findIndex((a) => a === "--ficheros" || a.startsWith("--ficheros="));
const ficheros = iFich < 0 ? [] : (todos[iFich].includes("=") ? todos[iFich].split("=")[1] : todos[iFich + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
// --diff: los ficheros de la rama, con la misma función que skills-encargo --diff.
if (todos.includes("--diff")) ficheros.push(...ficherosDeLaRama(RAIZ));
// --proyecto <id> (o --proyecto=<id>): suma las normas de ese proyecto, por referencia.
const iProy = todos.findIndex((a) => a === "--proyecto" || a.startsWith("--proyecto="));
const proyecto = iProy < 0 ? null : (todos[iProy].includes("=") ? todos[iProy].split("=")[1] : todos[iProy + 1] ?? "").trim() || null;
if (iProy >= 0 && !proyecto) { console.error("--proyecto pide un id de proyecto (ops/entidades.json), p. ej. --proyecto homenu"); process.exit(1); }
if (proyecto && !proyectosDeEntidades(RAIZ).includes(proyecto)) { console.error(`«${proyecto}» no es un proyecto de ops/entidades.json (${proyectosDeEntidades(RAIZ).join(", ")})`); process.exit(1); }
const salta = (i) => (iFich >= 0 && (i === iFich || (i === iFich + 1 && !todos[iFich].includes("=")))) || (iProy >= 0 && (i === iProy || (i === iProy + 1 && !todos[iProy].includes("="))));
const args = todos.filter((a, i) => a !== "--diff" && !salta(i));
if (proyecto && todos.includes("--escribir")) { console.error("--escribir regenera los .md del catálogo general: no admite --proyecto"); process.exit(1); }
// Con --proyecto, las tareas que solo existen en ese proyecto (ops/proyectos/<id>/tareas.json) se suman a las de su agente.
const datos = proyecto ? conTareasDeProyecto(leerEstandares(RAIZ), leerTareasDeProyecto(RAIZ, [proyecto])[proyecto]) : leerEstandares(RAIZ);
const dominios = proyecto ? dominiosDeProyecto(RAIZ, proyecto) : null;
const registro = leerNormasEn(RAIZ);

if (args.includes("--escribir")) {
  const cambiados = escribirSecciones(RAIZ, datos);
  console.log(cambiados.length ? `Sección regenerada en: ${cambiados.join(", ")}` : "Las secciones ya estaban al día.");
  console.log(escribirMd(RAIZ, datos) ? "docs/ops/ESTANDARES.md regenerado." : "docs/ops/ESTANDARES.md ya estaba al día.");
  console.log(`Tope de reglas a juicio: ${bajarJuicioMaximo(RAIZ, datos)} (hoy ${contarJuicio(datos)}).`);
} else if (args.includes("--contar") || !args.length) {
  const c = contar(datos, registro.normas);
  for (const [n, a] of Object.entries(c.porAgente)) console.log(`${n.padEnd(14)} ${a.conEstandar}/${a.tareas} tareas con estándar, ${a.reglas} reglas`);
  console.log(`TOTAL ${c.conEstandar}/${c.total} tareas con estándar; ${c.pendientes} pendientes; ${c.reglas} reglas propias; ${c.comunes} comunes con ${c.reglasComunes} reglas`);
  console.log(`reglas a juicio: ${contarJuicio(datos)}`);
  console.log(`acciones: ${Object.entries(c.porAccion).map(([a, n]) => `${a}=${n}`).join(" ")}`);
  console.log(`normas: ${c.normasCitadas} citadas aparte; ${c.normasDistintas} distintas llegan a alguna tarea y ${c.normasSinTarea} a ninguna`);
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
    const txt = textoDeTarea(agente, tarea, datos, registro, { ficheros, precedencia: leerPrecedencia(RAIZ), proyecto, dominios });
    if (!txt) { console.error(`${agente} no tiene la tarea «${tarea}». Tiene: ${ag.tareas.map((t) => t.id).join(", ")}`); process.exit(1); }
    console.log(txt);
  }
}
