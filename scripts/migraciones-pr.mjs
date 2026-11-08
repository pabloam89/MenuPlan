#!/usr/bin/env node
/**
 * migraciones-pr.mjs — las dos protecciones de las migraciones que daba la guardia, en el CI (#878).
 *
 * Hasta #878 las daba la guardia de cada sesión (`.claude/hooks/migraciones.mjs` y
 * `migracionCerrada` en `guardia.mjs`). Al desconectarla, pasan aquí, dentro del job `tests`
 * (el único check obligatorio), para que ninguna sesión las salte:
 *
 *  1. Una migración APLICADA no se toca. Producción ya ejecutó su versión: un cambio en el fichero
 *     no llega a la base y nadie lo notaría. Aplicada = está en la base del PR y `supabase/ESTADO.md`
 *     (el de la base) no la da por «Sin aplicar». Lo que se corrige va en una migración nueva.
 *  2. Ningún número nuevo repetido con OTRO PR abierto a la misma base. El ruleset de staging no
 *     pide estar al día (`strict` apagado, `scripts/rulesets.mjs`): dos PR con la misma 00XX pasan
 *     `supabase/migrations.test.js` cada uno por su lado y se fusionan los dos. Aquí el segundo ve
 *     abierto al primero y falla; si el primero ya se fusionó, lo ve `migrations.test.js`.
 *
 * Uso (lo lanza el CI):
 *   GITHUB_TOKEN=… GITHUB_REPOSITORY=… PR_NUMBER=… PR_BASE=staging \
 *     node scripts/migraciones-pr.mjs <git diff --name-status de la base al PR> <ESTADO.md de la base>
 * Solo llama a la API si el PR añade una migración. Si la API no responde, falla con la causa
 * (relanza el check): una protección que se salta sola cuando falla la red no protege.
 * Deja la línea `migraciones-pr resultado: ok|falla`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MIGRACION = /^supabase\/migrations\/((\d{4})[\w-]*)\.sql$/;

/** Las que ESTADO.md da por «Sin aplicar» en su tabla de resumen; null si no hay esa línea. */
export function sinAplicar(estadoMd) {
  const linea = String(estadoMd ?? "").split("\n").find((l) => /\|\s*\*\*Sin aplicar\*\*\s*\|/.test(l));
  if (!linea) return null;
  return new Set([...linea.matchAll(/`(\d{4}_[\w-]+)`/g)].map((m) => m[1]));
}

/**
 * Lee `git diff --name-status` (con o sin renombrados). Devuelve las migraciones que el PR
 * añade y las que ya existían en la base y el PR cambia, borra o renombra.
 */
export function migracionesDelDiff(nameStatus) {
  const nuevas = [];
  const tocadas = [];
  for (const linea of String(nameStatus ?? "").split("\n")) {
    const partes = linea.replace(/\r$/, "").split("\t");
    if (partes.length < 2) continue;
    const estado = partes[0].charAt(0);
    const [origen, destino] = [partes[1], partes[2]];
    if (estado === "A" || estado === "C") {
      const ruta = estado === "C" ? destino : origen;
      const m = ruta?.match(MIGRACION);
      if (m) nuevas.push(m[1]);
    } else if (estado === "R") {
      const viejo = origen?.match(MIGRACION);
      const nuevo = destino?.match(MIGRACION);
      if (viejo) tocadas.push(viejo[1]);
      if (nuevo) nuevas.push(nuevo[1]);
    } else if (estado === "M" || estado === "D" || estado === "T") {
      const m = origen?.match(MIGRACION);
      if (m) tocadas.push(m[1]);
    }
  }
  return { nuevas, tocadas };
}

/** Regla 1: las tocadas que la base da por aplicadas. Sin la línea «Sin aplicar», todas cuentan como aplicadas (falla cerrado). */
export function aplicadasTocadas(tocadas, estadoMd) {
  const libres = sinAplicar(estadoMd);
  return tocadas.filter((n) => !libres || !libres.has(n));
}

/**
 * Regla 2: los choques entre las nuevas de este PR y las que añaden los otros PR abiertos.
 * `otros`: [{ numero, migraciones: ["0099_x", …] }]. Mismo número y otro nombre = choque; el mismo
 * fichero en dos PR (una rama que trae la de otra) no lo es.
 */
export function choquesDeNumero(nuevas, otros) {
  const choques = [];
  for (const mia of nuevas) {
    for (const pr of otros) {
      for (const suya of pr.migraciones) {
        if (suya.slice(0, 4) === mia.slice(0, 4) && suya !== mia) choques.push({ mia, suya, pr: pr.numero });
      }
    }
  }
  return choques;
}

async function api(ruta, token) {
  const r = await fetch(`https://api.github.com/${ruta}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!r.ok) throw new Error(`GET ${ruta}: HTTP ${r.status}`);
  return r.json();
}

/** Las migraciones que añade cada PR abierto a `base`, salvo `propio`. Página a página (100 por página). */
export async function migracionesDeOtrosPr({ repo, base, propio, token, pedir = api }) {
  const prs = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const lote = await pedir(`repos/${repo}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=100&page=${pagina}`, token);
    prs.push(...lote);
    if (lote.length < 100) break;
  }
  const otros = [];
  for (const pr of prs) {
    if (pr.number === propio) continue;
    const migraciones = [];
    for (let pagina = 1; pagina <= 30; pagina++) {
      const ficheros = await pedir(`repos/${repo}/pulls/${pr.number}/files?per_page=100&page=${pagina}`, token);
      for (const f of ficheros) {
        const m = (f.status === "added" || f.status === "renamed" || f.status === "copied") && f.filename.match(MIGRACION);
        if (m) migraciones.push(m[1]);
      }
      if (ficheros.length < 100) break;
    }
    if (migraciones.length) otros.push({ numero: pr.number, migraciones });
  }
  return otros;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [ficheroDiff, ficheroEstado] = process.argv.slice(2);
  const { nuevas, tocadas } = migracionesDelDiff(readFileSync(ficheroDiff, "utf8"));
  let estado = "";
  try {
    estado = readFileSync(ficheroEstado, "utf8");
  } catch {
    // a propósito: sin ESTADO.md de la base, sinAplicar da null y toda migración tocada cuenta como aplicada (falla cerrado)
  }
  const errores = [];
  for (const n of aplicadasTocadas(tocadas, estado)) {
    errores.push(`${n} está aplicada (no sale en «Sin aplicar» de supabase/ESTADO.md) y el PR la cambia, la borra o la renombra. Producción ya ejecutó su versión: escribe una migración nueva que la corrija.`);
  }
  if (nuevas.length) {
    const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER, PR_BASE: base = "staging" } = process.env;
    try {
      if (!token || !repo) throw new Error("faltan GITHUB_TOKEN o GITHUB_REPOSITORY");
      const otros = await migracionesDeOtrosPr({ repo, base, propio: Number(PR_NUMBER), token });
      for (const c of choquesDeNumero(nuevas, otros)) {
        errores.push(`${c.mia} usa el número ${c.mia.slice(0, 4)}, que ya lleva el PR #${c.pr} abierto (${c.suya}). Coge el siguiente número libre.`);
      }
    } catch (e) {
      errores.push(`No he podido listar los PR abiertos para comprobar el número de ${nuevas.join(", ")} (${e.message}). Relanza el check.`);
    }
  }
  console.log(`migraciones-pr resultado: ${errores.length ? "falla" : "ok"}`);
  for (const e of errores) console.log(`::error::${e}`);
  if (errores.length) process.exit(1);
}
