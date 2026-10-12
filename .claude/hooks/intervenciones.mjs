/**
 * intervenciones.mjs — anota como `intervencion_humana` (#652) los comandos que Pablo escribe con `!`
 * en la sesión, y con ellos el uso de `--pablo` y de `MENUPLAN_OP_PABLO`.
 *
 * Por qué por el transcript: Claude Code no tiene un evento de hook para el modo `!` (hooks.md lista
 * PreToolUse, PermissionRequest, UserPromptSubmit… y ninguno se documenta para un comando de `!`; la
 * página interactive-mode, «Shell mode with ! prefix», dice que no pasa por Claude ni por la aprobación).
 * Lo que sí queda es el transcript de la sesión (`transcript_path`, campo común de todos los hooks), y en
 * él cada `!` es una línea de usuario cuyo contenido es `<bash-input>comando</bash-input>`. Ese formato
 * NO está documentado: se vio en los transcripts locales de este repo (12 oct 2026). Si
 * cambia, este hook no encuentra nada y no anota nada; no rompe la sesión.
 *
 * Se engancha a `Stop` (Claude responde solo a la salida de un `!`, así que hay un Stop después) y a
 * `SessionEnd` (un `!` al final de la sesión sin respuesta). Lee el transcript desde el byte donde lo dejó
 * la vez anterior (un fichero por sesión en `<fábrica>/marcas/<sesion>.bang`), así que cada `!` se anota
 * una sola vez aunque los dos eventos lo vean.
 *
 * Qué NO guarda: ni el comando ni ningún texto libre. El comando se lee en memoria, se clasifica con
 * `clasificarBang` y se descarta; a la línea del evento solo llegan valores de vocabulario cerrado
 * (`quien`, `motivo`, `entidad_exigida`, `evitable`; ver scripts/lib/eventosVocabulario.mjs).
 *
 * Lo que este hook NO ve: un comando de Pablo en una PowerShell aparte, fuera de Claude Code (así se
 * lanzan las migraciones con `--pablo`, según CLAUDE.md). Eso solo lo vería el propio script.
 *
 * Falla abierto: cualquier error sale con 0 y sin escribir nada. Solo la sesión principal (con
 * `agent_id` es un subagente y no puede haber `!`).
 */
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dirFabrica, registrarEvento } from "./eventos.mjs";

/** Una entrada de más de esto no se lee entera (un transcript puede pesar decenas de MB). */
const MAX_LECTURA = 8 * 1024 * 1024;
/** Un `!` más viejo que esto no se anota: es de una sesión retomada, no de ahora. */
const MAX_EDAD_MS = 6 * 60 * 60 * 1000;
const SESION_OK = /^[\w-]{6,80}$/;

/**
 * Qué intervención es un comando de `!`. Solo mira el texto; devuelve valores del vocabulario y nunca el texto.
 * Orden: lo de producción antes que lo de secretos, y lo demás es `otro`. `entidad_exigida` es el id de una
 * norma de ops/normas.json (lo cruza el test).
 */
export function clasificarBang(comando) {
  const t = String(comando ?? "");
  if (/(?:^|\s)--pablo(?:\s|$|=)/.test(t)) return { motivo: "produccion", entidad_exigida: "migracion-pablo-solo-pablo", evitable: "no" };
  if (/\bMENUPLAN_OP_PABLO\b/.test(t)) return { motivo: "secreto", entidad_exigida: "claves-de-pablo-solo-pablo", evitable: "no" };
  return { motivo: "otro", entidad_exigida: null, evitable: "no" };
}

/**
 * Los `!` de un trozo de transcript (líneas JSONL): [{ comando, ts }]. Ignora líneas rotas, las de un
 * subagente (`isSidechain`) y todo lo que no sea un mensaje de usuario cuyo texto empieza por `<bash-input>`.
 */
