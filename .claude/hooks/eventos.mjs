/**
 * eventos.mjs — el registro local de eventos de los hooks (#340, lo que propone
 * #185): una línea JSON por cosa que pasa, para poder contarla.
 *
 *   { ts, sesion, rama, issue, evento, nombre }
 *
 * Eventos (vocabulario cerrado, EVENTOS): `skill_cargada` (skill-abierta.mjs),
 * `bloqueo_guardia` y `permiso_pedido` (guardia.mjs: un deny y un ask),
 * `agente_lanzado` (skill-abierta.mjs, pero solo llega si el matcher de ese
 * hook en settings.json incluye «Agent»: hoy no, es una propuesta de #340).
 * `nombre` es una palabra de vocabulario (la skill, el tipo de agente o la
 * familia de la regla de la guardia), nunca un texto libre ni el comando.
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

export const EVENTOS = ["skill_cargada", "agente_lanzado", "bloqueo_guardia", "permiso_pedido"];

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

/**
 * Las familias de regla de la guardia, para que `nombre` sea contable: el
 * motivo de un deny o un ask lleva datos de la acción (números, ramas), así que
 * no sirve tal cual. Orden importa: gana la primera que encaja. Un motivo nuevo
 * sale como «otra» hasta que se añada aquí (el test cruza esto con guardia.mjs).
 */
export const FAMILIAS_GUARDIA = [
  [/main es producci/i, "push-a-main"],
  [/staging no se sube directo/i, "push-directo-a-staging"],
  [/push forzado/i, "push-forzado"],
  [/git stash/i, "stash"],
  [/git add \.|commit -a/i, "add-a-ciegas"],
  [/vite build/i, "vite-build-a-secas"],
  [/issues se crean con/i, "issue-a-pelo"],
  [/set-content|out-file/i, "escribir-por-terminal"],
  [/--pablo/i, "apply-migration-pablo"],
  [/sql que escribe/i, "sql-contra-produccion"],
  [/mal hechos, cuestan caro|abre antes la skill/i, "puerta-de-skill"],
  [/carpeta principal/i, "carpeta-principal"],
  [/tu rama es del issue/i, "pr-sin-closes"],
  [/casos:|sin .?casos/i, "pr-sin-casos"],
  [/por detr[aá]s de staging|ultimo de staging|lo último de staging/i, "rama-atrasada"],
  [/staging ha cambiado sus mismos ficheros|ha tocado lo mismo/i, "pr-pisado-por-staging"],
  [/base de un pr|rama base|va contra|gh -r|por `gh api`|--auto|justo detr[aá]s de `merge`/i, "fusion-fuera-de-staging"],
  [/borrar o trasladar un issue/i, "borrar-issue"],
  [/migraci[oó]n|estado\.md|n[uú]mero/i, "migracion"],
  [/lo que lee lola/i, "escribir-lo-de-lola"],
  [/permisos o el c[oó]digo que vigila/i, "tocar-permisos"],
  [/no ha podido leer esta orden/i, "entrada-ilegible"],
];

/** El nombre contable de un deny o un ask de la guardia (una de FAMILIAS_GUARDIA o «otra»). */
export function familiaDeGuardia(motivo) {
  const texto = String(motivo ?? "");
  return FAMILIAS_GUARDIA.find(([re]) => re.test(texto))?.[1] ?? "otra";
}

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
export function lineaDeEvento({ evento, nombre, sesion, rama }, ahora = new Date()) {
  if (!EVENTOS.includes(evento) || typeof nombre !== "string" || !NOMBRE_OK.test(nombre)) return null;
  const r = typeof rama === "string" && RAMA_OK.test(rama) ? rama : null;
  return {
    ts: ahora.toISOString(),
    sesion: typeof sesion === "string" && SESION_OK.test(sesion) ? sesion : null,
    rama: r,
    issue: numeroDeRama(r),
    evento,
    nombre,
  };
}

/**
 * Anota un evento. NUNCA lanza: true si lo escribió, false si no.
 *   datos  { evento, nombre, sesion?, rama?, cwd? }  (sin rama, la saca de `cwd`)
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
