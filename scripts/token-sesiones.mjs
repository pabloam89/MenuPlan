#!/usr/bin/env node
/**
 * token-sesiones.mjs — pide un token de instalación de la GitHub App
 * «homenu-sesiones» (E1, #327; fondo #326) y lo imprime por la salida estándar,
 * para `GH_TOKEN`. Caduca a la hora y las acciones salen como
 * `homenu-sesiones[bot]`, no como Pablo.
 *
 *   node scripts/op.mjs document get "GitHub App homenu-sesiones" --vault HoMenu-sesiones \
 *     | node scripts/token-sesiones.mjs
 *   GH_TOKEN="$(… | node scripts/token-sesiones.mjs)" gh api repos/pabloam89/MenuPlan -q .full_name
 *
 * - La clave privada (.pem) llega SOLO por stdin: nunca por argumento, nunca de
 *   un fichero (así no queda en el disco ni en la lista de procesos).
 * - El App ID y el Installation ID no son secretos: `SESIONES_APP_ID` y
 *   `SESIONES_INSTALLATION_ID`, del entorno o de `.env.local` (`leerEnv`).
 * - El token se pide con permisos explícitos (sin workflows) y se descarta, sin imprimirlo, si lo concedido no es un subconjunto exacto de lo pedido (permiso no pedido, nivel superior, o `permissions` ausente) o si no está limitado exactamente a MenuPlan. Timeout de 15 s al pedirlo y 30 s a la clave.
 * - Capturarlo SIEMPRE con $(…): imprimido en una sesión queda en su transcripción en disco.
 * - Firma un JWT RS256 de 10 minutos con `node:crypto` (sin dependencias) y
 *   pide `POST /app/installations/{id}/access_tokens`, limitado al repo MenuPlan.
 * - Por stdout, solo el token. Por stderr, errores con la causa y la fecha de
 *   caducidad; ni el token, ni el JWT, ni la clave salen en ningún mensaje.
 *
 * Pasos para crear la App y guardar la clave: skill `github`, referencias/app-sesiones.md.
 */
import { createPrivateKey, sign } from "node:crypto";
import { pathToFileURL } from "node:url";

export const API = "https://api.github.com";
export const REPO = "MenuPlan";
/** GitHub rechaza un JWT que caduque a más de 10 minutos del momento de la petición. */
export const VIDA_JWT_S = 540;
/** iat en el pasado: el reloj de este PC puede ir por delante del de GitHub. */
export const MARGEN_IAT_S = 60;
const TOPE_CLAVE = 16_384;

/** Lo que se pide, explícito: el token nace con esto y no con todo lo que la App tenga. Sin workflows. */
export const PERMISOS = {
  contents: "write", pull_requests: "write", issues: "write",
  actions: "read", checks: "read", metadata: "read",
};
/** Orden de los niveles: lo concedido no puede pasar de lo pedido. Un nivel desconocido se descarta. */
const NIVEL = { read: 1, write: 2, admin: 3 };
export const ESPERA_FETCH_MS = 15_000;
export const ESPERA_STDIN_MS = 30_000;

const b64url = (b) => Buffer.from(b).toString("base64url");

/** Error con mensaje seguro para enseñar: nunca lleva secretos. */
export class ErrorToken extends Error {}

/** Quita de un texto cualquier cosa con forma de JWT, token de GitHub o PEM. */
export function sinSecretos(texto, secretos = []) {
  let t = String(texto ?? "");
  for (const s of secretos) if (s && t.includes(s)) t = t.split(s).join("[oculto]");
  return t
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[oculto]")
    // Sin \b a propósito: una letra, un número o «_» pegados delante no deben esconder el secreto.
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[oculto]")
    .replace(/(?:ghs|ghp|gho|ghu|ghr|github_pat)_\w+/g, "[oculto]");
}

/** JWT RS256 de la App. `ahora` en segundos. Lanza ErrorToken si la clave no vale. */
export function firmarJwt({ appId, pem, ahora = Math.floor(Date.now() / 1000) }) {
  if (!/^\d{1,12}$/.test(String(appId ?? ""))) throw new ErrorToken("SESIONES_APP_ID falta o no es un número");
  let clave;
  try {
    clave = createPrivateKey(pem);
  } catch {
    throw new ErrorToken("la clave privada de stdin no es un PEM válido (se espera el .pem de la App, RSA)");
  }
  if (clave.asymmetricKeyType !== "rsa") throw new ErrorToken("la clave privada no es RSA: no es la de una GitHub App");
  const cabecera = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = b64url(JSON.stringify({ iat: ahora - MARGEN_IAT_S, exp: ahora + VIDA_JWT_S, iss: String(appId) }));
  const firma = sign("RSA-SHA256", Buffer.from(`${cabecera}.${cuerpo}`), clave);
  return `${cabecera}.${cuerpo}.${b64url(firma)}`;
}

const PISTAS = {
  401: "GitHub no acepta la firma: ¿es la clave de esta App y el App ID correcto? ¿está borrada la clave, o el reloj del PC va desajustado?",
  403: "GitHub lo niega: ¿la instalación está suspendida o la App sin permisos?",
  404: "no existe esa instalación: ¿el Installation ID es el de esta App en pabloam89/MenuPlan?",
  422: "GitHub rechaza la petición: ¿la App está instalada en el repo MenuPlan?",
};

