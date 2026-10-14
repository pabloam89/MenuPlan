/**
 * ghConRenovacion.mjs — el punto único por el que los scripts de Node llaman a `gh` (E3 #731, fondo #715).
 *
 * Por qué: el token de la App dura 1 hora y se escribe una vez en el entorno de la sesión. Pasada la
 * hora, todo script que llama a `gh` da 401. El shim de E1 (`scripts/bin/gh`) no lo remedia: es un script
 * de sh en el PATH y `execFileSync("gh")` sin shell no lo ve (comprobado el 13 oct 2026).
 *
 * Qué hace, ANTES de la llamada y sin mirar jamás la respuesta:
 *   1. El token del proceso es el de la caché y tiene menos de 45 min -> se usa tal cual (`sin-renovar`).
 *      La edad sale de `expiraEn` menos 60 min, sin campo nuevo en la caché: 45 min o más es lo mismo que
 *      quedar MARGEN_MS (15 min) o menos de vida.
 *   2. La caché guarda otro token vigente -> el del proceso es viejo: se usa el de la caché, sin canjear
 *      (`renovada` / `cache-mas-nueva`; no se mira su edad).
 *   3. Si no, hay que canjear (`renovada` / `vencida-por-edad`): se lanza `token-sesion.mjs --comprobar`,
 *      que pasa por `tokenConCache` y deja el token en la caché (nunca lo imprime), y se relee la caché.
 *      Si el canje falla, o hay un fallo guardado de hace menos de 30 s (#508), la llamada se hace igual con
 *      el token que había (`fallo`): puede dar 401 y no se reintenta.
 *
 * NUNCA reintenta: una escritura (un comentario, un merge) no se repite. Una sola llamada, con el token
 * elegido en un `env` explícito. Deja una línea `credencial-sesion resultado: … motivo: …` (el motivo es de
 * MOTIVOS, el único vocabulario, o `-`); sin el token ni parte de él. Para no llenar la salida de
 * quien llama, `sin-renovar` se escribe una sola vez por proceso.
 *
 * Fuera de este punto solo llaman a `gh` las excepciones de `scripts/ghConRenovacion.test.js` (con su motivo).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORMA_TOKEN, MARGEN_MS, falloReciente, leerCache, rutaDeCache } from "./cacheTokenSesion.mjs";
import { MOTIVOS, MOTIVOS_DE_RENOVACION, idsPorDefecto } from "./tokenSesion.mjs";

const SCRIPT_TOKEN = join(dirname(fileURLToPath(import.meta.url)), "..", "token-sesion.mjs");
/** Tope del canje: un canje normal tarda unos segundos (la lectura de 1Password, la más lenta). */
export const TOPE_CANJE_MS = 20_000;
/** Vida de un token de instalación, de la que sale la edad: edad = VIDA_MS - lo que le queda. */
export const VIDA_MS = 60 * 60 * 1000;
/** Desde esta edad el token se cambia antes de llamar. */
export const UMBRAL_EDAD_MS = VIDA_MS - MARGEN_MS;

export const RESULTADOS = ["renovada", "sin-renovar", "fallo"];
/** La tabla cerrada resultado × motivo. `fallo`: cualquier causa de MOTIVOS (no los de renovación ni el del arranque). */
const CAUSAS_DE_FALLO = MOTIVOS.filter((m) => !MOTIVOS_DE_RENOVACION.includes(m) && m !== "ruta-de-shim-rara");
export const MOTIVOS_POR_RESULTADO = {
  renovada: MOTIVOS_DE_RENOVACION,
  "sin-renovar": ["-"],
  fallo: CAUSAS_DE_FALLO,
};

/** La línea contable. Lanza si la combinación no está en la tabla. */
export function lineaCredencial({ resultado, motivo = "-" }) {
  if (!RESULTADOS.includes(resultado)) throw new Error(`resultado fuera del vocabulario: ${resultado}`);
  if (!MOTIVOS_POR_RESULTADO[resultado].includes(motivo)) throw new Error(`motivo fuera de la tabla para ${resultado}: ${motivo}`);
  return `credencial-sesion resultado: ${resultado} motivo: ${motivo}`;
}

/**
 * Qué hacer con el token, a partir de lo que hay en el entorno y de lo que dice la caché (`leerCache`).
 * Devuelve { accion: "usar-entorno" | "usar-cache" | "canjear", resultado, motivo }; función pura.
 */
