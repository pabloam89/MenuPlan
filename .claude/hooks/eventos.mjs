/**
 * eventos.mjs — el registro local de eventos de los hooks (#340, lo que propone
 * #185): una línea JSON por cosa que pasa, para poder contarla.
 *
 *   { id, ts, sesion, fuente, actor, proyecto, rama, issue, evento, nombre[, norma] }
 *
 * `id`, `fuente` y `actor` son los campos fijos del principio 10 de docs/entidades/N0-principios.md
 * (#568): `id` es único por evento, `fuente` dice qué hook lo escribe (FUENTES) y `actor` quién
 * está detrás de la sesión (vocabulario cerrado ACTORES: `pablo`, `alvaro`, `app`, `desconocido`;
 * #652). `proyecto` (PROYECTOS: `homenu`, `panel`, `factoria`) dice de qué proyecto es el evento.
 * Las líneas de antes de #652 no lo llevan, y `actor` valía `homenu-sesiones[bot]` o null: quien las
 * lee tolera la falta (fabrica las cuenta como «sin_dato»). `evento` y
 * `nombre` siguen como están: leen de ellos fabrica, cumplimiento e issues, y se retiran cuando se muden.
 *
 * Quién es el actor (`actorDe`), en este orden: 1) el autor de git del entorno es la App → `app`;
 * 2) la marca que dejó el arranque de ESTA sesión (`marcas/<sesion>.actor`): un hook no ve el
 * entorno del shell de Bash, donde el arranque pone la identidad de la App, y por eso 83 de 85
 * eventos recientes salían con `actor: null`; 3) el usuario de git de la carpeta (`pablo` o `alvaro`);
 * 4) `desconocido`. El nombre real nunca se anota: solo la palabra del vocabulario.
 *
 * El actor es una métrica, no una autorización: ninguna regla ni permiso puede depender de él.
 *
 * `intervencion_humana` (#652): una vez que una persona tiene que intervenir. Lleva además
 * `quien` (ACTORES: la persona a la que se le pide, que es el usuario de git del PC aunque la
 * sesión vaya con la identidad de la App; `desconocido` si no se lee), `motivo` (MOTIVOS_INTERVENCION), `entidad_exigida` (el id de la norma de
 * ops/normas.json que exige a la persona) y `evitable` (EVITABLE: `si` cuando el paso humano
 * vino de un fallo de la propia comprobación o de un olvido de la sesión, y no de una decisión que hiciera falta). Solo lo escriben los puntos que ya
 * existían: la guardia al pedir permiso (`intervencionDeAviso`) y pendientes.mjs al dejar una decisión; y
 * intervenciones.mjs (fuente `intervenciones`) con cada comando que Pablo escribe con `!`.
 *
 * Eventos (vocabulario cerrado, EVENTOS): `skill_cargada` (skill-abierta.mjs),
 * `bloqueo_guardia` y `permiso_pedido` (guardia.mjs: un deny y un ask),
 * `agente_lanzado` (skill-abierta.mjs, pero solo llega si el matcher de ese
 * hook en settings.json incluye «Agent»: hoy no, es una propuesta de #340).
 * `nombre` es una palabra de vocabulario (la skill, el tipo de agente o la
 * aviso de la guardia, de `avisos-guardia.mjs`), nunca un texto libre ni el comando. En un
 * bloqueo o un permiso pedido, `norma` (hasta #621, `codigo`) es el id de la norma de `ops/normas.json` que hace
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
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { ACTORES, EVITABLE, MOTIVOS_INTERVENCION } from "../../scripts/lib/eventosVocabulario.mjs";
import { numeroDeRama } from "../../scripts/lib/lleva.mjs";
import { PROYECTOS, PROYECTO_POR_DEFECTO } from "../../scripts/lib/zonasProyecto.mjs";

export const EVENTOS = ["skill_cargada", "agente_lanzado", "bloqueo_guardia", "permiso_pedido", "estado_sin_leer", "aviso_guardia", "intervencion_humana"];
/** De qué proyecto es el evento (#652): la lista, con su significado, vive en scripts/lib/zonasProyecto.mjs (una sola fuente). */
export { PROYECTOS, PROYECTO_POR_DEFECTO };
/** Quién está detrás de la sesión, por qué hace falta una persona y si se podía evitar (#652): las listas, con su significado, en scripts/lib/eventosVocabulario.mjs. */
export { ACTORES, EVITABLE, MOTIVOS_INTERVENCION };
/** De qué iba la afirmación de un `estado_sin_leer` (#579); lo cruza el test con los temas de pendientes.mjs. */
export const TEMAS_ESTADO = ["issues-pr", "despliegue", "base", "ci"];
/** Quién escribe el evento: el hook que llama a `registrarEvento`. */
export const FUENTES = ["guardia", "skill-abierta", "pendientes", "intervenciones", "lanzamiento"];
/** La identidad de la App de sesiones. Las líneas de antes de #652 la anotaban así; hoy el actor es `app`. */
export const ACTOR_APP = "homenu-sesiones[bot]";

