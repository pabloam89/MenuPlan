/**
 * lanzamiento.mjs — PreToolUse sobre el lanzamiento de un agente (herramienta `Agent`, antes `Task`) (#642, fondo #639).
 *
 * Por qué: el brief de cada agente lo da el dimensionador (`npm run dimensionar -- <n> --brief <agente>`, #641), con
 * la tarea del catálogo de estándares que cumple y las normas que la tocan. Si quien orquesta lo escribe a mano, el
 * agente trabaja sin estándar y el juez no tiene contra qué contrastar (norma `brief-con-estandar`). Aquí se niega
 * lanzar un agente de `.claude/agents/` con un brief que no trae:
 *
 *   - la línea `ESTÁNDAR A CUMPLIR: <agente>/<tarea>`, con ESE agente y una tarea suya de ops/estandares-agentes.json;
 *   - el bloque `Normas que tocan (…)` que pone el dimensionado (estandaresAgentes.mjs, textoDeTarea).
 *
 * Los agentes que no son del repo (Explore, general-purpose…) no llevan estándar: pasan. La salida, una sola, es la
 * excepción con la forma única dentro del brief (`Excepción: brief-con-estandar — <motivo> — hasta AAAA-MM-DD`,
 * excepciones.mjs): pasa y se dice. Cada negativa deja su línea en el registro de eventos (`bloqueo_guardia`, con la
 * norma). Sin estándares legibles no puede decidir: deja pasar con un aviso (falla abierta, como skill-abierta).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** La norma que hace cumplir este hook (ops/normas.json). */
export const NORMA = "brief-con-estandar";
/** Las herramientas que lanzan un agente: `Agent` y su nombre de antes, `Task`. */
export const HERRAMIENTAS = ["Agent", "Task"];
export const MARCA_ESTANDAR = "ESTÁNDAR A CUMPLIR:";
export const MARCA_NORMAS = "Normas que tocan (";

const COMO =
  "Pega el brief del dimensionado: `npm run dimensionar -- <n.º de encargo> --brief <agente>` (o `--diff --tipo <tipo> --brief <agente>`), " +
  "que trae «ESTÁNDAR A CUMPLIR: <agente>/<tarea>» y «Normas que tocan (…)». Si de verdad no hay tarea que encaje, " +
  `una línea «Excepción: ${NORMA} — <motivo> — hasta AAAA-MM-DD» en el brief deja pasar y queda contada.`;

/** La excepción de este hook en el brief: la forma única, con fecha que no ha pasado ni cae a más de 90 días. */
export function excepcionDelBrief(prompt, hoy) {
  const m = new RegExp(`^[ \\t>*-]*Excepci[oó]n[ \\t]*:[ \\t]*${NORMA}[ \\t]*[—–][ \\t]*(.{10,}?)[ \\t]*[—–][ \\t]*hasta[ \\t]+(\\d{4}-\\d{2}-\\d{2})[ \\t]*$`, "im").exec(String(prompt ?? ""));
  if (!m) return null;
  const dias = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  const d = dias(m[2]) - dias(hoy);
  return Number.isFinite(d) && d >= 0 && d <= 90 ? { motivo: m[1].trim(), hasta: m[2] } : null;
}

/**
 * Decide. entrada: la del hook ({ tool_name, tool_input: { subagent_type, prompt } }); estandares: ops/estandares-agentes.json
 * leído (o null si no se pudo); hoy: AAAA-MM-DD. → null (pasa) | { decision: "deny" | "aviso", motivo }
 */
