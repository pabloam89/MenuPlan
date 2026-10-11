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
 *
 * Limitación: cupos de la identidad gh del arranque y de 1Password; la cuota de la App homenu-sesiones no se mide si no se pide, así que que no haya aviso no garantiza que la App tenga cuota.
 * «Si se pide» = hay un token de la App ya guardado por `tokenSesion` (se LEE de su caché, sin
 * canjear ni guardar uno nuevo, sin gastar lecturas de 1Password ni imprimirlo): entonces se
 * mide también la App (identidad: app). Cada identidad tiene su propia caché y su propio nombre en la línea.
 */
import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { dirCuota, escribirCacheGh, leerCacheGh, registrarGh } from "./cuotaGh.mjs";
import { leerCache, rutaDeCache } from "./cacheTokenSesion.mjs";
import { entornoOp } from "./env.mjs";
import { APP_ID } from "./tokenSesion.mjs";

/** A partir de este porcentaje de uso se avisa. */
export const UMBRAL_CUPO = 80;
/** Minutos de vida de la lectura guardada (la misma para todas las sesiones). */
export const TTL_CUPOS_MIN = 5;
/** Tope de cada llamada y de todo el aviso: el arranque ya tarda. */
export const TOPE_CUPOS_MS = 4000;

/** Vocabulario cerrado. */
export const CUPOS = ["github-graphql", "github-rest", "1password-token", "1password-cuenta"];
export const FUENTES_CUPO = ["github", "github-app", "1password"];
/** Con qué identidad de gh se mide la cuota de GitHub. */
export const IDENTIDADES_CUPO = ["pablo", "app"];
export const MOTIVOS_CUPO = ["sin-gh", "sin-op", "sin-token", "sin-respuesta", "formato-raro", "limite-agotado"];

const UNIDAD_MS = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000 };

/** { cupo, limit, used, resetMs } de la salida JSON de `gh api rate_limit`; lanza `formato-raro` si no cuadra. */
export function parsearGh(texto, identidad = "pablo") {
  let r;
  try {
    r = JSON.parse(texto).resources;
  } catch {
    throw errorCupo("formato-raro");
  }
  const fila = (cupo, x) => ({ cupo, identidad, limit: Number(x?.limit), used: Number(x?.used), resetMs: Number.isFinite(Number(x?.reset)) ? Number(x.reset) * 1000 : null });
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
  if (e?.code === "SIN_TOKEN") return "sin-token";
  if (e?.code === "ENOENT") return fuente === "1password" ? "sin-op" : "sin-gh";
  if (/too many requests|rate limit exceeded|api rate limit/i.test(texto)) return "limite-agotado";
  if (/no hay token|service account|gh auth login|not logged|authentication|bad credentials|401/i.test(texto)) return "sin-token";
  return "sin-respuesta";
}

const lanzar = (cmd, args, env) =>
  new Promise((ok, mal) => {
    execFile(cmd, args, { windowsHide: true, encoding: "utf8", timeout: TOPE_CUPOS_MS, env }, (error, stdout, stderr) => {
      if (error) mal(Object.assign(error, { stderr }));
      else ok(stdout);
    });
  });

/**
 * El token de la App que `tokenSesion` ya dejó guardado, o null. Solo LEE el fichero de caché
 * (no canjea, no toca 1Password, no guarda nada); el token no se imprime ni se registra.
 */
export function tokenDeLaAppGuardado() {
  try {
    const ruta = rutaDeCache();
    if (!ruta) return null;
    const l = leerCache({ ruta, ids: { appId: APP_ID, installationId: null } });
    return l.motivo === "ok" ? l.entrada.token : null;
  } catch {
    // a propósito: sin token guardado la App simplemente no se mide
    return null;
  }
}

