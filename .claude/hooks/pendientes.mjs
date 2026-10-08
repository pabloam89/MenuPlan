/**
 * pendientes.mjs — que nada pendiente se quede solo en el chat.
 *
 * Por qué: el 8 oct 2026 la sesión del plan maestro tenía cinco decisiones para
 * Pablo que solo existían en la conversación; se pasaron a issues porque él lo
 * pidió. Si la sesión se hubiera cerrado, se perdían (encargo #207, de #185).
 *
 * Claude Code lo ejecuta cuando la sesión termina de responder (Stop, ver
 * .claude/settings.json). Si su último mensaje deja decisiones o pendientes y
 * en toda la sesión no se ha creado ni comentado ningún issue, la frena UNA vez
 * con el recordatorio; la sesión decide si pasarlos a issues o explicar por qué
 * no hace falta. Nunca dos veces por sesión, ni en bucle (`stop_hook_active`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Frases que dicen «esto queda por decidir o por hacer». */
const PENDIENTE = /decisiones para pablo|quedan? pendientes?|pendientes?\s*:|lo dejo pendiente|te toca decidir|falta que decidas/i;
/** Comandos que dejan rastro en un issue. */
const A_ISSUE = /npm run issues\s+--\s+--nuevo|gh\s+issue\s+(?:create|comment)|--colgar/;

/** ¿Deja el último mensaje pendientes sin que la sesión haya tocado ningún issue? */
export function pendientesSinIssue({ ultimo, comandos }) {
  return PENDIENTE.test(String(ultimo ?? "")) && !comandos.some((c) => A_ISSUE.test(String(c)));
}

/** Del transcript (JSONL): el último texto de Claude y todos los comandos de shell. */
export function leerTranscript(jsonl) {
  let ultimo = "";
  const comandos = [];
  for (const linea of String(jsonl).split("\n")) {
    let e;
    try {
      e = JSON.parse(linea);
    } catch {
      continue;
    }
    if (e?.type !== "assistant") continue;
    const partes = Array.isArray(e.message?.content) ? e.message.content : [];
    const texto = partes.filter((p) => p.type === "text").map((p) => p.text).join("\n");
    if (texto.trim()) ultimo = texto;
    for (const p of partes) if (p.type === "tool_use" && p.input?.command) comandos.push(p.input.command);
  }
  return { ultimo, comandos };
}

export const RECORDATORIO = "[pendientes] Tu último mensaje deja decisiones o pendientes, y en esta sesión no has creado ni comentado ningún issue. "
  + "El chat se pierde al cerrar: pasa cada decisión a un issue (`npm run issues -- --nuevo \"…\" --tipo decision --area … --cuerpo <fichero>`, que se asigna a Pablo) "
  + "y cada trabajo por hacer a un encargo, o di en una línea por qué no hace falta. Este aviso sale una sola vez por sesión.";

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  try {
    let crudo = "";
    for await (const trozo of process.stdin) crudo += trozo;
    const entrada = JSON.parse(crudo);
    if (entrada.stop_hook_active || !entrada.transcript_path || !existsSync(entrada.transcript_path)) process.exit(0);
    const dir = join(tmpdir(), "menuplan-pendientes");
    mkdirSync(dir, { recursive: true });
    const marca = join(dir, `${String(entrada.session_id ?? "x").replace(/\W/g, "")}.hecho`);
    if (existsSync(marca)) process.exit(0);
    if (pendientesSinIssue(leerTranscript(readFileSync(entrada.transcript_path, "utf8")))) {
      writeFileSync(marca, new Date().toISOString());
      process.stdout.write(JSON.stringify({ decision: "block", reason: RECORDATORIO }));
    }
  } catch {
    // un recordatorio, no un vigilante: si falla, calla
  }
  process.exit(0);
}
