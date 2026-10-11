/**
 * detector-identidades.mjs — intentos con la credencial de sesión que DEBEN fallar (#333, E7, primera mitad).
 *
 *   node scripts/detector-identidades.mjs        corre el corpus y dice, por sonda, bien | mal | sin-comprobar
 *
 * Cada sonda pide con el token que de verdad tiene una sesión (el de la App `homenu-sesiones`, recortado
 * a `PERMISOS` en token-sesiones.mjs) algo que una sesión no puede hacer: cambiar reglas, protección de
 * ramas o secretos del repo, ver las invitaciones, y abrir la bóveda de administración de 1Password con
 * la cuenta de servicio de sesiones. Si GitHub o 1Password contestan que NO, está bien.
 *
 * Qué prueba y qué no: prueba lo que una sesión puede hacer con SU token. No prueba si la App en GitHub
 * ha ganado permisos (un token recortado dice «no» tenga la App lo que tenga): eso lo avisa el arranque
 * con «permisos-de-mas» (`advertenciasDeInstalacion`, tokenSesion.mjs).
 *
 * Las sondas de escritura llevan cuerpo vacío: con el permiso, GitHub contestaría 422 (faltan campos
 * obligatorios, según su especificación) y no cambiaría nada. Una sonda de control (`GET` del repo) debe
 * dar 200: si no, el token no vale y nada se da por bueno. Un «bien» de GitHub es un 403 con el mensaje
 * «Resource not accessible by integration»; 401, 404, límites de uso y errores de GitHub son
 * «sin-comprobar», no un verde.
 *
 * Sale 1 si alguna sonda sale «mal», 2 si alguna quedó sin comprobar (sin red, token malo, límite de
 * uso) y no hay ningún «mal»: solo sale 0 si todas dieron «bien». Una línea por sonda, `campo: valor`,
 * para poder contarlas. Corre a mano con la sesión: el workflow semanal no lleva credenciales de sesión.
 */
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";

import { BOVEDA_PABLO, BOVEDA_SESIONES, tokenServicio } from "./lib/env.mjs";
import { API } from "./token-sesiones.mjs";
import { ErrorTokenSesion, REPO, tokenConCache } from "./lib/tokenSesion.mjs";

export const RESULTADOS = ["bien", "mal", "sin-comprobar"];

/** El mensaje de GitHub cuando un token de App no tiene el permiso. Un 403 con otro texto (límite, bloqueo) no dice nada del permiso. */
const SIN_PERMISO = /resource not accessible by integration/i;

/** Un límite de uso de GitHub también contesta 403: lo delatan estas cabeceras. */
const porLimite = (cabeceras) => Boolean(cabeceras?.get?.("retry-after")) || cabeceras?.get?.("x-ratelimit-remaining") === "0";

/**
 * Las sondas de GitHub: método y ruta. Las de escritura llevan cuerpo vacío; la de invitaciones es de
 * solo lectura y exige el mismo permiso de administración que invitar. Ninguna puede cambiar nada.
 */
export const SONDAS_GITHUB = [
  { id: "crear-ruleset", metodo: "POST", ruta: `/repos/${REPO}/rulesets` },
  { id: "proteger-main", metodo: "PUT", ruta: `/repos/${REPO}/branches/main/protection` },
  { id: "escribir-secreto-de-actions", metodo: "PUT", ruta: `/repos/${REPO}/actions/secrets/DETECTOR_PRUEBA` },
  { id: "ver-invitaciones", metodo: "GET", ruta: `/repos/${REPO}/invitations` },
];

/** La sonda de control: leer el repo con el mismo token debe dar 200. */
export const CONTROL = { id: "control-leer-repo", metodo: "GET", ruta: `/repos/${REPO}` };

async function pedir(sonda, { token, fetch: fetchFn = globalThis.fetch }) {
  const r = await fetchFn(`${API}${sonda.ruta}`, {
    method: sonda.metodo,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
    ...(sonda.metodo === "GET" ? {} : { body: "{}" }),
    signal: AbortSignal.timeout(15_000),
  });
  let mensaje = "";
  try {
    mensaje = String((await r.json())?.message ?? "");
  } catch {
    // a propósito: sin cuerpo JSON (un 204, una respuesta rara) el mensaje queda vacío y la sonda decide por el estado
  }
  return { estado: r.status, mensaje, limite: porLimite(r.headers) };
}

