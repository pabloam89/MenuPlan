/**
 * skill-abierta.mjs — anota que esta sesión ha abierto una skill (PreToolUse).
 *
 * La puerta de lectura de la guardia (guardia.mjs) deja pasar a la primera un
 * comando de riesgo si la sesión ya abrió la skill de su dominio. Para saberlo
 * tiene que ver pasar:
 *   - la herramienta `Skill` con `skill: <nombre>`, o
 *   - un `Read` de `.claude/skills/<nombre>/SKILL.md`.
 * Una skill invocada por la persona con /nombre no pasa por aquí: el coste es
 * un único reintento en el primer comando de riesgo.
 *
 * No decide nada ni imprime nada. Los Read son muchos: lo primero es mirar la
 * ruta y salir sin tocar git si no es una skill. Nunca falla.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { anotarSkill, dirSesiones } from "./sesiones.mjs";

/** El nombre de la skill que abre esta acción, o null. */
export function skillAbierta(entrada) {
  const { tool_name: herramienta, tool_input: datos = {} } = entrada ?? {};
  if (herramienta === "Skill") {
    // «github», «/github» o «plugin:github»
    const nombre = String(datos.skill ?? datos.name ?? "").trim().replace(/^\//, "").split(":").pop();
    return /^[\w-]{1,40}$/.test(nombre) ? nombre : null;
  }
  if (herramienta === "Read") {
    return String(datos.file_path ?? "").match(/[\\/]\.claude[\\/]skills[\\/]([\w-]{1,40})[\\/]SKILL\.md$/i)?.[1] ?? null;
  }
  return null;
}

/**
 * El tipo del subagente que lanza esta acción (herramienta Agent), o null si no
 * es un lanzamiento. Solo un nombre de agente (letras, números, guion); otra cosa, «otro».
 */
export function agenteLanzado(entrada) {
  const { tool_name: herramienta, tool_input: datos = {} } = entrada ?? {};
  if (herramienta !== "Agent") return null;
  const tipo = datos?.subagent_type;
  if (tipo === undefined || tipo === null || tipo === "") return "sin-tipo";
  return /^[\w-]{1,40}$/.test(String(tipo)) ? String(tipo) : "otro";
}

/**
 * Anota en el registro de eventos (#340) que se abrió una skill o se lanzó un
 * agente. Va aparte de lo que anota la guardia y no puede fallar hacia fuera:
 * si el registro no carga o no escribe, no pasa nada. «agente_lanzado» solo llega
 * si el matcher de este hook en settings.json incluye «Agent» (hoy no).
 */
async function registrar(entrada, skill) {
  try {
    const agente = agenteLanzado(entrada);
    if (!skill && !agente) return;
    const { registrarEvento } = await import("./eventos.mjs");
    registrarEvento({
      evento: skill ? "skill_cargada" : "agente_lanzado",
      nombre: skill ?? agente,
      sesion: entrada.session_id,
      cwd: entrada.cwd || process.cwd(),
    });
  } catch {
    // a propósito: falla abierta — el registro es una ayuda y este hook corre antes de CADA lectura
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  try {
    let crudo = "";
    for await (const trozo of process.stdin) crudo += trozo;
    const entrada = JSON.parse(crudo);
    const skill = skillAbierta(entrada);
    if (skill) {
      const desde = entrada.cwd || process.cwd();
      let raiz = desde;
      try {
        raiz = execFileSync("git", ["-C", desde, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      } catch {
        // a propósito: falla abierta — fuera de un repo se usa la carpeta tal cual; en el peor caso no se anota la skill y la guardia pide un reintento.
      }
      anotarSkill(dirSesiones(raiz), entrada.session_id, skill, "abierta");
    }
    // Con tope de tiempo: un registro colgado no puede dejar este hook esperando (y no imprime nada que proteger).
    let temporizador;
    await Promise.race([registrar(entrada, skill), new Promise((alTiempo) => { temporizador = setTimeout(alTiempo, 3000); })]);
    clearTimeout(temporizador);
  } catch {
    // a propósito: falla abierta — este hook corre antes de CADA lectura y nunca debe bloquear ni ensuciar una; lo que se pierde es una anotación (cuesta un reintento en la guardia).
  }
  process.exit(0);
}
