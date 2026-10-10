/**
 * Acceso a Supabase desde el bot, con la clave de servicio.
 *
 * El bot no tiene sesión de usuario: escribe en nombre de la casa enlazada al
 * chat. Por eso usa la clave de servicio (salta RLS) y TODA la autorización
 * vive aquí arriba, en qué chat está enlazado a qué casa (bot_chats). Nada de
 * esto sale nunca hacia el cliente.
 */

import { seguirCon } from "./avisar.js";
import { AsyncLocalStorage } from "node:async_hooks";

const TIMEOUT_MS = 8000;

// ¿Ha llegado a la base alguna escritura mientras corría esto? Lo usa el
// agente para saber si una herramienta GUARDÓ, no solo si lo intentó: así no
// hay que llevar a mano qué herramienta escribe en qué tabla. Los registros
// (memoria del chat, eventos, fotos para deshacer) no cuentan.
const escrituras = new AsyncLocalStorage();
const SOLO_REGISTRO = new Set(["bot_messages", "user_events", "bot_route", "bot_deshacer"]);
export async function contandoEscrituras(correr) {
  const cuenta = { n: 0 };
  const r = await escrituras.run(cuenta, correr);
  return { r, escribio: cuenta.n > 0 };
}
function contarEscritura(ruta) {
  const cuenta = escrituras.getStore();
  if (!cuenta) return;
  const tabla = ruta.split("?")[0].replace(/^\/rest\/v1\/(rpc\/)?/, "");
  if (!SOLO_REGISTRO.has(tabla)) cuenta.n++;
}

// Solo lectura (el canario, api/bot/canario.js, #267): nada de lo que corra
// dentro llega a escribir en la base. Los registros (SOLO_REGISTRO: eventos,
// memoria) se callan sin ir a la base, para no dejar basura; cualquier otra
// escritura se niega con un error y se apunta, y quien llama lo da por fallo.
// Las funciones de la base que solo leen pasan.
const soloLectura = new AsyncLocalStorage();
const RPC_DE_LECTURA = new Set(["ficha_casa"]);
export async function enSoloLectura(correr) {
  const nota = { negadas: [], calladas: 0 };
  const r = await soloLectura.run(nota, correr);
  return { r, negadas: nota.negadas, calladas: nota.calladas };
}
/** Si se corta una escritura en solo lectura: `{ callar: true }` para un registro; lanza para lo demás; null si pasa. */
function cortarEnSoloLectura(ruta, method) {
  const nota = soloLectura.getStore();
  if (!nota || method === "GET") return null;
  const esRpc = ruta.startsWith("/rest/v1/rpc/");
  const nombre = ruta.split("?")[0].replace(/^\/rest\/v1\/(rpc\/)?/, "");
  if (esRpc && RPC_DE_LECTURA.has(nombre)) return null;
  if (!esRpc && SOLO_REGISTRO.has(nombre)) { nota.calladas++; return { callar: true }; }
  nota.negadas.push(nombre);
  throw Object.assign(new Error(`${method} ${nombre} → solo lectura`), { soloLectura: true });
}

export function config() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o la clave de servicio");
  // Las claves nuevas (sb_secret_…) no van como Bearer; las JWT antiguas, sí.
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return { url, key, headers };
}

/**
 * Lo que se guarda de un error de PostgREST: solo `code` y `message`. Fuera
 * `details` y `hint`: el DETAIL de Postgres puede llevar la fila entera (un
 * token de enlace, por ejemplo) y el mensaje acaba en los logs.
 */
export function resumenDeError(text) {
  let j = null;
  try { j = JSON.parse(text); } catch { /* a propósito: no es JSON; abajo, el texto recortado */ }
  if (j && typeof j === "object" && (j.code || j.message)) return [j.code, j.message].filter(Boolean).join(" ").slice(0, 300);
  return String(text ?? "").slice(0, 300);
}

/** El código de un error de PostgREST (SQLSTATE o PGRSTnnn), o null. */
export function codigoDeError(text) {
  try {
    const j = JSON.parse(text);
    return typeof j?.code === "string" && j.code ? j.code.slice(0, 12) : null;
  } catch { return null; } // a propósito: sin JSON no hay código; el mensaje ya lleva el texto
}

async function pedir(ruta, { method = "GET", body, prefer } = {}) {
  if (cortarEnSoloLectura(ruta, method)?.callar) return [];
  const { url, headers } = config();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}${ruta}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    // `status` y `codigo` van en el error para que avisar.js sepa por qué
    // falló (motivoDe) sin leer el mensaje.
    if (!res.ok) throw Object.assign(new Error(`${method} ${ruta.split("?")[0]} → ${res.status} ${resumenDeError(text)}`), { status: res.status, codigo: codigoDeError(text) });
    const datos = text ? JSON.parse(text) : null;
    // Un rpc que guarda contesta { ok }: solo cuenta si fue ok (un choque de
    // versión no es una escritura). Un PATCH que no tocó ninguna fila, tampoco.
    const hizoAlgo = ruta.startsWith("/rest/v1/rpc/") ? datos?.ok !== false : !(Array.isArray(datos) && datos.length === 0);
    if (method !== "GET" && hizoAlgo) contarEscritura(ruta);
    return datos;
  } finally {
    clearTimeout(t);
  }
}

/** Filas de una tabla con un filtro PostgREST ya escrito (`col=eq.valor&…`). */
export const select = (tabla, filtro, columnas = "*") =>
  pedir(`/rest/v1/${tabla}?select=${encodeURIComponent(columnas)}${filtro ? `&${filtro}` : ""}`);

export const insert = (tabla, filas, { upsert = false } = {}) =>
  pedir(`/rest/v1/${tabla}`, {
    method: "POST",
    body: filas,
    prefer: upsert ? "resolution=merge-duplicates,return=representation" : "return=representation",
  });

export const update = (tabla, filtro, cambios) =>
  pedir(`/rest/v1/${tabla}?${filtro}`, { method: "PATCH", body: cambios, prefer: "return=representation" });

export const borrar = (tabla, filtro) => pedir(`/rest/v1/${tabla}?${filtro}`, { method: "DELETE" });

export const rpc =(funcion, args) => pedir(`/rest/v1/rpc/${funcion}`, { method: "POST", body: args });

/** El usuario detrás de un JWT de la app, validado contra Supabase Auth. */
export async function usuarioDeToken(accessToken) {
  const { url, key } = config();
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  // a propósito: un cuerpo que no es JSON es un token sin usuario
  const u = await res.json().catch(seguirCon("db_usuario", null));
  return u?.id ? u : null;
}

export const eq = (v) => `eq.${encodeURIComponent(v)}`;
