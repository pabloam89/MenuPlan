/**
 * detector-identidades.mjs — intentos con la credencial de sesión que DEBEN fallar (#333, E7, primera mitad).
 *
 *   node scripts/detector-identidades.mjs        corre el corpus y dice, por sonda, bien | mal | sin-comprobar
 *
 * Cada sonda pide con el token de la App `homenu-sesiones` algo que una sesión no puede hacer
 * (cambiar reglas, protección de ramas o secretos del repo) y lee la bóveda de administración
 * con la cuenta de servicio de sesiones. Si GitHub o 1Password contestan que NO, está bien.
 * Las sondas de escritura de GitHub llevan un cuerpo vacío: si el token tuviera el permiso, GitHub
 * contestaría 422 (cuerpo inválido) y no cambiaría nada, y eso se cuenta como «mal».
 *
 * Los permisos que la App debe tener no se repiten aquí: los fija `PERMISOS` en token-sesiones.mjs y
 * el arranque ya avisa de «permisos-de-mas» (tokenSesion.mjs). Esto cubre lo otro: que lo prohibido
 * siga fallando. Corre a mano con la sesión (el workflow semanal no tiene credenciales de sesión).
 * Sale 1 si alguna sonda sale «mal», 2 si alguna quedó sin comprobar (sin red, token malo, límite de
 * uso) y no hay ningún «mal»: solo sale 0 si todas dieron «bien».
 * Una línea por sonda, `campo: valor`, para poder contarlas.
 */
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";

import { BOVEDA_PABLO, entornoOp } from "./lib/env.mjs";
import { API } from "./token-sesiones.mjs";
import { ErrorTokenSesion, REPO, tokenConCache } from "./lib/tokenSesion.mjs";

export const RESULTADOS = ["bien", "mal", "sin-comprobar"];

/** Lo que GitHub contesta cuando NO se tiene el permiso (404 cuando el recurso se esconde). 401 no está: es un token malo, no un permiso que falta. */
const DENEGADO = [403, 404];

/** Un 403 por límite de uso de GitHub no dice nada del permiso: lo delatan estas cabeceras. */
const porLimite = (cabeceras) => Boolean(cabeceras?.get?.("retry-after")) || cabeceras?.get?.("x-ratelimit-remaining") === "0";

/**
 * Las sondas de GitHub: método y ruta. Las de escritura llevan cuerpo vacío (con el permiso, GitHub
 * contesta 422 y no cambia nada); la de invitaciones es de solo lectura y exige el mismo permiso de
 * administración que invitar. Así ninguna puede cambiar nada aunque pase.
 */
export const SONDAS_GITHUB = [
  { id: "crear-ruleset", metodo: "POST", ruta: `/repos/${REPO}/rulesets` },
  { id: "proteger-main", metodo: "PUT", ruta: `/repos/${REPO}/branches/main/protection` },
  { id: "escribir-secreto-de-actions", metodo: "PUT", ruta: `/repos/${REPO}/actions/secrets/DETECTOR_PRUEBA` },
  { id: "ver-invitaciones", metodo: "GET", ruta: `/repos/${REPO}/invitations` },
];

/**
 * Una sonda de GitHub: `bien` si lo deniega (403 o 404 sin límite de uso), `mal` si pasa (2xx) o llega a
 * validar el cuerpo (422), y `sin-comprobar` con todo lo demás: sin respuesta, token malo (401), límite
 * (429 o 403 con cabeceras de límite) o error de GitHub (5xx).
 */
export async function sondaGithub(sonda, { token, fetch: fetchFn = globalThis.fetch }) {
  let estado;
  try {
    const r = await fetchFn(`${API}${sonda.ruta}`, {
      method: sonda.metodo,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
      ...(sonda.metodo === "GET" ? {} : { body: "{}" }),
      signal: AbortSignal.timeout(15_000),
    });
    estado = r.status;
    if (DENEGADO.includes(estado) && porLimite(r.headers)) return { id: sonda.id, resultado: "sin-comprobar", estado };
  } catch {
    return { id: sonda.id, resultado: "sin-comprobar", estado: null }; // a propósito: sin red no se sabe; no se cuenta ni como bien ni como mal
  }
  const resultado = DENEGADO.includes(estado) ? "bien" : (estado >= 200 && estado < 300) || estado === 422 ? "mal" : "sin-comprobar";
  return { id: sonda.id, resultado, estado };
}

/** Lee la bóveda de administración con la cuenta de sesiones: debe fallar. Un fallo por límite o por red no es un «bien». */
export function leerBovedaDePablo({ correr = execFile } = {}) {
  return new Promise((ok) => {
    let env;
    try {
      env = entornoOp();
    } catch {
      return ok({ id: "leer-boveda-de-administracion", resultado: "sin-comprobar", estado: null }); // a propósito: sin la cuenta de servicio no hay con qué probar
    }
    correr("op", ["vault", "get", BOVEDA_PABLO], { windowsHide: true, env, encoding: "utf8", timeout: 15_000 }, (error, _salida, stderr) => {
      const texto = String(stderr ?? "");
      if (!error) return ok({ id: "leer-boveda-de-administracion", resultado: "mal", estado: 0 });
      // Denegado de verdad: 1Password dice que la bóveda no existe o no hay permiso. Cualquier otro fallo (límite, red) no prueba nada.
      const denegado = /isn't a vault in this account|not authorized|forbidden/i.test(texto);
      ok({ id: "leer-boveda-de-administracion", resultado: denegado ? "bien" : "sin-comprobar", estado: error.code ?? 1 });
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
