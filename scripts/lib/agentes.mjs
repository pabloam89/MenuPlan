/**
 * agentes.mjs — la lista de agentes y de jueces, con UNA fuente: la cabecera
 * `Tipo: juez|constructor` de cada `.claude/agents/<agente>.md` (#640, fondo #639; #488).
 *
 * Antes la lista de jueces estaba copiada a mano en presupuestos.mjs, flujo.mjs, el
 * glosario y las anclas de vocabularios. Ahora la leen de aquí; un juez nuevo nace
 * con su fichero y no hay nada más que tocar. Sin dependencias: lo importan flujo.mjs
 * y presupuestos.mjs, que no pueden importarse entre sí en círculo.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Los tipos de agente que reconoce la plantilla de agentes. */
export const TIPOS_AGENTE = ["constructor", "juez"];

/** { nombre: "constructor" | "juez" | null } de los ficheros de `.claude/agents/`, por orden alfabético. */
export function agentesDe(raiz = RAIZ) {
  const dir = join(raiz, ".claude", "agents");
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => {
    const m = /^Tipo:\s*(\S+)\s*$/m.exec(readFileSync(join(dir, f), "utf8"));
    return [f.slice(0, -3), m ? m[1] : null];
  }));
}

export const AGENTES = agentesDe();
export const JUECES = Object.keys(AGENTES).filter((a) => AGENTES[a] === "juez");
export const CONSTRUCTORES = Object.keys(AGENTES).filter((a) => AGENTES[a] === "constructor");