/** Las llamadas de verdad, cambiables en los tests. */
export const pedirGh = () => {
  registrarGh("cupos", ["api", "rate_limit"]);
  return lanzar("gh", ["api", "rate_limit"]);
};
export const pedirGhApp = () => {
  const token = tokenDeLaAppGuardado();
  if (!token) return Promise.reject(errorCupo("sin-token"));
  registrarGh("cupos", ["api", "rate_limit"]);
  return lanzar("gh", ["api", "rate_limit"], { ...process.env, GH_TOKEN: token });
};
// `op` directo (no por op.mjs): si vence el tope se mata `op` mismo y no queda un hijo huérfano.
// `entornoOp` lee el token del llavero (síncrono, una vez por proceso) y lanza SIN_TOKEN si no hay.
export const pedirOp = () => {
  let env;
  try {
    env = entornoOp();
  } catch (e) {
    return Promise.reject(e);
  }
  return lanzar("op", ["service-account", "ratelimit"], env);
};

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
      altos.push(`cupo: ${c.cupo}${c.identidad ? ` identidad: ${c.identidad}` : ""} uso: ${pct} % ${cuando}`);
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

/** Las identidades por las que corre el arranque: sin GH_TOKEN, `gh` va como Pablo; con él, ya es la App. */
export const identidadDelEntorno = (env = process.env) => (env.GH_TOKEN ? "app" : "pablo");

/**
 * Lo que llama el arranque: lanza las lecturas a la vez y devuelve la línea o null.
 * No lanza nunca y no pasa de `tope` (pasado el tope, calla).
 * - GitHub de la identidad del arranque (`gh`), con su caché propia (`cupo-github-pablo` o `-app`).
 * - GitHub de la App homenu-sesiones, solo si el entorno no es ya la App y hay un token suyo guardado.
 *   `despuesDe` es la promesa de la identidad del arranque: ese token puede estar escribiéndose
 *   ahora mismo, así que se espera (como mucho `esperaApp` ms) antes de mirar la caché del token.
 * - 1Password (token y cuenta).
 */
export async function avisoDeCupos({ gh = pedirGh, ghApp = pedirGhApp, op = pedirOp, dir = dirCuota(), ahora = Date.now(), tope = TOPE_CUPOS_MS + 500, registrar = registrarCupos, identidad = identidadDelEntorno(), despuesDe = null, esperaApp = 6000 } = {}) {
  let reloj;
  const limite = new Promise((ok) => {
    reloj = setTimeout(() => ok(null), tope + (despuesDe ? esperaApp : 0));
  });
  const esperar = async () => {
    if (!despuesDe) return;
    let t;
    await Promise.race([Promise.resolve(despuesDe).catch(() => {
        // a propósito: si la identidad falla, igual se mira si hay token guardado
      }), new Promise((ok) => (t = setTimeout(ok, esperaApp)))]);
    clearTimeout(t);
  };
  try {
    const parsearDe = (id) => (texto) => parsearGh(texto, id);
    const fuentes = [
      leerFuente(`github-${identidad}`, "github", gh, parsearDe(identidad), { dir, ahora }).then((r) => ({ fuente: "github", ...r })),
      leerFuente("1password", "1password", op, parsearOp, { dir, ahora }).then((r) => ({ fuente: "1password", ...r })),
    ];
    if (identidad !== "app") {
      fuentes.splice(1, 0, esperar().then(async () => {
        // sin token de la App guardado no hay nada que medir ni que decir: no es un fallo
        const r = await leerFuente("github-app", "github", ghApp, parsearDe("app"), { dir, ahora });
        return r.motivo === "sin-token" ? null : { fuente: "github-app", ...r };
      }));
    }
    const lecturas = await Promise.race([Promise.all(fuentes).then((l) => l.filter(Boolean)), limite]);
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

/** Cuenta las líneas de `cupos.log`: avisos por cupo (con su identidad) y cupos sin ver por fuente y motivo. */
export function contarCupos(texto) {
  const r = {};
  const suma = (k) => (r[k] = (r[k] ?? 0) + 1);
  for (const m of String(texto).matchAll(/cupo: (\S+)(?: identidad: (\S+))? uso: (\d+) %/g)) suma(m[2] ? `aviso ${m[1]}/${m[2]}` : `aviso ${m[1]}`);
  for (const m of String(texto).matchAll(/cupo sin ver: (\S+) motivo: ([\w-]+)/g)) suma(`sin-ver ${m[1]}/${m[2]}`);
  return r;
}
