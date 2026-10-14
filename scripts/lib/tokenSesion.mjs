/**
 * tokenSesion.mjs — la identidad de máquina de las sesiones (#329, fondo #326).
 *
 * Genera el token de instalación (1 hora) de la GitHub App `homenu-sesiones`
 * (#327) con su clave de la bóveda de sesiones: un JWT RS256 firmado con
 * node:crypto, canjeado en la API de GitHub. Con ese token `gh` y `git` actúan
 * como `homenu-sesiones[bot]` y no como Pablo.
 *
 * Falla cerrado y sin ruido: si algo no va, lanza un `ErrorTokenSesion` con un
 * motivo del vocabulario (MOTIVOS) y NUNCA con la clave, el JWT ni el token en
 * el mensaje. Quien lo llama (arranque.mjs, por `aplicarIdentidad`) sigue con la
 * identidad actual.
 *
 * `fetch`, el lector de clave y todo lo demás se inyectan para probarlo sin red.
 * Cómo se usa y qué pasa a ser de Pablo: skills `github` y `1password`.
 */
import { execFile } from "node:child_process";
import * as fsReal from "node:fs";
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BOVEDA_PABLO, BOVEDA_SESIONES, entornoOp, leerEnv } from "./env.mjs";
// El canje del token es de E1 (#327): permisos explícitos sin workflows, comprobados al
// volver, y limitado a este repo. Aquí no se repite: se usa.
import { API, ErrorToken, PERMISOS, firmarJwt, pedirToken, sinSecretos } from "../token-sesiones.mjs";
import { FORMA_FECHA, MARGEN_MS, conBloqueo, escribirCache, leerCache, permisosDelUsuario, protegerFichero, rutaDeCache } from "./cacheTokenSesion.mjs";

export const APP_ID = 5260552;
export const REPO = "pabloam89/MenuPlan";
export const BOT_LOGIN = "homenu-sesiones[bot]";
/** Id del usuario bot (público, `GET /users/homenu-sesiones[bot]`): respaldo si la API no contesta. */
export const BOT_ID = 340485937;
export const LOGIN_PABLO = "pabloam89";
const TOPE_MS = 6000;

/** Con qué identidad trabaja la sesión (vocabulario cerrado de la línea `identidad-sesion`). */
export const IDENTIDADES = ["pablo", "app", "otra", "desconocida"];
/** Avisos que no paran el token pero se dicen: la App con más permisos de los pedidos, etc. */
export const ADVERTENCIAS = ["permisos-de-mas", "todos-los-repos", "app-sin-comprobar", "clave-en-HoMenu", "cache-casi-caducada"];
/** Si el token salió de la caché (`si`) o se canjeó (`no`): la última pieza de la línea `identidad-sesion`. */
export const CACHES = ["si", "no"];
/** Presupuesto de toda la identidad en el arranque: el hook muere a los 30 s y no avisa. */
export const TOPE_IDENTIDAD_MS = 13_000;
/** Lo que se deja del presupuesto para comprobar la identidad con `gh` tras sacar el token. */
const MARGEN_IDENTIDAD_MS = 3000;

/** Vocabulario cerrado de por qué no hay token (se cuenta en la línea `identidad-sesion`). */
export const MOTIVOS = ["sin-clave", "clave-ilegible", "sin-instalacion", "github-rechaza", "red", "token-raro", "sin-fichero-de-entorno", "error-interno", "limite-de-1password", "bloqueo-ocupado", "fallo-reciente", "ruta-de-shim-rara"];
/** El valor inválido y nunca vacío que lleva GH_TOKEN cuando no hay token: `gh` da 401 claro y no cae al llavero de Pablo (#673). */
export const TOKEN_CENTINELA = "sin-token-de-sesion";
/** Quién escribe el ayudante de git: `gh-credential` (el `gh` del PATH, que renueva el token al usarse) o `entorno` (lee $GH_TOKEN del entorno de quien lo lanza). */
export const AYUDANTES = ["gh-credential", "entorno"];
/** `normal` exige un token con forma `ghs_…`; `sin-canje` solo acepta el centinela (el arranque lo escribe ANTES de canjear). */
export const MODOS_ENTORNO = ["normal", "sin-canje"];
/** Lo que dice la CLI cuando se agota el límite de lecturas por hora de la cuenta (visto el 10 oct 2026). */
const LIMITE_OP = /too many requests|rate.?limit/i;

