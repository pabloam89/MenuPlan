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
import { appendFileSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Los módulos propios se cargan DENTRO del try (import dinámico): si uno está roto, el hook
// no muere al cargar sino que deja «voz: error=otro» y sale con 0. Se rellenan en main().
let m = null;

/** Tope propio, por debajo del `timeout` de settings.json. */
const TOPE_MS = 5000;
/** El registro no crece sin fin: ~110 bytes por respuesta, unas 3.000 respuestas. */
const RECORTE = { maxBytes: 400 * 1024, lineas: 3000 };

async function cargar() {
  const [{ dirBuscar }, { diaMadrid }, voz, { carpetaPropia, escrituraSegura, recortarLog }] = await Promise.all([
    import("../../scripts/lib/buscarAntes.mjs"),
    import("../../scripts/lib/hora.mjs"),
    import("../../scripts/lib/voz.mjs"),
    import("./buscar-antes.mjs"),
  ]);
  m = { dirBuscar, diaMadrid, carpetaPropia, escrituraSegura, recortarLog, ...voz };
}

/** Anota una línea en `voz.log` con las mismas cautelas que `senales.log`. Lanza si no puede. */
function anotar(linea) {
  const dir = m.dirBuscar();
  mkdirSync(dir, { recursive: true });
  const log = join(dir, "voz.log");
  if (!m.carpetaPropia(dir) || !m.escrituraSegura(log, dir)) throw new Error("voz.log o su carpeta no son nuestros");
  appendFileSync(log, `${linea}\n`);
  m.recortarLog(log, RECORTE);
}

/** Como `anotar`, pero para un error: si tampoco se puede, se calla (es contabilidad). */
function anotarError(motivo) {
  try {
    if (m) return anotar(m.lineaDeError(motivo));
    // Un módulo no cargó: se anota a mano, solo si la carpeta es nuestra (POSIX) y sin recortar.
    const dir = process.env.MENUPLAN_BUSCAR_DIR || join(tmpdir(), "menuplan-buscar");
    mkdirSync(dir, { recursive: true });
    if (typeof process.getuid === "function" && lstatSync(dir).uid !== process.getuid()) return;
    appendFileSync(join(dir, "voz.log"), "voz: error=otro\n");
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
  await cargar();
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
      // Solo el final del transcript (2 MB): el último turno está ahí.
      ultimo = ruta && existsSync(ruta) ? m.respuestasFinales(m.leerCola(ruta)).at(-1) : "";
    } catch {
      anotarError("transcript");
      process.exit(0);
    }
  }
  if (!String(ultimo ?? "").trim()) process.exit(0);
  try {
    anotar(m.lineaDe(m.medir(String(ultimo).slice(0, m.MAX_BYTES_MENSAJE)), m.diaMadrid()));
  } catch {
    anotarError("escritura");
  }
} catch {
  anotarError("otro");
}
clearTimeout(reloj);
process.exit(0);
