/**
 * voz.mjs — el vigilante de la voz (#453): al terminar cada respuesta, mide el último
 * mensaje a Pablo contra la regla de `estilo-de-respuesta` y anota UNA línea contable.
 *
 * Por qué: la forma de hablarle a Pablo vivía solo como texto y se medía en ejemplos,
 * no en respuestas reales (10 oct 2026: «no debería ser soft coding sino HARD»).
 *
 * FASE 1: SOLO MIDE. No frena, no deniega, no escribe nada en la conversación. La cifra
 * de partida primero; el freno, si Pablo lo decide, en otro issue.
 *
 * Seguridad: lee, si hace falta, el transcript local de la propia sesión (la ruta que
 * le da Claude Code); nada sale de la máquina y NO se guarda el texto del mensaje, solo
 * `voz: dia=… palabras=… ideas=… faltas=… cumple=…` en `voz.log`, en la misma carpeta
 * temporal por usuario que `senales.log` (y con la misma comprobación de dueño).
 * Falla abierto: si algo va mal sale con 0 y deja `voz: error=<motivo cerrado>`; tiene
 * su propio tope de tiempo. Solo la sesión principal: el Stop de un subagente se ignora.
 * Si pendientes.mjs frena y la sesión responde otra vez, esa respuesta también se mide.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { dirBuscar } from "../../scripts/lib/buscarAntes.mjs";
import { diaMadrid } from "../../scripts/lib/hora.mjs";
import { lineaDe, lineaDeError, medir, respuestasFinales } from "../../scripts/lib/voz.mjs";
import { carpetaPropia, escrituraSegura, recortarLog } from "./buscar-antes.mjs";

/** Tope propio, por debajo del `timeout` de settings.json. */
const TOPE_MS = 5000;
/** El registro no crece sin fin: ~110 bytes por respuesta, unas 3.000 respuestas. */
const RECORTE = { maxBytes: 400 * 1024, lineas: 3000 };

/** Anota una línea en `voz.log` con las mismas cautelas que `senales.log`. Lanza si no puede. */
function anotar(linea) {
  const dir = dirBuscar();
  mkdirSync(dir, { recursive: true });
  const log = join(dir, "voz.log");
  if (!carpetaPropia(dir) || !escrituraSegura(log, dir)) throw new Error("voz.log o su carpeta no son nuestros");
  appendFileSync(log, `${linea}\n`);
  recortarLog(log, RECORTE);
}

/** Como `anotar`, pero para un error: si tampoco se puede, se calla (es contabilidad). */
function anotarError(motivo) {
  try {
    anotar(lineaDeError(motivo));
  } catch {
    // a propósito: sin dónde apuntar no hay nada más que hacer; la sesión no se toca
  }
}

const reloj = setTimeout(() => {
  anotarError("tiempo");
  process.exit(0);
}, TOPE_MS);

try {
  let crudo = "";
  for await (const trozo of process.stdin) crudo += trozo;
  let entrada;
  try {
    entrada = JSON.parse(crudo);
  } catch {
    anotarError("entrada");
    process.exit(0);
  }
  if (!entrada || entrada.agent_id || entrada.agent_type) process.exit(0);
  let ultimo = entrada.last_assistant_message;
  if (typeof ultimo !== "string") {
    // Respaldo de versiones viejas: el último texto del transcript de esta sesión.
    try {
      const ruta = entrada.transcript_path;
      ultimo = ruta && existsSync(ruta) ? respuestasFinales(readFileSync(ruta, "utf8")).at(-1) : "";
    } catch {
      anotarError("transcript");
      process.exit(0);
    }
  }
  if (!String(ultimo ?? "").trim()) process.exit(0);
  try {
    anotar(lineaDe(medir(ultimo), diaMadrid()));
  } catch {
    anotarError("escritura");
  }
} catch {
  anotarError("otro");
}
clearTimeout(reloj);
process.exit(0);