export function decidirLanzamiento(entrada, estandares, hoy) {
  const { tool_name: herramienta, tool_input: datos = {} } = entrada ?? {};
  if (!HERRAMIENTAS.includes(herramienta)) return null;
  const agente = String(datos?.subagent_type ?? "").trim();
  if (!estandares?.agentes) return { decision: "aviso", motivo: `[lanzamiento] No he podido leer ops/estandares-agentes.json: no compruebo el brief de ${agente || "este agente"}.` };
  // Solo los agentes del repo tienen estándar; los de Claude Code (Explore, general-purpose…) pasan.
  if (!Object.hasOwn(estandares.agentes, agente)) return null;
  const prompt = String(datos?.prompt ?? "");
  const exc = excepcionDelBrief(prompt, hoy);
  if (exc) return { decision: "aviso", motivo: `[lanzamiento] Brief de ${agente} sin comprobar: excepción de ${NORMA} hasta ${exc.hasta} (${exc.motivo.slice(0, 80)}).` };
  const linea = new RegExp(`^[ \\t]*${MARCA_ESTANDAR}[ \\t]*([\\w-]+)/([\\w-]+)[ \\t]*$`, "m").exec(prompt);
  const niega = (porque) => ({ decision: "deny", motivo: `[lanzamiento] No lanzo ${agente}: ${porque}. ${COMO}` });
  if (!linea) return niega(`su brief no trae la línea «${MARCA_ESTANDAR} ${agente}/<tarea>»`);
  if (linea[1] !== agente) return niega(`el estándar del brief es de ${linea[1]}, no de ${agente}`);
  const tareas = (estandares.agentes[agente].tareas ?? []).map((t) => t.id);
  if (!tareas.includes(linea[2])) return niega(`«${linea[2]}» no es una tarea de ${agente} en ops/estandares-agentes.json (las hay: ${tareas.slice(0, 8).join(", ")}${tareas.length > 8 ? "…" : ""})`);
  if (!prompt.includes(MARCA_NORMAS)) return niega(`su brief no trae las normas del dimensionado («${MARCA_NORMAS}…»)`);
  return null;
}

/** La raíz del repo desde la carpeta de la sesión (o ella misma si no es un repo). */
function raizDe(desde) {
  try {
    return execFileSync("git", ["-C", desde, "rev-parse", "--show-toplevel"], { windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return desde; // a propósito: fuera de un repo se usa la carpeta tal cual; sin estándares, el hook avisa y deja pasar
  }
}

export function leerEstandaresDe(raiz) {
  const ruta = join(raiz, "ops", "estandares-agentes.json");
  try {
    return existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : null;
  } catch {
    return null; // a propósito: un JSON ilegible no puede parar todos los lanzamientos; decidirLanzamiento avisa
  }
}

/** Lo que recibe Claude Code: la negativa con su motivo, o el aviso como contexto. */
export function salidaDeLanzamiento(r) {
  if (!r) return null;
  if (r.decision === "aviso") return { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: r.motivo } };
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: r.motivo } };
}

// Como skill-abierta.mjs: por el nombre del fichero, que aguanta las barras mezcladas de ${CLAUDE_PROJECT_DIR} en Windows.
if (process.argv[1] && import.meta.url.endsWith(`/${process.argv[1].replace(/\\/g, "/").split("/").pop()}`)) {
  let r = null;
  let entrada = null;
  try {
    let crudo = "";
    for await (const trozo of process.stdin) crudo += trozo;
    entrada = JSON.parse(crudo);
    const raiz = raizDe(entrada.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
    r = decidirLanzamiento(entrada, leerEstandaresDe(raiz), new Date().toISOString().slice(0, 10));
  } catch (e) {
    r = { decision: "aviso", motivo: `[lanzamiento] No he podido leer el lanzamiento (${String(e?.message ?? e).slice(0, 80)}): no compruebo el brief.` };
  }
  if (r?.decision === "deny") {
    try {
      const { registrarEvento } = await import("./eventos.mjs");
      const agente = String(entrada?.tool_input?.subagent_type ?? "");
      registrarEvento({ evento: "bloqueo_guardia", nombre: /^[\w-]{1,40}$/.test(agente) ? agente : "otro", norma: NORMA, fuente: "lanzamiento", sesion: entrada?.session_id, cwd: entrada?.cwd || process.cwd() });
    } catch {
      // a propósito: el registro es una ayuda; la negativa sale igual
    }
  }
  const salida = salidaDeLanzamiento(r);
  if (salida) process.stdout.write(JSON.stringify(salida));
  process.exit(0);
}
