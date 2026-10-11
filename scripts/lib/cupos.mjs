/**
 * Los cupos compartidos entre sesiones, vistos desde el arranque (#578, norma I4).
 *
 * El 10 y el 11 oct 2026 se agotaron dos cupos con varias sesiones a la vez: la
 * cuota de GitHub (#424, #477) y las lecturas de 1Password de la cuenta de
 * servicio (#556). Nadie lo veía venir. Aquí se miran y, si alguno pasa del 80 %,
 * el arranque lo dice en UNA línea con su hora de reinicio.
 *
 * - GitHub: `gh api rate_limit` (REST, no gasta cuota) trae `core` y `graphql` en
 *   la misma llamada: 1 llamada para los dos. Mide la identidad con la que corre
 *   el arranque (la de `gh` por defecto), que es la que gasta el propio arranque.
 * - 1Password: `npm run op -- service-account ratelimit` (la tabla LIMIT/USED/
 *   REMAINING/RESET del token y de la cuenta). Contestó con el cupo agotado
 *   (#556), así que no depende de tener lecturas libres.
 *
 * Cada fuente: 1 llamada por arranque como mucho, con caché de unos minutos en la
 * carpeta de `cuotaGh` (otra sesión que arranca ya la ve). Es un aviso, no un
 * bloqueo: si no se puede leer, el arranque sigue; solo dice «cupo sin ver» con un
 * motivo del vocabulario cerrado. Sin datos de personas: solo cupo, porcentaje y hora.
 */
import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { dirCuota, escribirCacheGh, leerCacheGh, registrarGh } from "./cuotaGh.mjs";

/** A partir de este porcentaje de uso se avisa. */
export const UMBRAL_CUPO = 80;
/** Minutos de vida de la lectura guardada (la misma para todas las sesiones). */
export const TTL_CUPOS_MIN = 5;
/** Tope de cada llamada y de todo el aviso: el arranque ya tarda. */
export const TOPE_CUPOS_MS = 4000;

/** Vocabulario cerrado. */
export const CUPOS = ["github-graphql", "github-rest", "1password-token", "1password-cuenta"];
export const FUENTES_CUPO = ["github", "1password"];
export const MOTIVOS_CUPO = ["sin-gh", "sin-op", "sin-token", "sin-respuesta", "formato-raro", "limite-agotado"];

const UNIDAD_MS = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000 };

/** { cupo, limit, used, resetMs } de la salida JSON de `gh api rate_limit`; lanza `formato-raro` si no cuadra. */
export function parsearGh(texto) {
  let r;
  try {
    r = JSON.parse(texto).resources;
  } catch {
    throw errorCupo("formato-raro");
  }
  const fila = (cupo, x) => ({ cupo, limit: Number(x?.limit), used: Number(x?.used), resetMs: Number.isFinite(Number(x?.reset)) ? Number(x.reset) * 1000 : null });
  const cupos = [fila("github-rest", r?.core), fila("github-graphql", r?.graphql)].filter((c) => c.limit > 0 && Number.isFinite(c.used));
  if (!cupos.length) throw errorCupo("formato-raro");
  return cupos;
}

/**
 * La tabla de `op service-account ratelimit`. Los que importan son las lecturas del token
 * (`token read`) y el cupo de la cuenta (`account …`), que comparten todas las sesiones.
 * El reinicio viene en relativo («22 minutes from now»): se guarda absoluto.
 */
export function parsearOp(texto, ahora = Date.now()) {
  const cupos = [];
  for (const l of String(texto).split(/\r?\n/)) {
    const m = /^(token|account)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*?)\s*$/.exec(l);
    if (!m) continue;
    const [, tipo, accion, limit, used, , reset] = m;
    const cupo = tipo === "account" ? "1password-cuenta" : accion === "read" ? "1password-token" : null;
    if (!cupo || !(Number(limit) > 0)) continue;
    const r = /(\d+)\s+(second|minute|hour|day)s?\s+from now/.exec(reset);
    cupos.push({ cupo, limit: Number(limit), used: Number(used), resetMs: r ? ahora + Number(r[1]) * UNIDAD_MS[r[2]] : null });
  }
  if (!cupos.length) throw errorCupo("formato-raro");
  return cupos;
}

function errorCupo(motivo) {
  return Object.assign(new Error(motivo), { motivoCupo: motivo });
}

/** El motivo del vocabulario de un fallo al lanzar la consulta. */
export function motivoDeFallo(e, fuente) {
  if (e?.motivoCupo && MOTIVOS_CUPO.includes(e.motivoCupo)) return e.motivoCupo;
  const texto = `${e?.stderr ?? ""} ${e?.message ?? ""}`;
  if (e?.code === "ENOENT") return fuente === "github" ? "sin-gh" : "sin-op";
  if (/too many requests|rate limit exceeded|api rate limit/i.test(texto)) return "limite-agotado";
  if (/no hay token|gh auth login|not logged|authentication|bad credentials|401/i.test(texto)) return "sin-token";
  return "sin-respuesta";
}

