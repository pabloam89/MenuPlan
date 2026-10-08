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

/** Frases que dicen «esto queda por decidir o por hacer» (sin acentos). */
const PENDIENTE = /decisiones (?:para pablo|pendientes)|quedan? pendientes?|lo dejo pendiente|te toca decidir|falta que decidas/i;
/** Lo que dice que no queda nada: «ninguna», «sin pendientes», «no hay»… */
const NADA = /\b(?:sin|nada|ningun[oa]?|no hay|no quedan?)\b/i;
/** Comandos que dejan rastro en un issue. */
const A_ISSUE = /npm run issues\s+--\s+--nuevo|gh\s+issue\s+(?:create|comment)|--colgar/;

/**
 * ¿Deja el último mensaje pendientes sin issue, y la sesión no ha tocado
 * ninguno? Un pendiente cuenta si lo que lo sigue (el resto de la línea y la
 * lista que cuelga debajo) tiene algo que no cita un `#n` ni dice «ninguna»:
 * la cabecera fija «DECISIONES PENDIENTES: ninguna» del informe de los agentes
 * o «Queda pendiente el #94» no frenan.
 */
export function pendientesSinIssue({ ultimo, comandos }) {
  if (comandos.some((c) => A_ISSUE.test(String(c)))) return false;
  const lineas = String(ultimo ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").split("\n");
  return lineas.some((l, i) => {
    const m = PENDIENTE.exec(l);
    if (!m || NADA.test(l.slice(0, m.index + m[0].length))) return false;
    const debajo = [];
    for (const s of lineas.slice(i + 1, i + 16)) {
      if (!s.trim()) break;
      debajo.push(s);
    }
    const items = [l.slice(m.index + m[0].length), ...debajo].map((s) => s.replace(/^[\s:*\-–·.]+/, "").trim()).filter(Boolean);
    if (!items.length) return true;
    return items.some((s) => !/#\d+/.test(s) && !NADA.test(s));
  });
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
      // a propósito: una línea del transcript que no es JSON (cortada al escribir) se salta
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
    // a propósito: un recordatorio, no un vigilante; si falla, la sesión termina normal
  }
  process.exit(0);
}
