/** SessionStart: la línea que dice que la factoría de Álvaro está activa. Si no la ves, no lo está. */
import { ramaDe } from "../lib/registro.mjs";

let entrada = {};
try {
  let crudo = "";
  if (!process.stdin.isTTY) for await (const t of process.stdin) crudo += t;
  entrada = crudo ? JSON.parse(crudo) : {};
} catch {
  // a propósito: sin entrada legible el aviso sale igual
}

const cwd = entrada.cwd || process.cwd();
process.stdout.write(JSON.stringify({
  systemMessage: `Factoría de Álvaro activa · rama ${ramaDe(cwd)} · jueces: revisor, qa (pantallas), evaluador (Lola)`,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: "[factoría de Álvaro] Al terminar, la sesión no se cierra sin los jueces que toquen según los ficheros cambiados: lánzalos con el agente que corresponda (revisor, qa, evaluador) y que cada uno acabe con «Veredicto: pasa | no pasa | no sé».",
  },
}));
