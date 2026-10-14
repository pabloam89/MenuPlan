import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * .vercelignore deja fuera `scripts/*` y vuelve a meter, uno a uno, lo que el build
 * de Vercel necesita. El 14 oct 2026 (#284) vite.config.js empezó a importar
 * scripts/lib/prioridad.mjs, que no estaba re-incluido, y el despliegue de la rama
 * falló sin que ningún test lo viera. Aquí: todo fichero de scripts/ que carga el
 * build (imports de vite.config.js, los `node scripts/…` de prebuild y build, y lo
 * que esos importan a su vez) tiene su línea `!scripts/…` en .vercelignore.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (f) => readFileSync(join(RAIZ, f), "utf8");

/** Imports relativos de un fichero, como rutas del repo con barras normales. */
function importsRelativos(fichero) {
  const texto = leer(fichero);
  const rutas = [...texto.matchAll(/^\s*import\s[^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm)].map((m) => m[1]);
  return rutas.map((r) => posix.normalize(posix.join(posix.dirname(fichero), r)));
}

/** Lo que carga el build de Vercel dentro de scripts/, con lo que eso importa. */
function scriptsDelBuild() {
  const pkg = JSON.parse(leer("package.json"));
  const deScripts = [pkg.scripts.prebuild, pkg.scripts.build].join(" ").match(/scripts\/[\w./-]+\.mjs/g) ?? [];
  const pendientes = [...importsRelativos("vite.config.js"), ...deScripts].filter((f) => f.startsWith("scripts/"));
  const vistos = new Set();
  while (pendientes.length) {
    const f = pendientes.pop();
    if (vistos.has(f) || !existsSync(join(RAIZ, f))) continue;
    vistos.add(f);
    pendientes.push(...importsRelativos(f).filter((g) => g.startsWith("scripts/")));
  }
  return [...vistos].sort();
}

/** ¿Qué ficheros de la lista quedan fuera de Vercel? Solo cuenta un `!ruta` exacto. */
function fueraDeVercel(ficheros, vercelignore) {
  const incluidos = new Set(vercelignore.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("!")).map((l) => l.slice(1)));
  return ficheros.filter((f) => !incluidos.has(f));
}

describe(".vercelignore re-incluye lo que carga el build (#284)", () => {
  it("encuentra lo que se sabe que carga el build", () => {
    const lista = scriptsDelBuild();
    expect(lista).toContain("scripts/lib/env.mjs");
    expect(lista).toContain("scripts/validate-catalog.mjs");
    expect(lista).toContain("scripts/build-bot-core.mjs");
  });

  it("cada uno tiene su `!scripts/…` en .vercelignore", () => {
    expect(fueraDeVercel(scriptsDelBuild(), leer(".vercelignore")), "añade la línea `!<ruta>` a .vercelignore").toEqual([]);
  });

  it("un fichero sin su línea se ve", () => {
    expect(fueraDeVercel(["scripts/lib/nuevo.mjs", "scripts/lib/env.mjs"], "scripts/*\n!scripts/lib/\nscripts/lib/*\n!scripts/lib/env.mjs\n")).toEqual(["scripts/lib/nuevo.mjs"]);
  });
});
