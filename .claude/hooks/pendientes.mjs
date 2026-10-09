/**
 * pendientes.mjs — que nada pendiente se quede solo en el chat.
 *
 * Por qué: el 8 oct 2026 la sesión del plan maestro tenía cinco decisiones para
 * Pablo que solo existían en la conversación; se pasaron a issues porque él lo
 * pidió. Si la sesión se hubiera cerrado, se perdían (encargo #207, de #185).
 *
 * Claude Code lo ejecuta cuando la sesión termina de responder (Stop, ver
 * .claude/settings.json). Si su último mensaje (`last_assistant_message`, ver
 * `aMirar`) deja decisiones o pendientes y
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

// ── El freno de los casos (#185) ──────────────────────────────────────────────
//
// «Cuando algo falla: hasta el problema de fondo» (CLAUDE.md) pide registrar
// cada fallo del camino como un caso. El 9 oct 2026 una sesión de siete PR no
// registró ninguno hasta que Pablo lo preguntó. La puerta firme es la línea
// «Casos:» del PR (guardia y CI); esto frena una vez, al terminar, a la sesión
// que tuvo señales de fallo y no dejó rastro de haber registrado nada.

/** Un `[guardia]` que no es un fallo: la puerta de las skills y la de «Casos:» piden algo, no han roto nada. */
const GUARDIA_DE_TRAMITE = /abre antes (?:la|las) skills?|línea «Casos:»|falta la línea|«Casos:/i;
/** Comandos y escritos que dejan un caso registrado, o dicen por qué no lo hay. */
const CASO_REGISTRADO = /--nuevo[\s\S]*--tipo\s+caso|--tipo\s+caso[\s\S]*--nuevo|--colgar|gh\s+issue\s+comment|\bCasos\s*:\s*(?:#\d|ninguno)/i;

const sinColor = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "");
const nombreDe = (ruta) => String(ruta).split(/[\\/]/).pop();
const textoDe = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x?.text ?? "").join("\n") : "");

/**
 * Del transcript: las señales de fallo de la sesión y si dejó rastro de haber
 * registrado casos. Señales (cada una con su origen, para decirlas):
 *  - informe de un agente con `ESTADO: bloqueado|fallo` o un hallazgo `[bloqueante]`;
 *  - vitest en rojo (`FAIL fichero`) en un fichero que la sesión no tocó: un test
 *    que falla y no es el tuyo es un caso; el nuevo que ves fallar, no;
 *  - una denegación de la guardia (salvo las de trámite).
 * → { senales: string[], registrado: boolean }
 */
export function senalesDeFallo(jsonl) {
  const usos = new Map(); // id → { name, command }
  const tocados = new Set();
  const escritos = [];
  const resultados = [];
  for (const linea of String(jsonl).split("\n")) {
    let e;
    try {
      e = JSON.parse(linea);
    } catch {
      // a propósito: una línea del transcript que no es JSON (cortada al escribir) se salta
      continue;
    }
    const partes = Array.isArray(e?.message?.content) ? e.message.content : [];
    for (const p of partes) {
      if (e.type === "assistant" && p.type === "tool_use") {
        usos.set(p.id, { name: p.name, command: p.input?.command ?? "" });
        if (p.input?.command) escritos.push(p.input.command);
        if (p.input?.content) escritos.push(String(p.input.content));
        const f = p.input?.file_path;
        if (f) tocados.add(nombreDe(f));
      } else if (e.type === "user" && p.type === "tool_result") {
        resultados.push({ uso: usos.get(p.tool_use_id), texto: sinColor(textoDe(p.content)), error: p.is_error === true });
      }
    }
  }
  const senales = [];
  for (const { uso, texto, error } of resultados) {
    if (!uso) continue;
    if (/^(?:Agent|Task)$/.test(uso.name)) {
      const m = texto.match(/^\s*ESTADO:\s*(bloqueado|fallo)\b/im);
      if (m) senales.push(`informe de un agente con ESTADO: ${m[1]}`);
      else if (/^\s*-\s*\[bloqueante\]/im.test(texto)) senales.push("informe de un agente con un hallazgo bloqueante");
    } else if (/^(?:Bash|PowerShell)$/.test(uso.name)) {
      if (/vitest|npm\s+(?:run\s+)?test|npx\s+vitest/i.test(uso.command)) {
        const ajenos = [...texto.matchAll(/^\s*FAIL\s+(\S+)/gm)].map((m) => nombreDe(m[1])).filter((f) => !tocados.has(f));
        if (ajenos.length) senales.push(`vitest en rojo en ${[...new Set(ajenos)].slice(0, 3).join(", ")}, que no tocaste`);
      }
    }
    if (error && /^(?:Bash|PowerShell|Edit|Write|MultiEdit)$/.test(uso.name) && texto.includes("[guardia]") && !GUARDIA_DE_TRAMITE.test(texto)) {
      senales.push(`la guardia te negó un ${uso.name === "Edit" || uso.name === "Write" || uso.name === "MultiEdit" ? "edit" : "comando"}`);
    }
  }
  return { senales: [...new Set(senales)], registrado: escritos.some((c) => CASO_REGISTRADO.test(c)) };
}

