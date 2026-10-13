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

/** Los tipos de agente que reconoce la plantilla de agentes: vocabulario cerrado de `Tipo:`. «juez» es uno de sus valores, no una categoría aparte. */
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

/**
 * Los traspasos entre agentes como dato (#652, línea 4): el campo `traspasa_a` de la
 * cabecera de cada `.claude/agents/<agente>.md` (vocabulario cerrado: ids de agentes).
 * Antes eran aristas en prosa: el «No para: X (otro agente)» de la descripción y el
 * apartado «Escalado». `traspasosEnTexto` las vuelve a sacar del texto y
 * `.claude/agentes.test.js` exige que declarado y texto coincidan, en los dos sentidos.
 */

/** Los ids de agente que cita un texto: entre comillas invertidas siempre; dentro de paréntesis, solo si `enParentesis` (el «No para:»). */
function idsCitados(texto, ids, propio, enParentesis) {
  const dentro = enParentesis ? [...texto.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).join(" ; ") : "";
  const huecos = [...texto.matchAll(/`([\w-]+)`/g)].map((m) => m[1]);
  return ids.filter((x) => x !== propio && (huecos.includes(x) || (enParentesis && new RegExp(`(?<![\\w-])${x}(?![\\w-])`).test(dentro))));
}

/** Las aristas que dice el texto de un agente: ids de su «No para:» (en paréntesis) y de su «Escalado» (en comillas invertidas). */
export function traspasosEnTexto(textoAgente, propio, ids) {
  const texto = textoAgente.replace(/\r\n/g, "\n");
  const desc = /^description:.*$/m.exec(texto)?.[0] ?? "";
  const noPara = desc.includes("No para:") ? desc.slice(desc.indexOf("No para:")) : "";
  const escalado = /^## 9\. Escalado\n([\s\S]*?)(?=^## 10\.)/m.exec(texto)?.[1] ?? "";
  return [...new Set([...idsCitados(noPara, ids, propio, true), ...idsCitados(escalado, ids, propio, false)])].sort();
}

/** El campo `traspasa_a` de la cabecera: lista `[a, b]` o vacía; `null` si falta el campo. */
export function traspasosDeclarados(textoAgente) {
  const m = /^traspasa_a:[ \t]*(.*)$/m.exec(textoAgente.replace(/\r\n/g, "\n"));
  if (!m) return null;
  return m[1].replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** { agente: { declarado: [...]|null, enTexto: [...] } } de `.claude/agents/`. */
export function traspasosDe(raiz = RAIZ) {
  const dir = join(raiz, ".claude", "agents");
  const ficheros = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  const ids = ficheros.map((f) => f.slice(0, -3));
  return Object.fromEntries(ficheros.map((f) => {
    const texto = readFileSync(join(dir, f), "utf8");
    const id = f.slice(0, -3);
    return [id, { declarado: traspasosDeclarados(texto), enTexto: traspasosEnTexto(texto, id, ids) }];
  }));
}
