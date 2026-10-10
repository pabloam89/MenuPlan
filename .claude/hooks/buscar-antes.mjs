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
import { createHash } from "node:crypto";
import { appendFileSync, lstatSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  avisoDeIndice, buscar, cabezaDe, dirBuscar, senalDeDenegacion, escribirAtomico, podarMarcas, detectarSenales, leerIndice, ramaDeLaPrincipal, relevantes, senalDeRamaPrincipal, SENALES_QUE_SIEMPRE_HABLAN, textoDeAviso,
} from "../../scripts/lib/buscarAntes.mjs";

/** Herramientas que se miran. Las demás (MCP, web…) ni se leen. */
export const HERRAMIENTAS = ["Bash", "PowerShell", "Read", "Grep", "Glob", "Agent", "Skill"];

/** Tope de avisos por llamada: si salen más, se quedan para la siguiente (sin marcar). */
const MAX_POR_LLAMADA = 2;

/** Huella corta: en disco no queda ni el id de la sesión ni lo que dijo cada señal (rutas, mensajes). */
const huella = (s) => createHash("sha1").update(String(s ?? "x")).digest("hex").slice(0, 16);


/**
 * Lo que hay que decir tras una llamada: { textos, nuevas, lineas }.
 *   textos  lo que recibe la sesión
 *   nuevas  claves de señal que ya se han dicho (se guardan para no repetir)
 *   lineas  las líneas contables
 * `vistas` es el conjunto de claves ya avisadas en esta sesión. Pura salvo la
 * lectura del índice (`leer`) y de la rama (`rama`), que se inyectan.
 */