/** El mensaje del freno: las señales y qué hacer. Sale una sola vez por sesión. */
export function recordatorioDeCasos(senales) {
  return "[casos] En esta sesión hubo señales de fallo y no hay rastro de ningún caso registrado ni de una línea «Casos:» en un PR:\n"
    + senales.slice(0, 5).map((s) => `- ${s}`).join("\n")
    + "\nCada fallo del camino es un caso (CLAUDE.md, «Cuando algo falla»): analiza su problema de fondo y regístralo con "
    + "`npm run issues -- --nuevo \"…\" --tipo caso --analisis <nuevo|abierto|no-aguanto-roto|no-aguanto-corto|puntual> --area … --cuerpo <fichero>` "
    + "(un puntual lleva su «Puntual porque …»), y pon «Casos: #n» en el PR. "
    + "Si ninguna es un fallo de verdad (un test que viste fallar a propósito, un obstáculo que ya estaba resuelto), "
    + "di en una línea por qué y termina: este aviso no vuelve a salir.";
}

export const RECORDATORIO = "[pendientes] Tu último mensaje deja decisiones o pendientes, y en esta sesión no has creado ni comentado ningún issue. "
  + "El chat se pierde al cerrar: pasa cada decisión a un issue (`npm run issues -- --nuevo \"…\" --tipo decision --area … --cuerpo <fichero>`, que se asigna a Pablo) "
  + "y cada trabajo por hacer a un encargo, o di en una línea por qué no hace falta. Este aviso sale una sola vez por sesión.";

/**
 * Qué mirar, de lo que llega por stdin y del transcript. El último mensaje sale
 * de `last_assistant_message`: el transcript se escribe con retraso y puede no
 * llevar aún el mensaje final del turno (lo dice la documentación de hooks,
 * sección Stop). El transcript solo da los comandos de la sesión y, si el campo
 * no viene (una versión vieja de Claude Code), el último texto como respaldo.
 */
export function aMirar(entrada, transcript) {
  const t = leerTranscript(transcript ?? "");
  return { ultimo: entrada.last_assistant_message ?? t.ultimo, comandos: t.comandos };
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  try {
    let crudo = "";
    for await (const trozo of process.stdin) crudo += trozo;
    const entrada = JSON.parse(crudo);
    if (entrada.stop_hook_active) process.exit(0);
    const dir = join(tmpdir(), "menuplan-pendientes");
    mkdirSync(dir, { recursive: true });
    const id = String(entrada.session_id ?? "x").replace(/\W/g, "");
    const marca = join(dir, `${id}.hecho`);
    const marcaCasos = join(dir, `${id}.casos`);
    const transcript = entrada.transcript_path && existsSync(entrada.transcript_path) ? readFileSync(entrada.transcript_path, "utf8") : "";
    // Cada freno sale una vez por sesión y con su marca; si salen los dos a la vez, primero los pendientes.
    if (!existsSync(marca) && pendientesSinIssue(aMirar(entrada, transcript))) {
      writeFileSync(marca, new Date().toISOString());
      process.stdout.write(JSON.stringify({ decision: "block", reason: RECORDATORIO }));
    } else if (!existsSync(marcaCasos)) {
      const { senales, registrado } = senalesDeFallo(transcript);
      if (senales.length && !registrado) {
        writeFileSync(marcaCasos, new Date().toISOString());
        process.stdout.write(JSON.stringify({ decision: "block", reason: recordatorioDeCasos(senales) }));
      }
    }
  } catch {
    // a propósito: un recordatorio, no un vigilante; si falla, la sesión termina normal
  }
  process.exit(0);
}