/** Pide el token de instalación. Devuelve { token, expira }. */
export async function pedirToken({ jwt, installationId, fetchFn = fetch }) {
  if (!/^\d{1,12}$/.test(String(installationId ?? ""))) throw new ErrorToken("SESIONES_INSTALLATION_ID falta o no es un número");
  let r;
  try {
    r = await fetchFn(`${API}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "menuplan-token-sesiones",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ repositories: [REPO], permissions: PERMISOS }),
      signal: AbortSignal.timeout(ESPERA_FETCH_MS),
    });
  } catch (e) {
    throw new ErrorToken(`sin respuesta de GitHub: ${sinSecretos(e?.cause?.code || e?.name || "error de red", [jwt])}`);
  }
  let datos = null;
  try {
    datos = await r.json();
  } catch {
    datos = null;
  }
  if (!r.ok) {
    const api = sinSecretos(datos?.message, [jwt]).slice(0, 160);
    throw new ErrorToken(`GitHub respondió ${r.status}${api ? ` («${api}»)` : ""}${PISTAS[r.status] ? `: ${PISTAS[r.status]}` : ""}`);
  }
  if (typeof datos?.token !== "string" || !datos.token) throw new ErrorToken("GitHub respondió 2xx sin token");
  // Se comprueba lo que GitHub concedió, no lo que se pidió: si no cuadra, el token no sale.
  // Lista blanca: lo concedido es un subconjunto de lo pedido, sin ningún nivel superior.
  const concedido = datos.permissions;
  if (!concedido || typeof concedido !== "object" || Array.isArray(concedido)) throw new ErrorToken("la respuesta no dice qué permisos trae el token: no lo imprimo");
  const mal = Object.entries(concedido).filter(([p, nivel]) => !(p in PERMISOS) || !(nivel in NIVEL) || NIVEL[nivel] > NIVEL[PERMISOS[p]]).map(([p]) => p);
  if (mal.length) throw new ErrorToken(`el token trae permisos que no pedí o de más nivel (${mal.join(", ")}): no lo imprimo; corrige los permisos de la App y relanza`);
  const repos = Array.isArray(datos.repositories) ? datos.repositories.map((x) => x?.name) : null;
  if (!repos || repos.length !== 1 || repos[0] !== REPO) throw new ErrorToken(`el token no está limitado exactamente a ${REPO} (repositorios: ${repos ? repos.length : "ninguno indicado"}): no lo imprimo`);
  return { token: datos.token, expira: datos.expires_at ?? "" };
}

async function leerStdin(entrada = process.stdin, esperaMs = ESPERA_STDIN_MS) {
  if (entrada.isTTY) throw new ErrorToken("la clave va por tubería: `… document get … | node scripts/token-sesiones.mjs` (skill github, referencias/app-sesiones.md)");
  let reloj;
  const tope = new Promise((_, no) => { reloj = setTimeout(() => no(new ErrorToken(`stdin no ha terminado en ${esperaMs / 1000} s: ¿la orden que da el .pem se ha quedado esperando?`)), esperaMs); });
  const leer = (async () => {
    let s = "";
    for await (const trozo of entrada) {
      s += trozo;
      if (s.length > TOPE_CLAVE) throw new ErrorToken("lo que llega por stdin es demasiado grande para ser un .pem");
    }
    return s;
  })();
  leer.catch(() => {});
  try {
    return await Promise.race([leer, tope]);
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Todo el flujo, con sus dependencias inyectadas para probarlo sin red.
 * Devuelve el código de salida; escribe con `salida` (stdout) y `errores` (stderr).
 */
export async function ejecutar({ entrada, ids, fetchFn = fetch, ahora, salidaTTY = false, esperaStdinMs = ESPERA_STDIN_MS, salida = (t) => process.stdout.write(t), errores = (t) => process.stderr.write(t) } = {}) {
  let pem = "";
  try {
    pem = await leerStdin(entrada, esperaStdinMs);
    const { appId, installationId } = ids();
    const jwt = firmarJwt({ appId, pem, ahora });
    const { token, expira } = await pedirToken({ jwt, installationId, fetchFn });
    if (salidaTTY) errores("token-sesiones aviso: stdout es una terminal; el token quedará en pantalla y en la transcripción. Captúralo con $(…), nunca lo imprimas\n");
    salida(`${token}\n`);
    errores(`token-sesiones resultado: ok expira: ${expira}\n`);
    return 0;
  } catch (e) {
    const msg = e instanceof ErrorToken ? e.message : "fallo inesperado";
    errores(`token-sesiones resultado: fallo motivo: ${sinSecretos(msg, [pem.trim()])}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { leerEnv } = await import("./lib/env.mjs");
  process.exitCode = await ejecutar({
    entrada: process.stdin,
    salidaTTY: Boolean(process.stdout.isTTY),
    ids: () => ({ appId: leerEnv("SESIONES_APP_ID"), installationId: leerEnv("SESIONES_INSTALLATION_ID") }),
  });
}