/** La persona que dice un nombre o un correo de git (`pablo`, `alvaro`) o `desconocido`. Nunca devuelve el texto. */
export function personaDeGit(texto) {
  const t = String(texto ?? "");
  if (/pablo/i.test(t)) return "pablo";
  if (/algbarc|alvaro|álvaro/i.test(t)) return "alvaro";
  return "desconocido";
}

/** El usuario de git de una carpeta (nombre y correo), o "" si no se puede leer. */
function usuarioGitDe(cwd) {
  try {
    const leer = (k) => execFileSync("git", ["-C", cwd, "config", k], { windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim();
    return `${leer("user.name")} ${leer("user.email")}`;
  } catch {
    return ""; // a propósito: sin git o sin usuario configurado, el actor es «desconocido»
  }
}

/** La marca de la sesión: `<dir>/marcas/<sesion>.actor`, que escribe el arranque con la identidad que consiguió. */
const marcaDeActor = (dir, sesion) => join(dir, "marcas", `${sesion}.actor`);

/**
 * El arranque deja la identidad de GitHub de esta sesión (`app` o `pablo`, de `gh api user`) para que los
 * demás hooks la lean: ellos no ven el entorno de Bash. Otra identidad (`otra`, `desconocida`) no se anota.
 * NUNCA lanza: true si escribió.
 */
export function anotarActorDeSesion(dir, sesion, identidad) {
  try {
    if (typeof sesion !== "string" || !SESION_OK.test(sesion) || !["app", "pablo"].includes(identidad)) return false;
    mkdirSync(join(dir, "marcas"), { recursive: true });
    writeFileSync(marcaDeActor(dir, sesion), identidad);
    return true;
  } catch {
    return false; // a propósito: es una ayuda; sin marca, el actor sale del usuario de git
  }
}

/** Anota la identidad que dice la línea contable del arranque (`identidad-sesion identidad: app …`). NUNCA lanza. */
export function anotarActorDeLinea(dir, sesion, linea) {
  const m = /identidad: (\w+)/.exec(String(linea));
  return m ? anotarActorDeSesion(dir, sesion, m[1]) : false;
}

/** Lo que anotó el arranque de esa sesión (`app` o `pablo`), o null. */
export function actorAnotado(dir, sesion) {
  try {
    if (typeof sesion !== "string" || !SESION_OK.test(sesion)) return null;
    const v = readFileSync(marcaDeActor(dir, sesion), "utf8").trim();
    return ["app", "pablo"].includes(v) ? v : null;
  } catch {
    return null; // a propósito: sin marca (sesión anterior a #652 o arranque que no pudo) se sigue con el usuario de git
  }
}

/**
 * Quién está detrás de la sesión: uno de ACTORES. Ver la cabecera para el orden.
 *   opc  { dir, sesion, cwd, usuarioGit } — `usuarioGit` (función) entra para probar
 */
export function actorDe(env = process.env, { dir = dirFabrica(env), sesion = null, cwd = null, usuarioGit = usuarioGitDe } = {}) {
  if (env.GIT_AUTHOR_NAME === ACTOR_APP) return "app";
  const anotado = actorAnotado(dir, sesion);
  if (anotado) return anotado;
  return cwd ? personaDeGit(usuarioGit(cwd)) : "desconocido";
}

/** La persona a la que se le pide algo: el usuario de git, aunque la sesión vaya con la App (que no dice quién hay detrás). */
export const quienDe = (cwd, usuarioGit = usuarioGitDe) => (cwd ? personaDeGit(usuarioGit(cwd)) : "desconocido");

/** El proyecto del evento: `MENUPLAN_PROYECTO` si es de PROYECTOS; si no, este repo (`homenu`). */
export const proyectoDe = (env = process.env) => (PROYECTOS.includes(env.MENUPLAN_PROYECTO) ? env.MENUPLAN_PROYECTO : PROYECTO_POR_DEFECTO);

/**
 * Qué intervención humana es un aviso de la guardia que PREGUNTA (`ask`): { motivo, evitable }. Todas las
 * preguntas son un permiso; `evitable: si` cuando la guardia pregunta porque no pudo leer el estado (git o
 * red), no porque haga falta una decisión. eventos.test.js cruza estos ids con los `ask(` de guardia.mjs.
 */
export const INTERVENCION_POR_AVISO = {
  "push-forzado": { motivo: "permiso", evitable: "no" },
  "escribir-lo-de-lola": { motivo: "permiso", evitable: "no" },
  "rama-sin-comprobar": { motivo: "permiso", evitable: "si" },
  "fusion-base-ilegible": { motivo: "permiso", evitable: "si" },
  "pr-choques-sin-comprobar": { motivo: "permiso", evitable: "si" },
  "entrada-ilegible": { motivo: "permiso", evitable: "si" },
};

/** Los datos de un `intervencion_humana` para un aviso `ask` de la guardia (sin sesión ni cwd), o null si no es una pregunta conocida. */
export function intervencionDeAviso(aviso, norma) {
  const i = INTERVENCION_POR_AVISO[aviso];
  return i ? { evento: "intervencion_humana", nombre: i.motivo, motivo: i.motivo, evitable: i.evitable, entidad_exigida: norma } : null;
}

// `aviso_guardia` (guardia.mjs, #506): un aviso que no bloquea (hoy, el de zona con otra rama); el
// fichero y la rama van a su propio registro (`zonas.log`, .claude/hooks/zonas.mjs), no aquí.
// `estado_sin_leer` (pendientes.mjs, #462): el freno de afirmar el estado de un issue o PR sin leer la
// fuente; `nombre` es el motivo (`sin-lectura` o `lectura-vieja`) y `tema` de qué iba (TEMAS_ESTADO).

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
/** Lo que parece una clave y no un nombre (#579, C11): un prefijo de token o 32 letras y cifras seguidas. */
const OPACO = /[A-Za-z0-9]{32,}|(?:^|[^A-Za-z0-9])(?:ops_|sk-|ghp_|gho_|ghs_|github_pat_|xox[bp]-|eyJ)/;

/** La rama de una carpeta, o null. Solo se llama cuando hay un evento que anotar. */
function ramaDe(cwd) {
  try {
    return execFileSync("git", ["-C", cwd, "symbolic-ref", "--short", "HEAD"], { windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim();
  } catch {
    return null; // a propósito: sin git o sin carpeta, el evento se anota sin rama
  }
}

/**
 * La línea de un evento, o null si no vale (evento fuera del vocabulario, nombre
 * raro). Pura: `ahora` y `rama` entran por argumento.
 */
export function lineaDeEvento({ evento, nombre, norma, tema, sesion, rama, fuente, actor, proyecto, quien, motivo, entidad_exigida: entidad, evitable }, ahora = new Date(), id = randomUUID()) {
  if (!EVENTOS.includes(evento) || typeof nombre !== "string" || !NOMBRE_OK.test(nombre) || OPACO.test(nombre)) return null;
  const r = typeof rama === "string" && RAMA_OK.test(rama) && !OPACO.test(rama) ? rama : null;
  // Una intervención sin motivo del vocabulario no vale: sin él no se puede contar.
  if (evento === "intervencion_humana" && !MOTIVOS_INTERVENCION.includes(motivo)) return null;
  return {
    id,
    ts: ahora.toISOString(),
    sesion: typeof sesion === "string" && SESION_OK.test(sesion) && !OPACO.test(sesion) ? sesion : null,
    fuente: FUENTES.includes(fuente) ? fuente : null,
    // Lo que no es del vocabulario es «desconocido»; el valor de antes de #652 (la App) es `app`.
    actor: actor === ACTOR_APP ? "app" : ACTORES.includes(actor) ? actor : "desconocido",
    proyecto: PROYECTOS.includes(proyecto) ? proyecto : PROYECTO_POR_DEFECTO,
    rama: r,
    issue: numeroDeRama(r),
    evento,
    nombre,
    ...(typeof norma === "string" && norma.length <= 60 && CODIGO_OK.test(norma) ? { norma } : {}),
    // Solo en `estado_sin_leer`: de qué iba la afirmación (vocabulario cerrado).
    ...(evento === "estado_sin_leer" && TEMAS_ESTADO.includes(tema) ? { tema } : {}),
    // Solo en `intervencion_humana` (#652): todo del vocabulario, nada de texto libre.
    ...(evento === "intervencion_humana"
      ? {
          quien: ACTORES.includes(quien) ? quien : "desconocido",
          motivo,
          entidad_exigida: typeof entidad === "string" && entidad.length <= 60 && CODIGO_OK.test(entidad) ? entidad : null,
          evitable: EVITABLE.includes(evitable) ? evitable : "no",
        }
      : {}),
  };
}

/**
 * Anota un evento. NUNCA lanza: true si lo escribió, false si no.
 *   datos  { evento, nombre, fuente, norma?, sesion?, rama?, cwd? }  (sin rama, la saca de `cwd`)
 *   opc    { dir, ahora, env, usuarioGit } para probar
 */
export function registrarEvento(datos, opc = {}) {
  try {
    const dir = opc.dir ?? dirFabrica();
    const rama = datos?.rama ?? (datos?.cwd ? ramaDe(String(datos.cwd)) : null);
    const cwd = datos?.cwd ? String(datos.cwd) : null;
    const env = opc.env ?? process.env;
    const actor = datos?.actor ?? actorDe(env, { dir, sesion: datos?.sesion, cwd, usuarioGit: opc.usuarioGit });
    // La persona a la que se le pide (solo en una intervención): el usuario de git, no la identidad de la App.
    const quien = datos?.evento === "intervencion_humana" ? (datos.quien ?? quienDe(cwd, opc.usuarioGit)) : undefined;
    const linea = lineaDeEvento({ proyecto: proyectoDe(env), ...datos, actor, quien, rama }, opc.ahora ?? new Date());
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
