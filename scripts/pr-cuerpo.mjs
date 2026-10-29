#!/usr/bin/env node
/**
 * Genera el cuerpo del PR con lo que pide el revisor de la Fábrica, antes de
 * abrirlo: los tests tocados con su salida, el rojo antes de los tests nuevos,
 * el tamaño y los fallos tragados. Las secciones de criterio salen con TODO.
 *
 *   npm run pr:cuerpo -- [--titulo "…"] [--refs "Refs #958"] [--salida cuerpo.md]
 *
 * Mira los commits de la rama frente a origin/staging (lo no commiteado no
 * cuenta). Para el rojo antes devuelve un momento los ficheros que no son test
 * a como estaban en la base y los restaura al acabar; por eso pide el árbol
 * limpio, y si no lo está lo dice y se salta ese paso.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { cuerpo, esTest, fallosTragados, tamano } from "./lib/prCuerpo.mjs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : ""; };
const lineas = (s) => s.split("\n").filter(Boolean);

function vitest(ficheros) {
  const comando = `npx vitest run ${ficheros.join(" ")} --maxWorkers=2`;
  // Una sola cadena con shell: npx es un .cmd en Windows. Los nombres salen de git, sin espacios en este repo.
  const r = spawnSync(comando, { encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`no se pudo lanzar vitest: ${r.error.message}`, { cause: r.error });
  return { comando, salida: `${r.stdout ?? ""}\n${r.stderr ?? ""}`, codigo: r.status ?? 1 };
}

// Los tests nuevos contra el código de la base: si pasan igual, no prueban la regla.
function rojoAntes(base, nuevos, fuentes) {
  if (!nuevos.length) return null;
  if (git("status", "--porcelain")) {
    return { comando: "(saltado)", salida: "El árbol no está limpio: commitea antes y vuelve a lanzarlo.", codigo: -1 };
  }
  const enBase = new Set(lineas(git("ls-tree", "-r", "--name-only", base)));
  try {
    for (const f of fuentes) {
      if (enBase.has(f)) git("checkout", base, "--", f);
      // Nuevo en la rama: sin él, como en la base (vuelve con el checkout de abajo).
      else rmSync(f, { force: true });
    }
    return vitest(nuevos);
  } finally {
    if (fuentes.length) git("checkout", "HEAD", "--", ...fuentes);
    if (git("status", "--porcelain")) throw new Error("No ha quedado el árbol como estaba: revisa git status antes de seguir.");
  }
}

const base = git("merge-base", "HEAD", "origin/staging");
const cambiados = lineas(git("diff", "--name-only", "--diff-filter=d", base, "HEAD"));
const nuevos = lineas(git("diff", "--name-only", "--diff-filter=A", base, "HEAD")).filter(esTest);
const tocados = cambiados.filter(esTest);
const fuentes = cambiados.filter((f) => !esTest(f));

const ahora = tocados.length ? vitest(tocados) : { comando: "(ningún test tocado)", salida: "", codigo: 0 };
const antes = rojoAntes(base, nuevos, fuentes);
const texto = cuerpo({
  titulo: arg("titulo"),
  ahora,
  antes,
  talla: tamano(git("diff", "--numstat", base, "HEAD")),
  tragados: fallosTragados(git("diff", "-U0", base, "HEAD")),
  refs: arg("refs"),
});
const salida = arg("salida");
if (salida) writeFileSync(salida, `${texto}\n`);
else console.log(texto);
if (ahora.codigo !== 0) {
  console.error(`⚠️ Los tests tocados no pasan (código ${ahora.codigo}): arréglalo antes de abrir el PR.`);
  process.exitCode = 1;
}