const lanzar = (cmd, args, cwd) =>
  new Promise((ok, mal) => {
    execFile(cmd, args, { windowsHide: true, encoding: "utf8", timeout: TOPE_CUPOS_MS, cwd, stdio: ["ignore", "pipe", "pipe"] }, (error, stdout, stderr) => {
      if (error) mal(Object.assign(error, { stderr }));
      else ok(stdout);
    });
  });

const OP_MJS = fileURLToPath(new URL("../op.mjs", import.meta.url));

/** Las llamadas de verdad, cambiables en los tests. */
export const pedirGh = () => {
  registrarGh("cupos", ["api", "rate_limit"]);
  return lanzar("gh", ["api", "rate_limit"]);
};
export const pedirOp = () => lanzar(process.execPath, [OP_MJS, "service-account", "ratelimit"]);

/**
 * Una fuente con su caché. Devuelve { cupos } o { motivo }. Sin caché vigente hace UNA
 * llamada. Lo guardado es la lectura con su hora; un cupo cuyo reinicio ya pasó no cuenta.
 */
async function leerFuente(nombre, fuente, pedir, parsear, { dir, ahora }) {
  const cache = leerCacheGh(`cupo-${nombre}`, { dir, ahora });
  if (cache && cache.minutos >= 0 && cache.minutos < TTL_CUPOS_MIN && Array.isArray(cache.valor)) return { cupos: cache.valor };
  try {
    const cupos = parsear(await pedir(), ahora);
    escribirCacheGh(`cupo-${nombre}`, cupos, { dir });
    return { cupos };
  } catch (e) {
    return { motivo: motivoDeFallo(e, fuente) };
  }
}

export const porcentaje = (c) => Math.round((c.used / c.limit) * 100);

const horaMadrid = (ms) => new Date(ms).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
function enCuanto(ms, ahora) {
  const min = Math.max(1, Math.round((ms - ahora) / 60_000));
  return min >= 120 ? `${Math.round(min / 60)} h` : `${min} min`;
}

/**
 * La línea del arranque, o null si todo está por debajo del umbral y se pudo ver todo.
 * `lecturas` es [{ fuente, cupos } | { fuente, motivo }].
 */
export function lineaDeCupos(lecturas, ahora = Date.now(), umbral = UMBRAL_CUPO) {
  const altos = [];
  const sinVer = [];
  for (const l of lecturas) {
    if (l.motivo) {
      sinVer.push(`cupo sin ver: ${l.fuente} motivo: ${MOTIVOS_CUPO.includes(l.motivo) ? l.motivo : "sin-respuesta"}`);
      continue;
    }
    for (const c of l.cupos) {
      if (c.resetMs !== null && c.resetMs <= ahora) continue; // ya se reinició: la lectura guardada está vieja
      const pct = porcentaje(c);
      if (pct < umbral) continue;
      const cuando = c.resetMs === null ? "reinicio: desconocido" : `reinicio: ${horaMadrid(c.resetMs)} (en ${enCuanto(c.resetMs, ahora)})`;
      altos.push(`cupo: ${c.cupo} uso: ${pct} % ${cuando}`);
    }
  }
  if (!altos.length && !sinVer.length) return null;
  if (!altos.length) return `${sinVer.join("; ")}.`;
  return `Cupos al ${umbral} % o más (compartidos entre sesiones; gasta menos hasta el reinicio) — ${[...altos, ...sinVer].join("; ")}.`;
}

/** Anota la línea en `cupos.log` (cuota) para poder contarla. Nunca rompe. */
export function registrarCupos(linea, { dir = dirCuota(), ahora = new Date() } = {}) {
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "cupos.log"), `${ahora.toISOString()} ${linea}\n`);
  } catch {
    // a propósito: contar es una ayuda; sin disco la línea sale igual en el arranque
  }
}

/**
 * Lo que llama el arranque: lanza las dos lecturas a la vez y devuelve la línea o null.
 * No lanza nunca y no pasa de TOPE_CUPOS_MS (pasado el tope, calla: «sin-respuesta»).
 */
export async function avisoDeCupos({ gh = pedirGh, op = pedirOp, dir = dirCuota(), ahora = Date.now(), tope = TOPE_CUPOS_MS + 500, registrar = registrarCupos } = {}) {
  let reloj;
  const limite = new Promise((ok) => {
    reloj = setTimeout(() => ok(null), tope);
  });
  try {
    const trabajo = Promise.all([
      leerFuente("github", "github", gh, parsearGh, { dir, ahora }),
      leerFuente("1password", "1password", op, parsearOp, { dir, ahora }),
    ]).then(([g, o]) => [{ fuente: "github", ...g }, { fuente: "1password", ...o }]);
    const lecturas = await Promise.race([trabajo, limite]);
    if (!lecturas) return null;
    const linea = lineaDeCupos(lecturas, ahora);
    if (linea) registrar(linea, { dir });
    return linea;
  } catch {
    // a propósito: un aviso no puede romper el arranque; sin línea, sigue con lo demás
    return null;
  } finally {
    clearTimeout(reloj);
  }
}
