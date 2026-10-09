import { execFileSync } from "node:child_process";

/**
 * Los ficheros del repo según git: los versionados más los nuevos sin
 * commitear, sin lo que .gitignore ignora. Así un fichero GENERADO por el
 * build (api/_bot/core.mjs, api/_bot/dominiosGustos.json…) no cuenta como
 * código ni como dato sin dueño, y uno nuevo que aún no está en un commit sí.
 *
 * Rutas relativas con «/». Si git no está disponible, FALLA con un mensaje
 * claro: un test que pasa en vacío porque no vio ningún fichero no sirve.
 */
export function ficherosDeGit(raiz) {
  let salida;
  try {
    salida = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: raiz, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    throw new Error(`No puedo listar los ficheros con git (git ls-files en ${raiz}): ${e.message}. Estos tests necesitan git y el checkout con .git.`);
  }
  const lista = [...new Set(salida.split("\0").filter(Boolean))];
  if (!lista.length) throw new Error(`git ls-files no devolvió ningún fichero en ${raiz}: ¿no es un repositorio git?`);
  return lista;
}

/** Ficheros directos de una carpeta (sin entrar en subcarpetas), según git. */
export const directosDe = (ficheros, dir) => ficheros.filter((f) => f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes("/"));