export function planDeToken({ tokenEnv, lectura }) {
  const ok = lectura?.motivo === "ok";
  const vigente = ok && lectura.restanteMs > MARGEN_MS;
  const delaCache = ok ? lectura.entrada.token : null;
  if (tokenEnv && delaCache === tokenEnv) {
    return vigente
      ? { accion: "usar-entorno", resultado: "sin-renovar", motivo: "-" }
      : { accion: "canjear", resultado: "renovada", motivo: "vencida-por-edad" };
  }
  if (vigente) return { accion: "usar-cache", resultado: "renovada", motivo: "cache-mas-nueva" };
  // Sin otro token vigente en la caché, o con un token del proceso que no está en ella (edad desconocida)
  return { accion: "canjear", resultado: "renovada", motivo: "vencida-por-edad" };
}

/** El motivo de MOTIVOS que dejó escrito `token-sesion.mjs` al fallar (`… motivo: <motivo> (…)`). */
export function motivoDeSalida(stderr) {
  const m = /motivo: ([a-z][a-z0-9-]*)/.exec(String(stderr ?? ""));
  return m && CAUSAS_DE_FALLO.includes(m[1]) ? m[1] : "error-interno";
}

/**
 * El canje de verdad, síncrono (los scripts llaman a `gh` con execFileSync): lanza
 * `token-sesion.mjs --comprobar`, que deja el token en la caché y no lo imprime. Devuelve { ok } o { motivo }.
 */
export function renovarEnCache({ correr = spawnSync, env = process.env } = {}) {
  const h = correr(process.execPath, [SCRIPT_TOKEN, "--comprobar"], { env, encoding: "utf8", timeout: TOPE_CANJE_MS, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  if (h?.error) return { motivo: h.error.code === "ETIMEDOUT" ? "red" : "error-interno" };
  return h?.status === 0 ? { ok: true } : { motivo: motivoDeSalida(h?.stderr) };
}

/**
 * Elige el token para UNA llamada. Todo se inyecta para probarlo sin red ni disco.
 * Devuelve { token?, resultado, motivo }; sin `token`, la llamada usa el entorno tal cual.
 */
export function elegirToken({ env = process.env, ruta = rutaDeCache(env), ids = idsPorDefecto, reloj = Date.now, cache = {}, renovar = renovarEnCache, fallo = {} } = {}) {
  const tokenEnv = FORMA_TOKEN.test(String(env.GH_TOKEN)) ? env.GH_TOKEN : null;
  // En CI el token es el del workflow y no hay caché ni 1Password: nada que renovar
  if (!ruta || env.GITHUB_ACTIONS === "true") return { resultado: "sin-renovar", motivo: "-" };
  const { appId, installationId } = ids();
  const leer = () => leerCache({ ruta, ids: { appId, installationId }, reloj, ...cache });
  const lectura = leer();
  const plan = planDeToken({ tokenEnv, lectura });
  if (plan.accion === "usar-entorno") return { resultado: plan.resultado, motivo: plan.motivo };
  if (plan.accion === "usar-cache") return { token: lectura.entrada.token, resultado: plan.resultado, motivo: plan.motivo };
  const opcionesFallo = { fs: cache.fs, proteger: cache.proteger, permisosBien: cache.permisosBien, ...fallo };
  const sinCambio = (motivo) => ({ ...(tokenEnv ? { token: tokenEnv } : {}), resultado: "fallo", motivo });
  // Tras un canje fallido no se canjea otra vez en 30 s (#508): la llamada sigue con lo que había
  if (falloReciente({ ruta, reloj, ...opcionesFallo })) return sinCambio("fallo-reciente");
  const r = renovar();
  if (!r.ok) {
    falloReciente({ ruta, guardar: r.motivo, reloj, ...opcionesFallo });
    return sinCambio(r.motivo);
  }
  const nueva = leer();
  if (nueva.motivo !== "ok") return sinCambio("error-interno");
  return { token: nueva.entrada.token, resultado: plan.resultado, motivo: plan.motivo };
}

let sinRenovarYaDicho = false;
const registrarPorDefecto = (linea) => console.error(linea);

/**
 * `execFileSync("gh", args, opciones)` con el token elegido antes de la llamada. Una sola llamada, sin
 * reintento: lo que lance `gh` (un código distinto de 0, un tiempo agotado) lo recibe quien llama tal cual.
 * `deps`: { ejecutar, registrar, ...lo de elegirToken }, para probarlo.
 */
export function ghConRenovacion(args, opciones = {}, { ejecutar = execFileSync, registrar = registrarPorDefecto, ...resto } = {}) {
  const env = opciones.env ?? process.env;
  const e = elegirToken({ env, ...resto });
  if (e.resultado !== "sin-renovar" || !sinRenovarYaDicho) registrar(lineaCredencial(e));
  if (e.resultado === "sin-renovar") sinRenovarYaDicho = true;
  const envHijo = e.token ? { ...env, GH_TOKEN: e.token } : env;
  return ejecutar("gh", args, { ...opciones, env: envHijo });
}

/** Para los tests: olvida que ya se dijo `sin-renovar`. */
export const _reiniciarAvisos = () => {
  sinRenovarYaDicho = false;
};
