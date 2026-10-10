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
 * el mensaje. Quien lo llama (arranque.mjs) sigue con la identidad actual.
 *
 * `fetch` y el lector de clave se inyectan para probarlo sin red. Cómo se usa
 * y qué pasa a ser de Pablo: skills `github` y `1password`.
 */
import { createSign } from "node:crypto";
import { execFile } from "node:child_process";
import { BOVEDA_PABLO, BOVEDA_SESIONES, entornoOp } from "./env.mjs";

export const APP_ID = 5260552;
export const REPO = "pabloam89/MenuPlan";
export const BOT_LOGIN = "homenu-sesiones[bot]";
/** Id del usuario bot (público, `GET /users/homenu-sesiones[bot]`): respaldo si la API no contesta. */
export const BOT_ID = 340485937;
export const LOGIN_PABLO = "pabloam89";
const API = "https://api.github.com";
const TOPE_MS = 6000;

/** Vocabulario cerrado de por qué no hay token (se cuenta en la línea `identidad-sesion`). */
export const MOTIVOS = ["sin-clave", "clave-ilegible", "sin-instalacion", "github-rechaza", "red", "token-raro", "sin-fichero-de-entorno", "error-interno"];

export class ErrorTokenSesion extends Error {
  constructor(motivo, detalle = "") {
    super(`${motivo}${detalle ? `: ${detalle}` : ""}`);
    this.name = "ErrorTokenSesion";
    this.motivo = motivo;
  }
}

/** Dónde buscar la clave: la bóveda de sesiones y, mientras Pablo no la mueve (#329), la ficha de HoMenu. */
export const FICHAS_CLAVE = [
  { vault: BOVEDA_SESIONES, titulo: "GitHub App homenu-sesiones" },
  { vault: BOVEDA_PABLO, titulo: "GitHub App Sesiones" },
];

const b64url = (x) => Buffer.from(x).toString("base64url");

