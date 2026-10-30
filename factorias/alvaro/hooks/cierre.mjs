/**
 * Stop: la sesión no se cierra si falta un juez de los que tocan, si dijo «no pasa» o si informó sin acabar en una línea Veredicto.
 * Solo cuentan los jueces apuntados por ESTA sesión (session_id).
 * Una sola vez por cierre (stop_hook_active): si vuelve a fallar, avisa y deja cerrar,
 * para no atrapar la sesión. FACTORIA_ALVARO_OFF=1 lo apaga (y se dice).
 */
import { bloqueantes, cuadro, evaluar, juecesRequeridos, sesionCambio } from "../lib/reglas.mjs";
import { ficherosCambiados, leer, leerTranscript, mtime } from "../lib/registro.mjs";

let entrada = {};
try {
  let crudo = "";
  for await (const t of process.stdin) crudo += t;
  entrada = JSON.parse(crudo);
  if (entrada === null || typeof entrada !== "object") throw new Error("entrada no es un objeto");
} catch {
  process.exit(0); // a propósito: sin entrada legible no se decide nada
}

const salida = (o) => process.stdout.write(JSON.stringify(o));
if (process.env.FACTORIA_ALVARO_OFF === "1") {
  salida({ systemMessage: "Factoría de Álvaro APAGADA (FACTORIA_ALVARO_OFF=1)" });
  process.exit(0);
}

const cwd = entrada.cwd || process.cwd();
const cambiados = ficherosCambiados(cwd);
const requeridos = juecesRequeridos(cambiados);
if (!Object.keys(requeridos).length) process.exit(0);
// Una sesión que no editó nada ni vio cambiar ningún fichero no tiene nada que juzgar (aunque la rama traiga cambios de otra).
if (sesionCambio({ transcript: leerTranscript(entrada.transcript_path), mtimes: cambiados.map((f) => mtime(cwd, f)) }) === false) process.exit(0);

const ultimaEdicion = Object.fromEntries(Object.entries(requeridos).map(([j, fs]) => [j, Math.max(...fs.map((f) => mtime(cwd, f)))]));
const filas = evaluar({ requeridos, entradas: leer(cwd).filter((e) => !entrada.session_id || e.sesion === entrada.session_id), ultimaEdicion });
const faltan = bloqueantes(filas);

if (faltan.length && !entrada.stop_hook_active) {
  const pide = {
    falta: (f) => `lanza el agente ${f.juez} (${requeridos[f.juez].length} fichero(s) suyos cambiaron)`,
    lanzado: (f) => `${f.juez} está lanzado, sin informe: espera a que acabe y dé su veredicto`,
    ilegible: (f) => `${f.juez}: el informe del juez no acaba en una línea Veredicto: pasa | no pasa | no sé: pídele que lo repita en la última línea`,
    no_pasa: (f) => `${f.juez} dice que no pasa: arregla y vuelve a lanzarlo`,
  };
  const que = faltan.map((f) => pide[f.estado](f)).join("; ");
  salida({ decision: "block", reason: `[factoría de Álvaro] No cierres todavía: ${que}.\n${cuadro(filas)}` });
} else {
  salida({ systemMessage: cuadro(filas) + (faltan.length ? "\n(se deja cerrar con jueces pendientes: segundo aviso)" : "") });
}