export class ErrorTokenSesion extends Error {
  constructor(motivo, detalle = "") {
    super(`${motivo}${detalle ? `: ${detalle}` : ""}`);
    this.name = "ErrorTokenSesion";
    this.motivo = motivo;
  }
}

/**
 * Dónde buscar la clave: la bóveda de sesiones y, TEMPORAL, la ficha de HoMenu (donde está
 * hoy). Se quita en cuanto Pablo mueva la clave: la cuenta de sesiones no lee HoMenu y la
 * del PC de Pablo sí, así que ese respaldo solo sirve con la cuenta vieja (#329).
 */
export const FICHAS_CLAVE = [
  { vault: BOVEDA_SESIONES, titulo: "GitHub App homenu-sesiones" },
  { vault: BOVEDA_PABLO, titulo: "GitHub App Sesiones", temporal: true },
];

/** Una lectura de la ficha con la service account de las sesiones (`entornoOp`: falla cerrado sin token). Devuelve el texto. */
function leerFicha(f) {
  return new Promise((ok, ko) => {
    let env;
    try {
      env = entornoOp();
    } catch (e) {
      return ko(e);
    }
    execFile("op", ["document", "get", f.titulo, "--vault", f.vault], { windowsHide: true, env, encoding: "utf8", timeout: 10_000, maxBuffer: 1 << 20 }, (error, salida, stderr) => {
      if (error) return ko(Object.assign(new Error(String(stderr || error.message).split("\n")[0].slice(0, 160)), { code: error.code }));
      ok(salida);
    });
  });
}

/** Lee la clave de la bóveda. `leer` se inyecta para probarlo. Devuelve { pem, temporal }. */
export function leerClaveDeBoveda({ fichas = FICHAS_CLAVE, leer = leerFicha } = {}) {
  return (async () => {
    const intentos = [];
    for (const f of fichas) {
      try {
        return { pem: await leer(f), temporal: Boolean(f.temporal) };
      } catch (e) {
        // Cada intento con su bóveda y su ficha: si solo quedara el último, un fallo del plan B tapa el de verdad
        intentos.push(`${f.vault}/${f.titulo}: ${e.message}`);
        // Probar en la otra bóveda gastaría otra lectura del límite que acaba de agotarse
        if (LIMITE_OP.test(e.message)) throw new ErrorTokenSesion("limite-de-1password", intentos.join(" | "));
        if (e.code === "SIN_TOKEN") break; // sin cuenta de servicio no hay a quién probar en otra bóveda
      }
    }
    throw new ErrorTokenSesion("sin-clave", intentos.join(" | "));
  })();
}

/** El motivo del vocabulario para un fallo del canje de E1 (sus mensajes no llevan secretos). */
export function motivoDeCanje(mensaje) {
  const m = String(mensaje);
  if (/PEM|no es RSA|SESIONES_APP_ID/.test(m)) return "clave-ilegible";
  if (/sin respuesta/.test(m)) return "red";
  if (/no lo imprimo|sin token/.test(m)) return "token-raro";
  if (/respondió 404|no existe esa instalación/.test(m)) return "sin-instalacion";
  return "github-rechaza";
}

const cabeceras = (jwt) => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "homenu-sesiones",
  ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
});

/** App ID e Installation ID (no son secretos): del entorno o `.env.local` si están, y si no el conocido y el que dice GitHub. */
function idsPorDefecto() {
  return { appId: leerEnv("SESIONES_APP_ID") || APP_ID, installationId: leerEnv("SESIONES_INSTALLATION_ID") || null };
}

const NIVEL = { read: 1, write: 2, admin: 3 };

/** Qué advertencias da la instalación: permisos de la App por encima de PERMISOS o acceso a todos los repos. */
export function advertenciasDeInstalacion(detalle) {
  const fuera = [];
  const extra = Object.entries(detalle?.permissions ?? {}).some(([p, n]) => !(p in PERMISOS) || (NIVEL[n] ?? 9) > NIVEL[PERMISOS[p]]);
  if (extra) fuera.push("permisos-de-mas");
  if (detalle?.repository_selection !== "selected") fuera.push("todos-los-repos");
  return fuera;
}

