/**
 * Stop: la sesión no se cierra si falta un juez de los que tocan, si dijo «no pasa» o si informó sin acabar en una línea Veredicto.
 * Una sola vez por cierre (stop_hook_active): si vuelve a fallar, avisa y deja cerrar,
 * para no atrapar la sesión. FACTORIA_ALVARO_OFF=1 lo apaga (y se dice).
 */
import { bloqueantes, cuadro, evaluar, juecesRequeridos } from "../lib/reglas.mjs";
import { ficherosCambiados, leer, mtime } from "../lib/registro.mjs";

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
const requeridos = juecesRequeridos(ficherosCambiados(cwd));
if (!Object.keys(requeridos).length) process.exit(0);

const ultimaEdicion = Object.fromEntries(Object.entries(requeridos).map(([j, fs]) => [j, Math.max(...fs.map((f) => mtime(cwd, f)))]));
const filas = evaluar({ requeridos, entradas: leer(cwd), ultimaEdicion });
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
