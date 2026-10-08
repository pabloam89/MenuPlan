// Manejadores para un `.catch` que sigue adelante sin tragarse el error a
// escondidas (#177): siempre deja rastro en el log. Lo vigila
// sinErroresTragados.test.js.
//
//   seguirCon: se sigue a propósito (lo que falla es accesorio). Va con su
//              «// a propósito: …» al lado y deja un console.warn.
//   fallaCon:  es un fallo de verdad, pero no debe tumbar el turno: se sigue
//              con el valor por defecto y deja un console.error.
//
// Cada aviso es UNA línea JSON (#211) con el sitio y el motivo de dos
// vocabularios cerrados (src/lib/vocabularios.js), para poder contarlos con
// `npm run fallos`:
//   {"evento":"bot_fallo","donde":"agente_casa","motivo":"tiempo","codigo":"57014","grave":true}
// Sin datos de la familia: el texto del error solo va (recortado) cuando el
// motivo es `otro`, que es cuando hace falta para clasificarlo.

import { AnthropicError } from "@anthropic-ai/sdk/core/error";
import { SITIOS_FALLO } from "../../src/lib/vocabularios.js";

const SITIOS = new Set(SITIOS_FALLO);

/**
 * El valor que devuelve un `.catch(fallaCon(donde, SIN_LEER))` cuando quien llama
 * tiene que saber que NO se pudo leer (y no confundirlo con «no hay nada»):
 * `if (r === SIN_LEER) …`.
 */
export const SIN_LEER = Symbol("sin leer");

// SQLSTATE de Postgres y códigos de PostgREST → motivo. Los de dos letras son
// clases enteras (los dos primeros caracteres del SQLSTATE).
const POR_CODIGO = {
  "42501": "permiso",
  "42P01": "no_existe", "42883": "no_existe", "PGRST116": "no_existe", "PGRST202": "no_existe", "PGRST205": "no_existe",
  "23505": "conflicto", "23503": "conflicto", "40001": "conflicto", "40P01": "conflicto",
  "23502": "datos_invalidos", "23514": "datos_invalidos", "P0001": "datos_invalidos",
  "57014": "tiempo",
  "PGRST301": "sin_sesion", "PGRST302": "sin_sesion",
};
const POR_CLASE = { "22": "datos_invalidos", "08": "red", "53": "servidor" };
const TIEMPO_RED = /TIMEOUT|ETIMEDOUT/i;
const CAIDA_RED = /^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|ENETUNREACH|EHOSTUNREACH|UND_ERR_SOCKET|UND_ERR_CLOSED)$/;

/**
 * El HTTP y el código de un error. db.js y telegram.js los ponen en el error
 * (`status`, `codigo`); si no, se leen del mensaje de db.js
 * («GET /rest/v1/x → 503 PGRST002 …»).
 */
function datosDe(e) {
  const m = String(e?.message ?? "").match(/→ (\d{3})(?: ([0-9A-Z]{5}|PGRST\d{3})\b)?/);
  return {
    status: Number(e?.status ?? m?.[1]) || null,
    codigo: e?.codigo ?? m?.[2] ?? null,
  };
}

/**
 * El motivo de un error, de la lista cerrada MOTIVOS_FALLO. Primero de qué
 * servicio viene (Anthropic, Telegram), luego si se cortó por tiempo, el
 * código de Postgres o PostgREST, el HTTP, y por último la red.
 * @returns {string} un valor de MOTIVOS_FALLO (src/lib/vocabularios.js)
 */
export function motivoDe(e) {
  if (e == null || typeof e !== "object") return "otro";
  if (e instanceof AnthropicError) return "modelo";
  if (e.servicio === "telegram" || /^Telegram \w+:/.test(String(e.message ?? ""))) return "telegram";
  if (e.name === "AbortError" || e.name === "TimeoutError") return "tiempo";
  const causa = e.cause?.code ?? e.code;
  if (typeof causa === "string" && TIEMPO_RED.test(causa)) return "tiempo";
  const { status, codigo } = datosDe(e);
  if (codigo && POR_CODIGO[codigo]) return POR_CODIGO[codigo];
  if (codigo && POR_CLASE[String(codigo).slice(0, 2)]) return POR_CLASE[String(codigo).slice(0, 2)];
  if (status === 401) return "sin_sesion";
  if (status === 403) return "permiso";
  if (status === 404) return "no_existe";
  if (status === 408) return "tiempo";
  if (status === 409) return "conflicto";
  if (status === 400 || status === 422) return "datos_invalidos";
  if (status === 429) return "limite";
  if (status >= 500 && status < 600) return "servidor";
  if (e instanceof SyntaxError) return "datos_invalidos"; // un JSON roto
  if (typeof causa === "string" && CAIDA_RED.test(causa)) return "red";
  if (e instanceof TypeError && /fetch failed|network/i.test(String(e.message))) return "red";
  return "otro";
}

/**
 * ¿La base contestó, y lo que dijo es que no (no existe, choca, no vale)? Si
 * no, es que no se pudo preguntar: Lola dice que no ha podido, no que no hay.
 */
export const contesto = (motivo) => motivo === "no_existe" || motivo === "conflicto" || motivo === "datos_invalidos";

/**
 * La línea de log de un fallo. Devuelve el motivo, por si quien llama quiere
 * decidir con él qué contesta Lola.
 */
export function avisarFallo(donde, e, { grave = true } = {}) {
  const motivo = motivoDe(e);
  const { status, codigo } = datosDe(e);
  const linea = {
    evento: "bot_fallo",
    donde: SITIOS.has(donde) ? donde : "sin_sitio",
    motivo,
    codigo: codigo ?? (status ? String(status) : null),
    grave,
  };
  // Un sitio fuera de la lista no tumba nada aquí; lo para avisar.test.js.
  if (linea.donde !== donde) linea.sitio = String(donde).slice(0, 60);
  if (motivo === "otro") linea.texto = String(e?.message ?? e).slice(0, 200);
  (grave ? console.error : console.warn)(JSON.stringify(linea));
  return motivo;
}

/** console.warn con dónde y por qué, y sigue con `valor`. */
export const seguirCon = (donde, valor) => (e) => {
  avisarFallo(donde, e, { grave: false });
  return valor;
};

/** console.error con dónde y por qué, y sigue con `valor`. */
export const fallaCon = (donde, valor) => (e) => {
  avisarFallo(donde, e, { grave: true });
  return valor;
};
