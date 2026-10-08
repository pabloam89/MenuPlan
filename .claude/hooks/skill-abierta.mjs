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
        // fuera de un repo: nos quedamos con lo que hay
      }
      anotarSkill(dirSesiones(raiz), entrada.session_id, skill, "abierta");
    }
  } catch {
    // sin entrada legible o sin registro: no hay nada que anotar
  }
  process.exit(0);
}