export function procesar(entrada, { vistas = new Set(), leer = leerIndice, rama = ramaDeLaPrincipal, extra = [] } = {}) {
  const textos = [];
  const nuevas = [];
  const lineas = [];
  if (!HERRAMIENTAS.includes(String(entrada?.tool_name ?? "")) && !/Failure/i.test(String(entrada?.hook_event_name ?? ""))) return { textos, nuevas, lineas };

  const senales = [];
  const r = rama(entrada.cwd);
  const delaRama = r.principal ? senalDeRamaPrincipal(r.rama) : null;
  if (delaRama) senales.push(delaRama);
  senales.push(...detectarSenales(entrada), ...extra);

  const pendientes = senales.filter((s) => !vistas.has(huella(s.clave)));
  if (!pendientes.length) return { textos, nuevas, lineas };

  const lectura = leer();
  for (const s of pendientes.slice(0, MAX_POR_LLAMADA)) {
    nuevas.push(huella(s.clave));
    if (!lectura.indice) {
      textos.push(`${cabezaDe(s)} No puedo buscar lo ya apuntado: ${avisoDeIndice(lectura)} Mientras tanto: \`gh issue list --state all --search "palabras"\`.`);
      lineas.push(`buscar-antes senal: ${s.tipo} resultado: sin-indice`);
      continue;
    }
    const hay = buscar(lectura.indice, s.consulta, { max: 6 });
    // Solo se marcan como dichos los que se enseñan (textoDeAviso enseña 3).
    const buenos = relevantes(hay).slice(0, 3);
    // Lo que ya se le dijo a esta sesión no se repite, venga de la señal que venga.
    const nuevos = buenos.filter((b) => !vistas.has(huella(`#${b.ficha.numero}`)) && !nuevas.includes(huella(`#${b.ficha.numero}`)));
    if (buenos.length && !nuevos.length) {
      lineas.push(`buscar-antes senal: ${s.tipo} resultado: repetido`);
      continue;
    }
    if (!buenos.length && !SENALES_QUE_SIEMPRE_HABLAN.has(s.tipo)) {
      lineas.push(`buscar-antes senal: ${s.tipo} resultado: nada-en-silencio`);
      continue;
    }
    for (const b of nuevos) nuevas.push(huella(`#${b.ficha.numero}`));
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
/** Líneas que se guardan de `senales.log` cuando crece (tope en bytes: ~100 KB). */
export const LINEAS_LOG = 500;
const MAX_BYTES_LOG = 100 * 1024;

/**
 * ¿Se puede escribir en esta ruta sin tocar nada ajeno? (#428, POSIX con varios usuarios): ni enlace
 * ni fichero de otro usuario, ni en una carpeta de otro. Si no existe aún, solo cuenta la carpeta.
 * En Windows no hay uid y siempre vale.
 */
/** ¿La carpeta es nuestra? (POSIX; en Windows siempre sí). */
export function carpetaPropia(dir) {
  if (typeof process.getuid !== "function") return true;
  try {
    const st = lstatSync(dir);
    return st.isDirectory() && st.uid === process.getuid();
  } catch {
    return false;
  }
}

export function escrituraSegura(ruta, dir = null) {
  if (typeof process.getuid !== "function") return true;
  const yo = process.getuid();
  try {
    if (dir && lstatSync(dir).uid !== yo) return false;
    try {
      const st = lstatSync(ruta);
      return st.isFile() && st.uid === yo;
    } catch (e) {
      if (e?.code === "ENOENT") return true;
      return false;
    }
  } catch {
    return false;
  }
}

/** El registro de señales no crece sin fin: pasado el tope, quedan las últimas `LINEAS_LOG` líneas. */
export function recortarLog(ruta) {
  try {
    if (statSync(ruta).size <= MAX_BYTES_LOG) return;
    const lineas = readFileSync(ruta, "utf8").split("\n").filter(Boolean);
    escribirAtomico(ruta, `${lineas.slice(-LINEAS_LOG).join("\n")}\n`);
  } catch {
    // a propósito: es contabilidad; si no se puede recortar, se recorta la próxima vez
  }
}

/** Las marcas de una sesión; un fichero corrupto cuenta como vacío (no deja a la sesión sin avisos para siempre). */
function leerMarcasDe(ruta) {
  try {
    const m = JSON.parse(readFileSync(ruta, "utf8"));
    return new Set(Array.isArray(m) ? m.filter((x) => typeof x === "string") : []);
  } catch {
    // a propósito: ausente o corrupto, se empieza de cero; lo peor es repetir un aviso
    return new Set();
  }
}

export function ejecutar(entrada, opciones = {}) {
  const dir = dirBuscar();
  mkdirSync(dir, { recursive: true });
  const propia = carpetaPropia(dir);
  const marcas = join(dir, `sesion-${huella(entrada.session_id)}.json`);
  const r = procesar(entrada, { vistas: leerMarcasDe(marcas), ...opciones });
  if (r.nuevas.length || r.lineas.length) {
    if (r.nuevas.length && propia) {
      // Se vuelve a leer justo antes de escribir: dos llamadas a la vez de la misma sesión no se pisan del todo.
      try {
        escribirAtomico(marcas, JSON.stringify([...new Set([...leerMarcasDe(marcas), ...r.nuevas])]));
        podarMarcas(dir);
      } catch (e) {
        // El aviso de esta llamada se emite igual; lo peor que pasa es repetirlo la próxima vez. No en silencio.
        console.error(`[buscar-antes] no he podido guardar las marcas de la sesión: ${String(e?.message ?? e).split("\n")[0]}`);
      }
    }
    if (r.lineas.length) {
      try {
        const log = join(dir, "senales.log");
        if (!escrituraSegura(log, dir)) throw new Error("senales.log o su carpeta no son nuestros");
        appendFileSync(log, `${r.lineas.join("\n")}\n`);
        recortarLog(log);
      } catch (e) {
        // La contabilidad no puede quitar el aviso de esta llamada. No en silencio.
        console.error(`[buscar-antes] no he podido anotar la señal: ${String(e?.message ?? e).split("\n")[0]}`);
      }
    }
  }
  return r.textos;
}

/** El aviso para una denegación de la guardia: '' si no hay nada que decir o algo falla (nunca rompe la guardia). */
export function avisoDeDenegacion(entrada, motivo) {
  try {
    // La señal la crea la guardia aquí, no se lee de ninguna salida (ronda 3 de #384).
    const sintetica = { session_id: entrada?.session_id, cwd: entrada?.cwd, tool_name: "Bash", tool_input: {}, hook_event_name: "PostToolUseFailure" };
    // Sin la señal de la rama principal: no es de esta orden.
    return ejecutar(sintetica, { rama: () => ({ principal: false }), extra: [senalDeDenegacion(motivo, entrada?.tool_input?.command)] }).join("\n");
  } catch (e) {
    console.error(`[buscar-antes] no he podido buscar lo ya apuntado: ${String(e?.message ?? e).split("\n")[0]}`);
    return "";
  }
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

/**
 * Modo `--denegacion`: lo llama la guardia en un PROCESO APARTE y con tope (ronda 4 de #384), para que
 * un fallo, un exit o un cuelgue de este módulo y de lo que importa no pueda quitar un `deny`.
 * Lee por stdin `{ entrada: { session_id, cwd, tool_input: { command } }, motivo }` e imprime SOLO el
 * texto del aviso (o nada). Sale siempre con 0 salvo que muera: la guardia valida lo que recibe.
 */
if (esPrincipal && process.argv.includes("--denegacion")) {
  try {
    let crudo = "";
    for await (const trozo of process.stdin) crudo += trozo;
    const { entrada, motivo } = JSON.parse(crudo);
    process.stdout.write(avisoDeDenegacion(entrada, String(motivo ?? "")));
  } catch (e) {
    console.error(`[buscar-antes] no he podido buscar lo ya apuntado: ${String(e?.message ?? e).split("\n")[0]}`);
  }
  process.exit(0);
}

if (esPrincipal) {
  try {
    let crudo = "";
    for await (const trozo of process.stdin) crudo += trozo;
    const entrada = JSON.parse(crudo);
    const textos = ejecutar(entrada);
    if (textos.length) {
      const evento = /Failure/i.test(String(entrada.hook_event_name ?? "")) ? "PostToolUseFailure" : "PostToolUse";
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: evento, additionalContext: textos.join("\n") } }));
    }
  } catch (e) {
    // Falla abierto: es una ayuda, no un vigilante. Pero no en silencio (stderr).
    console.error(`[buscar-antes] no he podido buscar lo ya apuntado: ${String(e?.message ?? e).split("\n")[0]}`);
  }
  process.exit(0);
}
