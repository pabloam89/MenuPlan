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
 * - El token se pide con permisos explícitos (con `workflows: write` desde #422) y se descarta, sin imprimirlo, si lo concedido no es un subconjunto exacto de lo pedido (permiso no pedido, nivel superior, o `permissions` ausente), si trae alguno de NEGADOS o si no está limitado exactamente a MenuPlan. Timeout de 15 s al pedirlo y 30 s a la clave.
 * - Si GitHub contesta 422 al pedir con `workflows` (la App o su instalación aún no lo tienen), se pide otra vez
 *   sin él y la línea de stderr lo dice: `workflows: sin-conceder` (#422). Así el canje no se rompe mientras
 *   Pablo no active el permiso.
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

/**
 * Lo que se pide, explícito: el token nace con esto y no con todo lo que la App tenga. `workflows: write` vuelve por
 * decisión de Pablo (#422, 15 oct 2026), que acepta el riesgo escrito por `seguridad`: una PR fusionada por la App
 * sin persona (#608) puede meter en `staging` un workflow que lea los secretos de environment.
 */
export const PERMISOS = {
  contents: "write", pull_requests: "write", issues: "write", workflows: "write",
  actions: "read", checks: "read", metadata: "read",
};
/** Lo que se pide mientras la App no tenga «Workflows» (GitHub contesta 422 si se pide un permiso que la instalación no tiene). */
export const PERMISOS_SIN_WORKFLOWS = Object.fromEntries(Object.entries(PERMISOS).filter(([p]) => p !== "workflows"));
/** Nunca se piden y, si GitHub los concede a cualquier nivel, el token no sale (además de la lista blanca). */
export const NEGADOS = ["administration", "secrets", "environments", "deployments"];
/** Vocabulario cerrado de la pieza `workflows:`: si el token lo trae, si se pidió sin él, o si salió de la caché y no se sabe. */
export const WORKFLOWS = ["concedido", "sin-conceder", "sin-saber"];
/** Orden de los niveles: lo concedido no puede pasar de lo pedido. Un nivel desconocido se descarta. */
const NIVEL = { read: 1, write: 2, admin: 3 };
export const ESPERA_FETCH_MS = 15_000;
export const ESPERA_STDIN_MS = 30_000;

const b64url = (b) => Buffer.from(b).toString("base64url");

/** Error con mensaje seguro para enseñar: nunca lleva secretos. `status`: el código HTTP de GitHub, si lo hubo. */
export class ErrorToken extends Error {
  constructor(mensaje, status = null) {
    super(mensaje);
    this.status = status;
  }
}

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

/** Pide el token de instalación con `permisos` (PERMISOS por defecto). Devuelve { token, expira, concedido }. */
export async function pedirToken({ jwt, installationId, fetchFn = fetch, permisos = PERMISOS }) {
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
      body: JSON.stringify({ repositories: [REPO], permissions: permisos }),
      signal: AbortSignal.timeout(ESPERA_FETCH_MS),
    });
  } catch (e) {
    throw new ErrorToken(`sin respuesta de GitHub: ${sinSecretos(e?.cause?.code || e?.name || "error de red", [jwt])}`);
  }
  let datos = null;
  try {
    datos = await r.json();
  } catch {
    // a propósito: un cuerpo que no es JSON no se enseña (podría llevar secretos); sigue como datos = null y el error sale justo debajo con el código HTTP (o «2xx sin token»)
    datos = null;
  }
  if (!r.ok) {
    const api = sinSecretos(datos?.message, [jwt]).slice(0, 160);
    throw new ErrorToken(`GitHub respondió ${r.status}${api ? ` («${api}»)` : ""}${PISTAS[r.status] ? `: ${PISTAS[r.status]}` : ""}`, r.status);
  }
  if (typeof datos?.token !== "string" || !datos.token) throw new ErrorToken("GitHub respondió 2xx sin token");
  // Se comprueba lo que GitHub concedió, no lo que se pidió: si no cuadra, el token no sale.
  // Lista blanca: lo concedido es un subconjunto de lo pedido, sin ningún nivel superior.
  const concedido = datos.permissions;
  if (!concedido || typeof concedido !== "object" || Array.isArray(concedido)) throw new ErrorToken("la respuesta no dice qué permisos trae el token: no lo imprimo");
  // NEGADOS primero y aparte: aunque alguien los añadiera por error a lo pedido, el token no sale
  const negados = Object.keys(concedido).filter((p) => NEGADOS.includes(p));
  if (negados.length) throw new ErrorToken(`el token trae permisos negados (${negados.join(", ")}): no lo imprimo; quítaselos a la App y relanza`);
  const mal = Object.entries(concedido).filter(([p, nivel]) => !(p in permisos) || !(nivel in NIVEL) || NIVEL[nivel] > NIVEL[permisos[p]]).map(([p]) => p);
  if (mal.length) throw new ErrorToken(`el token trae permisos que no pedí o de más nivel (${mal.join(", ")}): no lo imprimo; corrige los permisos de la App y relanza`);
  const repos = Array.isArray(datos.repositories) ? datos.repositories.map((x) => x?.name) : null;
  if (!repos || repos.length !== 1 || repos[0] !== REPO) throw new ErrorToken(`el token no está limitado exactamente a ${REPO} (repositorios: ${repos ? repos.length : "ninguno indicado"}): no lo imprimo`);
  return { token: datos.token, expira: datos.expires_at ?? "", concedido };
}

/**
 * El canje con su plan B (#422): pide con `workflows: write` y, si GitHub contesta 422 (la App o su instalación aún
 * no tienen el permiso), otra vez sin él. `conWorkflows: false` se lo salta cuando ya se sabe que la App no lo tiene
 * (ahorra una llamada). Devuelve { token, expira, workflows } con `workflows` de WORKFLOWS, según lo CONCEDIDO.
 */
export async function canjearToken({ jwt, installationId, fetchFn = fetch, conWorkflows = true }) {
  let r = null;
  if (conWorkflows) {
    try {
      r = await pedirToken({ jwt, installationId, fetchFn, permisos: PERMISOS });
    } catch (e) {
      // Solo el 422 es «permiso que no tiene»; lo demás (401, 404, red, permisos de más) se dice tal cual
      if (!(e instanceof ErrorToken) || e.status !== 422) throw e;
    }
  }
  if (!r) r = await pedirToken({ jwt, installationId, fetchFn, permisos: PERMISOS_SIN_WORKFLOWS });
  return { token: r.token, expira: r.expira, workflows: r.concedido.workflows === "write" ? "concedido" : "sin-conceder" };
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
  leer.catch(() => {
    // a propósito: si gana el tope de tiempo, el fallo de la lectura ya no importa; el motivo que sale por stderr es el del tope. Sin esto, Node avisa de un rechazo sin atender
  });
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
    const { token, expira, workflows } = await canjearToken({ jwt, installationId, fetchFn });
    if (salidaTTY) errores("token-sesiones aviso: stdout es una terminal; el token quedará en pantalla y en la transcripción. Captúralo con $(…), nunca lo imprimas\n");
    salida(`${token}\n`);
    errores(`token-sesiones resultado: ok expira: ${expira} workflows: ${workflows}\n`);
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