/** El JWT de la App (10 minutos como mucho, que es lo que admite GitHub). */
export function jwtDeApp(pem, { ahora = Date.now(), appId = APP_ID } = {}) {
  const iat = Math.floor(ahora / 1000) - 60; // 60 s de margen por relojes torcidos
  const cuerpo = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iat, exp: iat + 600, iss: appId }))}`;
  try {
    return `${cuerpo}.${createSign("RSA-SHA256").update(cuerpo).sign(pem).toString("base64url")}`;
  } catch {
    // a propósito: el error de node:crypto puede citar el formato de la clave; no se propaga
    throw new ErrorTokenSesion("clave-ilegible", "no es una clave RSA privada válida");
  }
}

/** Lee la clave con la service account de las sesiones (`entornoOp`: falla cerrado sin token). */
export function leerClaveDeBoveda({ fichas = FICHAS_CLAVE } = {}) {
  const intento = (f) => new Promise((ok, ko) => {
    let env;
    try {
      env = entornoOp();
    } catch (e) {
      return ko(e);
    }
    execFile("op", ["document", "get", f.titulo, "--vault", f.vault], { env, encoding: "utf8", timeout: 10_000, maxBuffer: 1 << 20 }, (error, salida, stderr) => {
      if (error) return ko(Object.assign(new Error(String(stderr || error.message).split("\n")[0].slice(0, 160)), { code: error.code }));
      ok(salida);
    });
  });
  return (async () => {
    let ultimo = "";
    for (const f of fichas) {
      try {
        return await intento(f);
      } catch (e) {
        ultimo = e.message;
        if (e.code === "SIN_TOKEN") break; // sin cuenta de servicio no hay a quién probar en otra bóveda
      }
    }
    throw new ErrorTokenSesion("sin-clave", ultimo);
  })();
}

async function pedir(fetchFn, url, init) {
  try {
    return await fetchFn(url, { ...init, signal: AbortSignal.timeout(TOPE_MS) });
  } catch {
    // a propósito: el motivo es «red»; el error de fetch no aporta nada que no sea la URL
    throw new ErrorTokenSesion("red", "GitHub no contesta");
  }
}

const cabeceras = (auth) => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "homenu-sesiones",
  ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
});

/**
 * El token de instalación y el autor de los commits. Lanza ErrorTokenSesion.
 * Devuelve { token, expiraEn, autor: { nombre, correo } }.
 */
export async function tokenDeSesion({ fetch: fetchFn = globalThis.fetch, leerClave = leerClaveDeBoveda, ahora = Date.now() } = {}) {
  const pem = String(await leerClave() ?? "");
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pem)) throw new ErrorTokenSesion("clave-ilegible", "la ficha no trae una clave privada");
  const jwt = jwtDeApp(pem, { ahora });

  const inst = await pedir(fetchFn, `${API}/repos/${REPO}/installation`, { headers: cabeceras(jwt) });
  if (inst.status === 404) throw new ErrorTokenSesion("sin-instalacion", "la App no está instalada en el repo");
  if (!inst.ok) throw new ErrorTokenSesion("github-rechaza", `instalación: HTTP ${inst.status}`);
  const id = (await inst.json().catch(() => null))?.id;
  if (!Number.isInteger(id)) throw new ErrorTokenSesion("sin-instalacion", "respuesta sin id de instalación");

  const resp = await pedir(fetchFn, `${API}/app/installations/${id}/access_tokens`, {
    method: "POST",
    headers: { ...cabeceras(jwt), "Content-Type": "application/json" },
    body: JSON.stringify({ repositories: [REPO.split("/")[1]] }),
  });
  if (!resp.ok) throw new ErrorTokenSesion("github-rechaza", `token: HTTP ${resp.status}`);
  const datos = await resp.json().catch(() => null);
  const token = datos?.token;
  // Solo caracteres de un token de GitHub: va a un fichero que lee un shell
  if (typeof token !== "string" || !/^ghs_[A-Za-z0-9_.-]{20,}$/.test(token)) throw new ErrorTokenSesion("token-raro", "el token no tiene la forma esperada");

  let botId = BOT_ID;
  try {
    const u = await pedir(fetchFn, `${API}/users/${encodeURIComponent(BOT_LOGIN)}`, { headers: cabeceras() });
    const j = u.ok ? await u.json() : null;
    if (Number.isInteger(j?.id)) botId = j.id;
  } catch {
    // a propósito: el id público es un dato de respaldo; no vale la pena parar por él
  }
  return { token, expiraEn: datos.expires_at ?? null, autor: { nombre: BOT_LOGIN, correo: `${botId}+${BOT_LOGIN}@users.noreply.github.com` } };
}

/**
 * Líneas para el fichero de entorno de la sesión (CLAUDE_ENV_FILE, que lee el
 * shell de cada comando): el token solo en el entorno, `git` con el token como
 * contraseña de github.com (el ayudante lee $GH_TOKEN, no lo lleva escrito) y
 * el autor y committer de la App. Rechaza un token o un autor con caracteres raros.
 */
export function lineasDeEntorno({ token, autor }) {
  if (!/^ghs_[A-Za-z0-9_.-]{20,}$/.test(token)) throw new ErrorTokenSesion("token-raro", "no escribo ese token");
  if (!/^[A-Za-z0-9._\[\]-]+$/.test(autor.nombre) || !/^[A-Za-z0-9._+\[\]-]+@users\.noreply\.github\.com$/.test(autor.correo)) {
    throw new ErrorTokenSesion("token-raro", "autor con caracteres raros");
  }
  const ayudante = '!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f';
  return [
    `export GH_TOKEN='${token}'`,
    "export GIT_CONFIG_COUNT=2",
    "export GIT_CONFIG_KEY_0='credential.https://github.com.helper'",
    "export GIT_CONFIG_VALUE_0=''",
    "export GIT_CONFIG_KEY_1='credential.https://github.com.helper'",
    `export GIT_CONFIG_VALUE_1='${ayudante}'`,
    `export GIT_AUTHOR_NAME='${autor.nombre}'`,
    `export GIT_AUTHOR_EMAIL='${autor.correo}'`,
    `export GIT_COMMITTER_NAME='${autor.nombre}'`,
    `export GIT_COMMITTER_EMAIL='${autor.correo}'`,
    "",
  ].join("\n");
}

/** Con qué identidad respondió `gh api user`: "pablo", "app", "otra" o "desconocida". */
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

/**
 * La línea para el arranque y su línea contable (`campo: valor`, sin datos de
 * nadie). `token`: "app" si se generó uno, "no" si no; `motivo`: de MOTIVOS o "-".
 */
export function avisoDeIdentidad({ identidad, token, motivo = "-" }) {
  const cuenta = `identidad-sesion identidad: ${identidad} token: ${token} motivo: ${motivo}`;
  if (identidad === "pablo") {
    const porque = token === "app"
      ? "el token de la App no se ha aplicado a esta sesión"
      : `no hay token de la App (${motivo})`;
    return `AVISO: esta sesión trabaja con la identidad de Pablo (${LOGIN_PABLO}, administrador): ${porque}. Sigue con ella (plan B), pero commits y PR saldrán a su nombre y nada impide cambiar reglas del repo (#326, skill github). ${cuenta}`;
  }
  if (identidad === "app") return `Identidad: ${BOT_LOGIN} (App de las sesiones, sin administración, token de 1 hora; si caduca: \`node scripts/token-sesion.mjs -- gh …\`). ${cuenta}`;
  return `Identidad de GitHub: no he podido comprobarla (${identidad}); mírala con \`gh api user\`. ${cuenta}`;
}