async function revisarInstalacion({ fetchFn, jwt, installationId }) {
  try {
    const r = await fetchFn(`${API}/app/installations/${installationId}`, { headers: cabeceras(jwt), signal: AbortSignal.timeout(TOPE_MS) });
    return r.ok ? advertenciasDeInstalacion(await r.json()) : ["app-sin-comprobar"];
  } catch {
    // a propósito: no se pudo mirar; el token ya sale con permisos explícitos, así que solo se dice
    return ["app-sin-comprobar"];
  }
}

/**
 * El token de instalación y el autor de los commits. Lanza ErrorTokenSesion.
 * Devuelve { token, expiraEn, autor: { nombre, correo }, advertencias }.
 */
export async function tokenDeSesion({ fetch: fetchFn = globalThis.fetch, leerClave = leerClaveDeBoveda, ahora = Date.now(), ids = idsPorDefecto } = {}) {
  const leida = await leerClave();
  const pem = String(leida && typeof leida === "object" ? leida.pem : leida ?? "");
  const advertencias = leida?.temporal ? ["clave-en-HoMenu"] : [];
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pem)) throw new ErrorTokenSesion("clave-ilegible", "la ficha no trae una clave privada");
  const { appId, installationId: idFijo } = ids();
  try {
    const jwt = firmarJwt({ appId, pem, ahora: Math.floor(ahora / 1000) });
    let installationId = idFijo;
    if (!installationId) {
      let r;
      try {
        r = await fetchFn(`${API}/repos/${REPO}/installation`, { headers: cabeceras(jwt), signal: AbortSignal.timeout(TOPE_MS) });
      } catch {
        // a propósito: el motivo es «red»; el error de fetch no aporta más que la URL
        throw new ErrorTokenSesion("red", "GitHub no contesta");
      }
      if (r.status === 404) throw new ErrorTokenSesion("sin-instalacion", "la App no está instalada en el repo");
      if (!r.ok) throw new ErrorTokenSesion("github-rechaza", `instalación: HTTP ${r.status}`);
      try {
        installationId = (await r.json())?.id;
      } catch {
        // a propósito: un cuerpo ilegible es lo mismo que no traer id; sale justo debajo como sin-instalacion
        installationId = null;
      }
      if (!Number.isInteger(installationId)) throw new ErrorTokenSesion("sin-instalacion", "respuesta sin id de instalación");
    }
    advertencias.push(...await revisarInstalacion({ fetchFn, jwt, installationId }));
    const { token, expira } = await pedirToken({ jwt, installationId, fetchFn });
    // Solo caracteres de un token de GitHub: va a un fichero que lee un shell
    if (!/^ghs_[A-Za-z0-9_.-]{20,}$/.test(token)) throw new ErrorTokenSesion("token-raro", "el token no tiene la forma esperada");
    return { token, expiraEn: expira || null, installationId, autor: await autorDeApp(fetchFn), advertencias };
  } catch (e) {
    if (e instanceof ErrorTokenSesion) throw e;
    if (e instanceof ErrorToken) throw new ErrorTokenSesion(motivoDeCanje(e.message), sinSecretos(e.message, [pem.trim()]).slice(0, 200));
    throw new ErrorTokenSesion("github-rechaza", "fallo inesperado");
  }
}

async function autorDeApp(fetchFn) {
  let botId = BOT_ID;
  try {
    const u = await fetchFn(`${API}/users/${encodeURIComponent(BOT_LOGIN)}`, { headers: cabeceras(), signal: AbortSignal.timeout(TOPE_MS) });
    const j = u.ok ? await u.json() : null;
    if (Number.isInteger(j?.id)) botId = j.id;
  } catch {
    // a propósito: el id público es un dato de respaldo; no vale la pena parar por él
  }
  return { nombre: BOT_LOGIN, correo: `${botId}+${BOT_LOGIN}@users.noreply.github.com` };
}

/**
 * `tokenDeSesion` con la caché de por medio (E3). Reutiliza el token guardado mientras falten más de
 * MARGEN_MS; si no, canjea (con un bloqueo, para que dos sesiones que arrancan a la vez no canjeen
 * dos veces) y lo guarda. Si 1Password dice que se agotó el límite de lecturas y hay un token aún
 * vivo (aunque le queden menos de MARGEN_MS), usa ese y lo advierte. `sinCache` fuerza el canje.
 * Devuelve lo mismo que `tokenDeSesion` más `cache: "si" | "no"`.
 */