export function bangsDe(texto) {
  const salida = [];
  for (const linea of String(texto ?? "").split("\n")) {
    if (!linea.includes("<bash-input>")) continue;
    let fila;
    try {
      fila = JSON.parse(linea);
    } catch {
      continue; // a propósito: una línea cortada o rota no es un `!`
    }
    const contenido = fila?.message?.content;
    if (fila?.type !== "user" || fila.isSidechain || typeof contenido !== "string") continue;
    const m = /^\s*<bash-input>([\s\S]*?)<\/bash-input>\s*$/.exec(contenido);
    if (m) salida.push({ comando: m[1], ts: typeof fila.timestamp === "string" ? fila.timestamp : null });
  }
  return salida;
}

/**
 * Lee el transcript desde `desde` (bytes) hasta la última línea completa. Devuelve el texto y el nuevo
 * desplazamiento; si el fichero es más corto que `desde` (se rotó), empieza de nuevo.
 */
export function leerDesde(ruta, desde) {
  const fd = openSync(ruta, "r");
  try {
    const { size } = fstatSync(fd);
    const ini = desde > size ? 0 : desde;
    const largo = Math.min(size - ini, MAX_LECTURA);
    const buf = Buffer.alloc(largo);
    readSync(fd, buf, 0, largo, ini);
    const texto = buf.toString("utf8");
    const corte = texto.lastIndexOf("\n");
    if (corte < 0) return { texto: "", hasta: ini }; // ninguna línea completa todavía
    const util = texto.slice(0, corte + 1);
    return { texto: util, hasta: ini + Buffer.byteLength(util, "utf8") };
  } finally {
    closeSync(fd);
  }
}

/**
 * Anota los `!` nuevos de una sesión. `entrada` es el JSON del hook. NUNCA lanza.
 *   opc { dir, ahora, usuarioGit } para probar
 * Devuelve cuántos eventos escribió.
 */
export function anotarBangs(entrada, opc = {}) {
  try {
    const sesion = entrada?.session_id;
    const ruta = entrada?.transcript_path;
    if (entrada?.agent_id || typeof sesion !== "string" || !SESION_OK.test(sesion) || typeof ruta !== "string" || !existsSync(ruta)) return 0;
    const dir = opc.dir ?? dirFabrica();
    const marca = join(dir, "marcas", `${sesion}.bang`);
    let desde = 0;
    try {
      const v = Number.parseInt(readFileSync(marca, "utf8"), 10);
      if (Number.isSafeInteger(v) && v >= 0) desde = v;
    } catch {
      // a propósito: sin marca es la primera vez que se mira esta sesión
    }
    const { texto, hasta } = leerDesde(ruta, desde);
    const ahora = opc.ahora ?? new Date();
    let n = 0;
    for (const { comando, ts } of bangsDe(texto)) {
      const cuando = ts ? new Date(ts) : ahora;
      if (Number.isNaN(cuando.getTime()) || ahora.getTime() - cuando.getTime() > MAX_EDAD_MS) continue;
      const c = clasificarBang(comando);
      const ok = registrarEvento(
        { evento: "intervencion_humana", nombre: "bang", motivo: c.motivo, entidad_exigida: c.entidad_exigida, evitable: c.evitable, fuente: "intervenciones", sesion, cwd: entrada.cwd },
        { dir, ahora: cuando, ...(opc.usuarioGit ? { usuarioGit: opc.usuarioGit } : {}) },
      );
      if (ok) n++;
    }
    mkdirSync(join(dir, "marcas"), { recursive: true });
    writeFileSync(marca, String(hasta));
    return n;
  } catch {
    return 0; // a propósito: es contabilidad; un fallo suyo no puede cambiar nada de la sesión
  }
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  try {
    let crudo = "";
    for await (const trozo of process.stdin) crudo += trozo;
    anotarBangs(JSON.parse(crudo));
  } catch {
    // a propósito: sin entrada legible no hay nada que anotar
  }
  process.exit(0);
}
