/**
 * dominios.mjs — qué dominios tienen skill y cuándo toca abrirla.
 *
 * Lee el mapa único `.claude/dominios-skills.json` (ver su `_nota`). Lo usan:
 *   - la guardia (guardia.mjs): la puerta de lectura, sobre el COMANDO entero;
 *   - scripts/runbook-pr.mjs (el CI): la línea «Runbook:» del PR, sobre las RUTAS.
 * Sin dependencias, para que corra igual en una sesión y en el CI.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Une las continuaciones de línea (`\` o acento grave de PowerShell al final de
 * línea) antes de mirar nada: partido en dos, un comando esconde su destino.
 */
export const unirContinuaciones = (o) => String(o).replace(/[\\\x60]\r?\n\s*/g, " ");

const compilados = new WeakMap();
function compilar(mapa) {
  let c = compilados.get(mapa);
  if (!c) {
    c = Object.entries(mapa.skills).map(([skill, d]) => ({
      skill,
      comandos: (d.comandos ?? []).map((p) => new RegExp(p, "i")),
      rutas: (d.rutas ?? []).map((p) => new RegExp(p)),
    }));
    compilados.set(mapa, c);
  }
  return c;
}

/** El mapa de `<raiz>/.claude/dominios-skills.json`, o null si no se puede leer o está mal. */
export function cargarMapa(raiz) {
  try {
    const mapa = JSON.parse(readFileSync(join(raiz, ".claude", "dominios-skills.json"), "utf8"));
    if (!mapa || typeof mapa.skills !== "object") return null;
    compilar(mapa); // un patrón que no compila deja el mapa inservible: mejor sin mapa que a medias
    return mapa;
  } catch {
    return null;
  }
}

/** Skills cuyo comando de riesgo aparece en `cmd`. Mira el comando entero, no un tramo. */
export function skillsDeComando(cmd, mapa) {
  if (!mapa) return [];
  const c = unirContinuaciones(cmd);
  return compilar(mapa).filter((d) => d.comandos.some((re) => re.test(c))).map((d) => d.skill);
}

/** Skills cuyas rutas toca alguno de `ficheros` (rutas del repo, con / o \). */
export function skillsDeFicheros(ficheros, mapa) {
  if (!mapa) return [];
  const lista = ficheros.map((f) => String(f).replace(/\\/g, "/").replace(/^\.\//, ""));
  return compilar(mapa).filter((d) => lista.some((f) => d.rutas.some((re) => re.test(f)))).map((d) => d.skill);
}

/** Los ficheros que hacen que `skill` aplique (para decirle al autor por qué). */
export function ficherosDe(skill, ficheros, mapa) {
  const d = compilar(mapa).find((x) => x.skill === skill);
  if (!d) return [];
  return ficheros.map((f) => String(f).replace(/\\/g, "/")).filter((f) => d.rutas.some((re) => re.test(f)));
}