export async function tokenConCache({ sinCache = false, cache = {}, generar = tokenDeSesion, ids = idsPorDefecto, reloj = Date.now, hasta = Infinity, ...resto } = {}) {
  const ruta = cache.ruta !== undefined ? cache.ruta : rutaDeCache();
  // Sin un sitio válido para la caché (fuera del perfil o en OneDrive) se canjea como antes
  if (!ruta) return { ...(await generar({ ...resto, ids, ahora: reloj() })), cache: "no" };
  const fs = cache.fs ?? fsReal;
  const proteger = cache.proteger ?? protegerFichero;
  const permisosBien = cache.permisosBien ?? permisosDelUsuario;
  const { appId, installationId } = ids();
  const leer = () => leerCache({ ruta, ids: { appId, installationId }, reloj, fs, permisosBien });
  const dePrevia = (l, advertencias = []) => ({
    token: l.entrada.token,
    expiraEn: l.entrada.expiraEn,
    installationId: l.entrada.installationId,
    autor: { nombre: BOT_LOGIN, correo: `${BOT_ID}+${BOT_LOGIN}@users.noreply.github.com` },
    advertencias,
    cache: "si",
  });
  if (!sinCache) {
    const l = leer();
    if (l.motivo === "ok" && l.restanteMs > MARGEN_MS) return dePrevia(l);
  }
  return conBloqueo({
    ruta, fs, reloj, esperaMs: cache.esperaBloqueoMs, sondeoMs: cache.sondeoMs, dormir: cache.dormir, hasta,
    fn: async ({ bloqueado, razon }) => {
      // Otra sesión pudo canjear mientras esta esperaba el bloqueo
      const previa = sinCache ? { motivo: "ausente" } : leer();
      if (previa.motivo === "ok" && previa.restanteMs > MARGEN_MS) return dePrevia(previa);
      // Otro canjea y no terminó a tiempo: canjear en paralelo gastaría otra lectura del .pem. Plan B con aviso
      if (!bloqueado && razon === "ocupado") throw new ErrorTokenSesion("bloqueo-ocupado", "otra sesión está sacando el token y no terminó a tiempo");
      try {
        const t = await generar({ ...resto, ids: () => ({ appId, installationId }), ahora: reloj() });
        if (FORMA_FECHA.test(String(t.expiraEn))) {
          escribirCache({ ruta, fs, proteger, datos: { token: t.token, expiraEn: t.expiraEn, appId, installationId: t.installationId ?? installationId } });
        }
        return { ...t, cache: "no" };
      } catch (e) {
        if (e instanceof ErrorTokenSesion && e.motivo === "limite-de-1password" && previa.motivo === "ok") return dePrevia(previa, ["cache-casi-caducada"]);
        throw e;
      }
    },
  });
}

/**
 * Líneas para el fichero de entorno de la sesión (CLAUDE_ENV_FILE, que lee el
 * shell Bash de cada comando): el token solo en el entorno, `git` con el token como
 * contraseña de github.com (el ayudante no lo lleva escrito) y el autor y committer de
 * la App. Rechaza un token o un autor con caracteres raros.
 * `configPrevia`: el GIT_CONFIG_COUNT que ya hubiera; las entradas nuevas van detrás.
 * `ayudante` (AYUDANTES): `gh-credential` (por defecto) delega en `gh auth git-credential`, que
 * con el `gh` de scripts/bin renueva el token al usarse; `entorno` lee $GH_TOKEN tal cual (lo usa
 * `entornoDeComando`, cuyo hijo lleva un token recién canjeado y no depende del PATH).
 * `modo` (MODOS_ENTORNO): `sin-canje` solo acepta TOKEN_CENTINELA; `normal`, solo un token con forma.
 * `conToken: false` no escribe la línea de GH_TOKEN (la sesión de la nube trae el suyo y el centinela lo taparía).
 */
