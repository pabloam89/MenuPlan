/**
 * Lee un JSON tal como está en una referencia de git (origin/staging, o la que diga FORJA_REF).
 * Lo usan los tres trinquetes de la forja (capas, campos y excepciones) para que no se pueda
 * bajar un ancla borrándola a la vez del catálogo y de su fichero.
 *
 * Devuelve null si no hay git, si la referencia no existe (el checkout del CI es de 2 commits) o si
 * el fichero aún no está en ella: el test que lo usa se salta limpio y lo dice.
 */
import { execFileSync } from "node:child_process";

export const REFERENCIA = () => process.env.FORJA_REF ?? "origin/staging";

export function jsonEnReferencia(raiz, ref, ruta) {
  let texto;
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: raiz, stdio: "pipe" });
    texto = execFileSync("git", ["show", `${ref}:${ruta}`], { cwd: raiz, stdio: "pipe", encoding: "utf8", maxBuffer: 1 << 24 });
  } catch {
    // a propósito: sin git, sin la referencia o sin el fichero en ella, el trinquete se salta;
    // jsonEnReferenciaAvisando lo dice. Un JSON roto en la referencia sí revienta (abajo).
    return null;
  }
  return JSON.parse(texto);
}

/** Como `jsonEnReferencia`, pero avisa por consola de qué se salta y por qué. */
export function jsonEnReferenciaAvisando(raiz, ref, ruta, que) {
  const r = jsonEnReferencia(raiz, ref, ruta);
  if (!r) console.info(`[forja] ${que} contra ${ref}: se salta (sin git, sin la referencia o sin ${ruta} en ella)`);
  return r;
}
