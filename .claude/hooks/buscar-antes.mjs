/**
 * buscar-antes.mjs — ante algo que no encaja, el sistema busca lo ya apuntado
 * y se lo pone delante a la sesión (#384, fondo #334; mitad de lectura de #320).
 *
 * Por qué: el 9 oct 2026 una sesión trató como un misterio la rama `ccr-…` de
 * la carpeta principal cuando otra conversación ya la había investigado y
 * arreglado (#348), y cinco jueces presentaron como nuevo lo ya apuntado (#320).
 * El principio: ante un error, un test rojo, una denegación de la guardia, un
 * agente que no carga o una rama inesperada, se ASUME que ya hay un issue y un
 * plan que lo arregla, y se busca ANTES de investigar. No depende de que la
 * sesión se acuerde.
 *
 * Claude Code lo ejecuta DESPUÉS de cada herramienta (PostToolUse) y después de
 * las que fallan (PostToolUseFailure); ver .claude/settings.json. Nunca bloquea
 * ni rompe la herramienta: si algo falla, avisa por stderr y sigue.
 *
 * Una vez por señal y sesión (marca en disco), para no cansar. Busca en el índice
 * local (`npm run issues -- --indexar`), sin red: unos 100 ms con el índice
 * presente. Qué es una señal y cómo se extrae la consulta: scripts/lib/buscarAntes.mjs.
 * Cada aviso deja una línea contable en `senales.log` (`buscar-antes senal: …`),
 * sin datos de familias, para medir cuántas señales traen algo apuntado.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  avisoDeIndice, buscar, dirBuscar, detectarSenales, leerIndice, ramaDeLaPrincipal, relevantes, senalDeRamaPrincipal, SENALES_QUE_SIEMPRE_HABLAN, textoDeAviso,
} from "../../scripts/lib/buscarAntes.mjs";

/** Herramientas que se miran. Las demás (MCP, web…) ni se leen. */
export const HERRAMIENTAS = ["Bash", "PowerShell", "Read", "Grep", "Glob", "Agent", "Task", "Skill"];

/** Tope de avisos por llamada: si salen más, se quedan para la siguiente (sin marcar). */
const MAX_POR_LLAMADA = 2;

const idLimpio = (s) => String(s ?? "x").replace(/\W/g, "").slice(0, 40) || "x";

/**
 * Lo que hay que decir tras una llamada: { textos, nuevas, lineas }.
 *   textos  lo que recibe la sesión
 *   nuevas  claves de señal que ya se han dicho (se guardan para no repetir)
 *   lineas  las líneas contables
 * `vistas` es el conjunto de claves ya avisadas en esta sesión. Pura salvo la
 * lectura del índice (`leer`) y de la rama (`rama`), que se inyectan.
 */