export function lineasDeEntorno({ token, autor, configPrevia = 0, ayudante = "gh-credential", modo = "normal", conToken = true }) {
  if (!MODOS_ENTORNO.includes(modo)) throw new Error(`modo fuera del vocabulario: ${modo}`);
  if (!AYUDANTES.includes(ayudante)) throw new Error(`ayudante fuera del vocabulario: ${ayudante}`);
  if (modo === "sin-canje" ? token !== TOKEN_CENTINELA : !/^ghs_[A-Za-z0-9_.-]{20,}$/.test(token)) throw new ErrorTokenSesion("token-raro", "no escribo ese token");
  if (!/^[A-Za-z0-9._\[\]-]+$/.test(autor.nombre) || !/^[A-Za-z0-9._+\[\]-]+@users\.noreply\.github\.com$/.test(autor.correo)) {
    throw new ErrorTokenSesion("token-raro", "autor con caracteres raros");
  }
  const n = Number.isInteger(configPrevia) && configPrevia > 0 ? configPrevia : 0;
  const ayudanteGit =
    ayudante === "entorno"
      ? "!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f"
      : '!f() { GH_TOKEN="${GH_TOKEN:-' + TOKEN_CENTINELA + '}" gh auth git-credential "$@"; }; f';
  return [
    ...(conToken ? [`export GH_TOKEN='${token}'`] : []),
    `export GIT_CONFIG_COUNT=${n + 2}`,
    `export GIT_CONFIG_KEY_${n}='credential.https://github.com.helper'`,
    `export GIT_CONFIG_VALUE_${n}=''`,
    `export GIT_CONFIG_KEY_${n + 1}='credential.https://github.com.helper'`,
    `export GIT_CONFIG_VALUE_${n + 1}='${ayudanteGit}'`,
    `export GIT_AUTHOR_NAME='${autor.nombre}'`,
    `export GIT_AUTHOR_EMAIL='${autor.correo}'`,
    `export GIT_COMMITTER_NAME='${autor.nombre}'`,
    `export GIT_COMMITTER_EMAIL='${autor.correo}'`,
    "",
  ].join("\n");
}

/** El autor de la App antes de canjear: el id público del bot (BOT_ID), el mismo que usa la caché. */
export const AUTOR_POR_DEFECTO = { nombre: BOT_LOGIN, correo: `${BOT_ID}+${BOT_LOGIN}@users.noreply.github.com` };

/** La línea que cambia solo el token (la que el arranque añade DESPUÉS del canje; un `export` posterior gana al anterior). */
export function lineaDeToken(token) {
  if (!/^ghs_[A-Za-z0-9_.-]{20,}$/.test(token)) throw new ErrorTokenSesion("token-raro", "no escribo ese token");
  return `export GH_TOKEN='${token}'\n`;
}

/**
 * La carpeta del shim (`scripts/bin`) a partir de la URL de un fichero de la casa (`import.meta.url`
 * de arranque.mjs): sale de donde vive ese fichero, NUNCA del cwd. OJO: el hook corre desde
 * `${CLAUDE_PROJECT_DIR}`, que es la carpeta de la tarea, así que una rama ajena traída ahí SÍ podría
 * sustituir el shim; sacarlo a una copia fuera de la carpeta es del fondo #715 (#719). `subida`: de `.claude/hooks/` al raíz.
 */
export function rutaDeShimDesde(url, subida = ["..", ".."]) {
  return resolve(dirname(fileURLToPath(url)), ...subida, "scripts", "bin");
}

/** `C:\dev\X\scripts\bin` a `/c/dev/X/scripts/bin` (Git Bash); una ruta que ya es de POSIX queda igual. */
export function rutaParaGitBash(ruta) {
  const r = String(ruta).replace(/\\/g, "/");
  const m = /^([A-Za-z]):\/(.*)$/.exec(r);
  return m ? `/${m[1].toLowerCase()}/${m[2]}` : r;
}

// Absoluta, tramos de [A-Za-z0-9._-] y acabada en scripts/bin. Vale la unidad de Git Bash (`/c/dev/…`) y la de Linux o la
// nube (`/home/…`): el primer tramo no se limita a una letra (con `^/[a-z]/` el CI de Linux no escribía la línea).
const FORMA_RUTA_SHIM = /^(?:\/[A-Za-z0-9._-]+)+\/scripts\/bin$/;

/**
 * La línea de PATH que pone el shim delante, o { motivo: "ruta-de-shim-rara" } si la ruta no pasa la
 * regex anclada (ni `..` ni `.` en ningún tramo, ni espacios ni comillas: va entre comillas simples a un
 * fichero que lee un shell). Sin `:` final, que añadiría el directorio actual al PATH. No lanza.
 */
export function lineaDePath(rutaShim) {
  const ruta = rutaParaGitBash(rutaShim ?? "");
  if (!FORMA_RUTA_SHIM.test(ruta) || ruta.split("/").some((t) => t === ".." || t === ".")) return { motivo: "ruta-de-shim-rara" };
  return { linea: `export PATH='${ruta}'\${PATH:+:$PATH}\n` };
}

