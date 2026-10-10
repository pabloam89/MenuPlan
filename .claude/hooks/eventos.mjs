/**
 * eventos.mjs — el registro local de eventos de los hooks (#340, lo que propone
 * #185): una línea JSON por cosa que pasa, para poder contarla.
 *
 *   { ts, sesion, rama, issue, evento, nombre[, codigo] }
 *
 * Eventos (vocabulario cerrado, EVENTOS): `skill_cargada` (skill-abierta.mjs),
 * `bloqueo_guardia` y `permiso_pedido` (guardia.mjs: un deny y un ask),
 * `agente_lanzado` (skill-abierta.mjs, pero solo llega si el matcher de ese
 * hook en settings.json incluye «Agent»: hoy no, es una propuesta de #340).
 * `nombre` es una palabra de vocabulario (la skill, el tipo de agente o la
 * aviso de la guardia, de `avisos-guardia.mjs`), nunca un texto libre ni el comando. En un
 * bloqueo o un permiso pedido, `codigo` es el id de la norma de `ops/normas.json` que hace
 * cumplir ese aviso (#494): con él se cuenta qué norma salta más.
 *
 * Vive en ~/.claude/menuplan-fabrica/eventos.jsonl, FUERA del repo (es público)
 * y de OneDrive. Una línea no lleva comandos, rutas ni mensajes: solo
 * el id de la sesión, la rama y el número de issue que sale de ella (la misma
 * regla que lleva.mjs).
 *
 * LO IMPORTANTE: un registro que falla no puede romper un hook ni parar al
 * usuario. `registrarEvento` NUNCA lanza ni devuelve una promesa: devuelve
 * true si escribió y false si no (disco lleno, carpeta imposible, entrada
 * rara). El fallo silencioso es a propósito y está probado en eventos.test.js.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { numeroDeRama } from "../../scripts/lib/lleva.mjs";

export const EVENTOS = ["skill_cargada", "agente_lanzado", "bloqueo_guardia", "permiso_pedido", "estado_sin_leer"];
// `estado_sin_leer` (pendientes.mjs, #462): el freno de afirmar el estado de un issue o PR sin leer la
// fuente; `nombre` es el motivo (`sin-lectura` o `lectura-vieja`).

/**
 * Tamaño a partir del cual el fichero se rota (la copia anterior se pisa), así
 * que el registro ocupa como mucho el doble. 5 MB son unas 30.000 líneas de
 * unos 170 bytes: meses de bloqueos y skills de varias sesiones al día, y un
 * fichero que se lee entero en milisegundos.
 */
export const TOPE_BYTES = 5 * 1024 * 1024;

/** La carpeta del registro; `MENUPLAN_FABRICA_DIR` la cambia (los tests, otro disco). */
export const dirFabrica = (env = process.env) => env.MENUPLAN_FABRICA_DIR || join(homedir(), ".claude", "menuplan-fabrica");

const SESION_OK = /^[\w-]{6,80}$/;
const RAMA_OK = /^[\w./-]{1,120}$/;
const NOMBRE_OK = /^[\w:.-]{1,60}$/;
const CODIGO_OK = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** La rama de una carpeta, o null. Solo se llama cuando hay un evento que anotar. */
function ramaDe(cwd) {
  try {
    return execFileSync("git", ["-C", cwd, "symbolic-ref", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim();
  } catch {
    return null; // a propósito: sin git o sin carpeta, el evento se anota sin rama
  }
}

/**
 * La línea de un evento, o null si no vale (evento fuera del vocabulario, nombre
 * raro). Pura: `ahora` y `rama` entran por argumento.
 */
export function lineaDeEvento({ evento, nombre, codigo, sesion, rama }, ahora = new Date()) {
  if (!EVENTOS.includes(evento) || typeof nombre !== "string" || !NOMBRE_OK.test(nombre)) return null;
  const r = typeof rama === "string" && RAMA_OK.test(rama) ? rama : null;
  return {
    ts: ahora.toISOString(),
    sesion: typeof sesion === "string" && SESION_OK.test(sesion) ? sesion : null,
    rama: r,
    issue: numeroDeRama(r),
    evento,
    nombre,
    ...(typeof codigo === "string" && codigo.length <= 60 && CODIGO_OK.test(codigo) ? { codigo } : {}),
  };
}

/**
 * Anota un evento. NUNCA lanza: true si lo escribió, false si no.
 *   datos  { evento, nombre, codigo?, sesion?, rama?, cwd? }  (sin rama, la saca de `cwd`)
 *   opc    { dir, ahora } para probar
 */
export function registrarEvento(datos, opc = {}) {
  try {
    const dir = opc.dir ?? dirFabrica();
    const rama = datos?.rama ?? (datos?.cwd ? ramaDe(String(datos.cwd)) : null);
    const linea = lineaDeEvento({ ...datos, rama }, opc.ahora ?? new Date());
    if (!linea) return false;
    mkdirSync(dir, { recursive: true });
    const fichero = join(dir, "eventos.jsonl");
    try {
      if (statSync(fichero).size > TOPE_BYTES) renameSync(fichero, join(dir, "eventos.anterior.jsonl"));
    } catch {
      // a propósito: sin fichero todavía (o sin poder rotarlo) se sigue; si falla el append de abajo, se devuelve false
    }
    appendFileSync(fichero, `${JSON.stringify(linea)}\n`);
    return true;
  } catch {
    return false; // a propósito: el registro es una ayuda; un fallo no puede romper un hook ni parar al usuario
  }
}