export function procesar(entrada, { vistas = new Set(), leer = leerIndice, rama = ramaDeLaPrincipal } = {}) {
  const textos = [];
  const nuevas = [];
  const lineas = [];
  if (!HERRAMIENTAS.includes(String(entrada?.tool_name ?? "")) && !/Failure/i.test(String(entrada?.hook_event_name ?? ""))) return { textos, nuevas, lineas };

  const senales = [];
  const r = rama(entrada.cwd);
  const delaRama = r.principal ? senalDeRamaPrincipal(r.rama) : null;
  if (delaRama) senales.push(delaRama);
  senales.push(...detectarSenales(entrada));

  const pendientes = senales.filter((s) => !vistas.has(s.clave));
  if (!pendientes.length) return { textos, nuevas, lineas };

  const lectura = leer();
  for (const s of pendientes.slice(0, MAX_POR_LLAMADA)) {
    nuevas.push(s.clave);
    if (!lectura.indice) {
      textos.push(`[buscar-antes] Algo no encaja (${s.extracto}), pero no puedo buscar lo ya apuntado: ${avisoDeIndice(lectura)} Mientras tanto: \`gh issue list --state all --search "<palabras>"\`.`);
      lineas.push(`buscar-antes senal: ${s.tipo} resultado: sin-indice`);
      continue;
    }
    const hay = buscar(lectura.indice, s.consulta, { max: 6 });
    const buenos = relevantes(hay);
    // Lo que ya se le dijo a esta sesión no se repite, venga de la señal que venga.
    const nuevos = buenos.filter((b) => !vistas.has(`#${b.ficha.numero}`) && !nuevas.includes(`#${b.ficha.numero}`));
    if (buenos.length && !nuevos.length) {
      lineas.push(`buscar-antes senal: ${s.tipo} resultado: repetido`);
      continue;
    }
    if (!buenos.length && !SENALES_QUE_SIEMPRE_HABLAN.has(s.tipo)) {
      lineas.push(`buscar-antes senal: ${s.tipo} resultado: nada-en-silencio`);
      continue;
    }
    for (const b of nuevos) nuevas.push(`#${b.ficha.numero}`);
    textos.push(textoDeAviso(s, nuevos.length ? hay.filter((h) => nuevos.includes(h)) : hay, lectura) + (lectura.viejo ? ` ${avisoDeIndice(lectura)}` : ""));
    lineas.push(`buscar-antes senal: ${s.tipo} resultado: ${nuevos.length ? "apuntado" : "nada"}${nuevos.length ? ` primero: #${nuevos[0].ficha.numero}` : ""}`);
  }
  return { textos, nuevas, lineas };
}

/**
 * La llamada entera: lee las marcas de la sesión, procesa, guarda marcas y línea
 * contable, y devuelve los textos. La usan el hook (abajo) y la guardia, que la
 * llama al negar una orden porque una denegación no llega a PostToolUse (la
 * herramienta no llega a ejecutarse).
 */
export function ejecutar(entrada, opciones = {}) {
  const dir = dirBuscar();
  mkdirSync(dir, { recursive: true });
  const marcas = join(dir, `sesion-${idLimpio(entrada.session_id)}.json`);
  const vistas = new Set(existsSync(marcas) ? JSON.parse(readFileSync(marcas, "utf8")) : []);
  const r = procesar(entrada, { vistas, ...opciones });
  if (r.nuevas.length || r.lineas.length) {
    if (r.nuevas.length) writeFileSync(marcas, JSON.stringify([...vistas, ...r.nuevas]));
    if (r.lineas.length) appendFileSync(join(dir, "senales.log"), `${r.lineas.join("
")}
`);
  }
  return r.textos;
}

/** El aviso para una denegación de la guardia: '' si no hay nada que decir o algo falla (nunca rompe la guardia). */
export function avisoDeDenegacion(entrada, motivo) {
  try {
    const sintetica = { session_id: entrada?.session_id, cwd: entrada?.cwd, tool_name: "Bash", tool_input: entrada?.tool_input ?? {}, hook_event_name: "PostToolUseFailure", error: `[guardia] ${motivo}` };
    // Sin la señal de la rama principal: no es de esta orden.
    return ejecutar(sintetica, { rama: () => ({ principal: false }) }).join("
");
  } catch (e) {
    console.error(`[buscar-antes] no he podido buscar lo ya apuntado: ${String(e?.message ?? e).split("
")[0]}`);
    return "";
  }
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  try {
    let crudo = "";
    for await (const trozo of process.stdin) crudo += trozo;
    const entrada = JSON.parse(crudo);
    const textos = ejecutar(entrada);
    if (textos.length) {
      const evento = /Failure/i.test(String(entrada.hook_event_name ?? "")) ? "PostToolUseFailure" : "PostToolUse";
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: evento, additionalContext: textos.join("
") } }));
    }
  } catch (e) {
    // Falla abierto: es una ayuda, no un vigilante. Pero no en silencio (stderr).
    console.error(`[buscar-antes] no he podido buscar lo ya apuntado: ${String(e?.message ?? e).split("
")[0]}`);
  }
  process.exit(0);
}