/**
 * El entorno con el que `token-sesion.mjs -- <comando>` lanza su comando: el token,
 * el ayudante de git que lo lee y el autor de la App, igual que `lineasDeEntorno` pero
 * en el entorno del hijo y sin depender de que el arranque dejara su fichero puesto.
 * Sin esto, `git push` caía al ayudante interactivo de la máquina y se colgaba sin error.
 * `base`: el entorno del que se parte; sus GIT_CONFIG_* se respetan y las nuevas van detrás.
 */
export function entornoDeComando({ token, autor, base = {} }) {
  const pares = {};
  for (const linea of lineasDeEntorno({ token, autor, configPrevia: Number.parseInt(base.GIT_CONFIG_COUNT, 10) || 0, ayudante: "entorno" }).split(String.fromCharCode(10))) {
    const m = /^export ([A-Z_0-9]+)=(.*)$/.exec(linea);
    if (m) pares[m[1]] = m[2].replace(/^'(.*)'$/, "$1");
  }
  return { ...base, ...pares };
}

/** Con qué identidad respondió `gh api user`: uno de IDENTIDADES. */
export function identidadDe({ status, stdout = "", stderr = "" }) {
  if (status === 0) {
    const login = String(stdout).trim();
    if (login === LOGIN_PABLO) return "pablo";
    if (login.endsWith("[bot]")) return "app";
    return login ? "otra" : "desconocida";
  }
  // Un token de instalación no puede pedir /user: GitHub contesta 403 «by integration»
  if (/integration/i.test(`${stderr}\n${stdout}`)) return "app";
  return "desconocida";
}

/** La línea contable (`campo: valor`, sin datos de nadie); sale igual por stdout y por stderr. */
export function lineaIdentidad({ identidad, token, motivo = "-", cache = "no" }) {
  if (!IDENTIDADES.includes(identidad)) throw new Error(`identidad fuera del vocabulario: ${identidad}`);
  if (!CACHES.includes(cache)) throw new Error(`cache fuera del vocabulario: ${cache}`);
  return `identidad-sesion identidad: ${identidad} token: ${token} motivo: ${motivo} cache: ${cache}`;
}

/**
 * El aviso del arranque. Dice solo lo que sabe: el token se probó en el entorno de node y se
 * dejó para el shell Bash de las sesiones; PowerShell no lo carga. `token`: "app" si se
 * generó uno, "no" si no; `motivo`: de MOTIVOS o "-".
 */
export function avisoDeIdentidad({ identidad, token, motivo = "-", advertencias = [], cache = "no" }) {
  const cuenta = lineaIdentidad({ identidad, token, motivo, cache });
  for (const a of advertencias) if (!ADVERTENCIAS.includes(a)) throw new Error(`advertencia fuera del vocabulario: ${a}`);
  const extra = advertencias.length ? ` ADVERTENCIA: ${advertencias.join(", ")}.` : "";
  const resto = "Pablo cerró su sesión de `gh` y quitó github.com del llavero el 13 oct 2026: sin el token de la App, `gh` y `git push` no entran.";
  if (identidad === "pablo") {
    const porque = token === "app" ? "el token de la App no se ha aplicado a esta sesión" : `no hay token de la App (${motivo})`;
    return `AVISO: esta sesión trabaja con la identidad de Pablo (${LOGIN_PABLO}, administrador): ${porque}. Sigue con ella (plan B): commits y PR saldrán a su nombre y nada impide cambiar reglas del repo (#326, skill github).${extra} ${cuenta}`;
  }
  if (identidad === "app") {
    return `Identidad: App ${BOT_LOGIN} por defecto en Bash (token de 1 hora para \`gh\` y \`git push\`); en PowerShell no se carga: usa \`node scripts/token-sesion.mjs -- <comando>\` o pasa por Bash. ${resto} Caducado: \`node scripts/token-sesion.mjs -- gh …\` o \`-- git push\`.${extra} ${cuenta}`;
  }
  return `AVISO: no he podido comprobar con qué identidad de GitHub trabaja esta sesión (${identidad}, motivo: ${motivo}); puede estar yendo como Pablo (${LOGIN_PABLO}, administrador). Mírala con \`gh api user\`. ${resto}${extra} ${cuenta}`;
}

