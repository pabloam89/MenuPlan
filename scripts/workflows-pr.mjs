#!/usr/bin/env node
/**
 * workflows-pr.mjs — un PR que cambia un workflow lleva el visto bueno del juez `seguridad` (#878).
 *
 * Por qué: el token de la App de las sesiones puede empujar workflows (#422, caso #821), los
 * workflows programados corren desde staging (la rama por defecto) con los secretos de producción,
 * y el ruleset de staging solo pide el check `tests`. Hasta #878 lo frenaba la regla
 * `workflow-sin-seguridad` de la guardia al fusionar; al desconectarla, el control pasa aquí, dentro
 * del job `tests` (el único check obligatorio), donde ninguna sesión lo salta.
 *
 * La regla: si algún fichero del PR está en `.github/workflows/`, el cuerpo lleva una línea
 * «Jueces: …» que nombra a `seguridad` (la misma forma que leía la guardia). Es una declaración del
 * PR: la escribe quien lo abre cuando `seguridad` ha dado su OK. Dependabot queda fuera (sube
 * versiones de acciones y sus menores las fusiona dependabot-auto.yml); ningún otro bot, tampoco
 * la App de las sesiones.
 *
 * Uso (lo lanza el CI): PR_BODY=… PR_AUTOR=… node scripts/workflows-pr.mjs <fichero con la lista de rutas>
 * Sale con 1 si falta el visto bueno; deja la línea `workflows-pr resultado: ok|falla|exento`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Los autores que no pasan por aquí: solo Dependabot. */
export const EXENTOS = new Set(["dependabot[bot]"]);

/** Las rutas del PR que son workflows. */
export function workflowsDelPr(rutas) {
  return rutas.map((r) => r.trim()).filter((r) => r.startsWith(".github/workflows/"));
}

/**
 * Quita los comentarios HTML (también uno sin cerrar, que oculta el resto) y los bloques de código
 * con ``` o ~~~: lo que hay dentro no cuenta como línea del PR. Copia de `limpiarCuerpo` de la guardia.
 */
export function limpiarCuerpo(cuerpo) {
  return String(cuerpo ?? "")
    .replace(/\r/g, "")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|$(?![\s\S]))/gm, "");
}

/** Una nota que dice que el juicio aún no está: «seguridad (pendiente)», «seguridad — falta», «seguridad, sin juzgar». */
const SIN_JUICIO = /\b(?:pendiente|falta|sin|no)\b/i;

/**
 * ¿El cuerpo tiene una línea «Jueces:» que nombra a `seguridad` como juez que ya dio su OK? Más
 * estricta que la guardia: una nota de «pendiente» no cuenta, porque esto es el visto bueno.
 */
export function nombraASeguridad(cuerpo) {
  const lineas = [...limpiarCuerpo(cuerpo).matchAll(/^[ \t>*-]*(?:\*\*)?Jueces(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*(.*)$/gim)];
  return lineas.some((m) =>
    m[1].split(/\s*(?:,|;|\sy\s)\s*/).some((j) => {
      const limpio = j.replace(/[`*]/g, "").trim();
      return limpio.split(/[\s—–(.]/)[0].toLowerCase() === "seguridad" && !SIN_JUICIO.test(limpio.slice("seguridad".length));
    }),
  );
}

/** La decisión, pura: { resultado: "ok" | "falla" | "exento", workflows }. */
export function decidirWorkflows({ rutas, cuerpo, autor }) {
  const workflows = workflowsDelPr(rutas);
  if (!workflows.length) return { resultado: "ok", workflows };
  if (EXENTOS.has(String(autor ?? ""))) return { resultado: "exento", workflows };
  return { resultado: nombraASeguridad(cuerpo) ? "ok" : "falla", workflows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const fichero = process.argv[2];
  const rutas = fichero ? readFileSync(fichero, "utf8").split("\n").filter(Boolean) : [];
  const r = decidirWorkflows({ rutas, cuerpo: process.env.PR_BODY, autor: process.env.PR_AUTOR });
  console.log(`workflows-pr resultado: ${r.resultado}`);
  if (r.resultado === "falla") {
    console.log(`::error::Este PR cambia ${r.workflows.slice(0, 5).join(", ")} y su cuerpo no tiene una línea «Jueces:» que nombre a seguridad. Pásalo por el juez seguridad y, con su OK, añade «Jueces: …, seguridad» al cuerpo (editarlo relanza este check).`);
    process.exit(1);
  }
}