/**
 * Una sonda de GitHub: `bien` solo con un 403 de «no tienes permiso» (sin límite de uso), `mal` si pasa
 * (2xx) o llega a validar el cuerpo (422), y `sin-comprobar` con todo lo demás: sin respuesta, token
 * malo (401), recurso que no se ve (404), límite (429 o 403 con cabeceras de límite) o error de GitHub (5xx).
 */
export async function sondaGithub(sonda, opc) {
  let r;
  try {
    r = await pedir(sonda, opc);
  } catch {
    return { id: sonda.id, resultado: "sin-comprobar", estado: null }; // a propósito: sin red no se sabe; no se cuenta ni como bien ni como mal
  }
  const { estado } = r;
  let resultado = "sin-comprobar";
  if (estado === 403 && !r.limite && SIN_PERMISO.test(r.mensaje)) resultado = "bien";
  else if ((estado >= 200 && estado < 300) || estado === 422) resultado = "mal";
  return { id: sonda.id, resultado, estado };
}

/**
 * La bóveda de administración con la cuenta de servicio de sesiones: la lista de bóvedas que ve debe ser
 * solo la de sesiones. «bien» si es exactamente esa, «mal» si aparece la de administración, y cualquier
 * fallo (límite, red, sin cuenta de servicio) «sin-comprobar»: no se fía del texto del error.
 */
export function leerBovedaDePablo({ correr = execFile, token = tokenServicio() } = {}) {
  const id = "leer-boveda-de-administracion";
  return new Promise((ok) => {
    if (!token) return ok({ id, resultado: "sin-comprobar", estado: null }); // sin la cuenta de servicio no hay con qué probar (y `op` iría por la app de Pablo)
    const env = { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token };
    correr("op", ["vault", "list", "--format", "json"], { windowsHide: true, env, encoding: "utf8", timeout: 15_000 }, (error, salida) => {
      if (error) return ok({ id, resultado: "sin-comprobar", estado: error.code ?? 1 });
      let nombres;
      try {
        nombres = JSON.parse(String(salida)).map((b) => b?.name);
      } catch {
        return ok({ id, resultado: "sin-comprobar", estado: 0 }); // a propósito: una salida que no es la lista no prueba nada
      }
      const resultado = nombres.includes(BOVEDA_PABLO) ? "mal" : nombres.length === 1 && nombres[0] === BOVEDA_SESIONES ? "bien" : "sin-comprobar";
      ok({ id, resultado, estado: 0 });
    });
  });
}

export const lineaDeSonda = ({ id, resultado, estado }) => `detector-identidades: sonda: ${id} resultado: ${resultado} estado: ${estado ?? "-"}`;

export async function main({ generar = tokenConCache, fetch: fetchFn, leerBoveda = leerBovedaDePablo, salida = console } = {}) {
  let token;
  try {
    token = (await generar({})).token;
  } catch (e) {
    if (!(e instanceof ErrorTokenSesion)) throw e;
    salida.error(`detector-identidades: sin token de sesión (${e.motivo}): no se puede probar`);
    return 2;
  }
  // El control primero: con un token caducado o revocado todo daría «no» y parecería un verde
  let control;
  try {
    control = await pedir(CONTROL, { token, fetch: fetchFn });
  } catch {
    control = { estado: null }; // a propósito: sin red no hay control, y sin control no se prueba nada
  }
  if (control.estado !== 200) {
    salida.error(`detector-identidades: el control (leer el repo) no dio 200 sino ${control.estado ?? "nada"}: el token no sirve y no se prueba nada`);
    return 2;
  }
  const lineas = [];
  for (const s of SONDAS_GITHUB) lineas.push(await sondaGithub(s, { token, fetch: fetchFn }));
  lineas.push(await leerBoveda());
  for (const l of lineas) salida.log(lineaDeSonda(l));
  const mal = lineas.filter((l) => l.resultado === "mal").length;
  salida.log(`detector-identidades: resumen: sondas: ${lineas.length} mal: ${mal} sin_comprobar: ${lineas.filter((l) => l.resultado === "sin-comprobar").length}`);
  if (mal > 0) return 1;
  return lineas.some((l) => l.resultado === "sin-comprobar") ? 2 : 0; // algo sin probar no es un verde
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main());
}