/** `gh api user` con el entorno dado; devuelve { status, stdout, stderr }. */
export function ghApiUser(env) {
  return new Promise((ok) => {
    execFile("gh", ["api", "user", "--jq", ".login"], { windowsHide: true, env, encoding: "utf8", timeout: 8000 }, (error, stdout, stderr) => ok({ status: error ? (error.code ?? 1) : 0, stdout, stderr }));
  });
}

/**
 * Todo lo del arranque sobre la identidad, con sus dependencias inyectadas: genera el token, lo
 * escribe en CLAUDE_ENV_FILE (con un salto de línea delante, por si el fichero no acababa en
 * uno), mira con qué identidad responde `gh` y devuelve el aviso. No lanza, y no pasa de `tope`
 * milisegundos (si vence: identidad desconocida, motivo red): el hook muere a los 30 s sin avisar.
 */
export async function aplicarIdentidad({ env = process.env, escribir = appendFileSync, generar = tokenConCache, identificar = ghApiUser, registrar = (l) => console.error(l), tope = TOPE_IDENTIDAD_MS, rutaShim, nube = false } = {}) {
  const inicio = Date.now();
  let reloj;
  let vencido = false; // pasado el tope, el trabajo que siga vivo no escribe ni registra nada
  const final = (datos) => {
    registrar(lineaIdentidad(datos));
    return avisoDeIdentidad(datos);
  };
  const limite = new Promise((ok) => {
    reloj = setTimeout(() => {
      vencido = true;
      ok(final({ identidad: "desconocida", token: "no", motivo: "red" }));
    }, tope);
  });
  const trabajo = (async () => {
    let token = "no";
    let motivo = "-";
    let advertencias = [];
    let cache = "no";
    const entorno = { ...env };
    try {
      // Primero lo que no depende del canje (#719): el PATH con el shim, el ayudante de git, el autor y
      // el centinela. Si el canje es lento o falla, la sesión ya tiene `gh` y `git push` que piden el
      // token al usarse y dan un 401 claro, no el llavero de Pablo (#673).
      if (env.CLAUDE_ENV_FILE) {
        const previa = Number.parseInt(env.GIT_CONFIG_COUNT, 10) || 0;
        let delPath = "";
        if (rutaShim !== undefined) {
          const p = lineaDePath(rutaShim);
          if (p.linea) delPath = p.linea;
          else registrar(`entorno-sesion path: omitido motivo: ${p.motivo}`);
        }
        escribir(env.CLAUDE_ENV_FILE, `\n${delPath}${lineasDeEntorno({ token: TOKEN_CENTINELA, autor: AUTOR_POR_DEFECTO, configPrevia: previa, modo: "sin-canje" })}`);
        entorno.GH_TOKEN = TOKEN_CENTINELA; // la comprobación de identidad no cae al llavero de Pablo
      }
      // La espera del bloqueo de la caché sale de lo que queda del presupuesto, y deja 3 s para `gh api user`
      const t = await generar({ hasta: inicio + tope - MARGEN_IDENTIDAD_MS });
      advertencias = t.advertencias ?? [];
      if (!env.CLAUDE_ENV_FILE) throw new ErrorTokenSesion("sin-fichero-de-entorno", "este arranque no recibió CLAUDE_ENV_FILE");
      if (vencido) return null;
      // Un `export` posterior gana al centinela
      escribir(env.CLAUDE_ENV_FILE, lineaDeToken(t.token));
      entorno.GH_TOKEN = t.token;
      token = "app";
      cache = t.cache === "si" ? "si" : "no";
    } catch (e) {
      motivo = e instanceof ErrorTokenSesion ? e.motivo : "error-interno";
    }
    if (vencido) return null;
    let identidad;
    try {
      identidad = identidadDe(await identificar(entorno));
    } catch {
      // a propósito: sin saber con qué identidad responde gh, se dice «desconocida» y no se rompe el arranque
      identidad = "desconocida";
    }
    if (vencido) return null;
    return final({ identidad, token, motivo, advertencias, cache });
  })();
  try {
    return await Promise.race([trabajo, limite]);
  } catch {
    // a propósito: ni un fallo inesperado debe dejar al arranque sin avisos; queda la línea con el motivo
    return final({ identidad: "desconocida", token: "no", motivo: "error-interno" });
  } finally {
    clearTimeout(reloj);
  }
}
