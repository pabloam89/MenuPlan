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

export function config() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o la clave de servicio");
  // Las claves nuevas (sb_secret_…) no van como Bearer; las JWT antiguas, sí.
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return { url, key, headers };
}

async function pedir(ruta, { method = "GET", body, prefer } = {}) {
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
    if (!res.ok) throw new Error(`${method} ${ruta.split("?")[0]} → ${res.status} ${text.slice(0, 300)}`);
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
  const u = await res.json().catch(seguirCon("db/usuario", null));
  return u?.id ? u : null;
}

export const eq = (v) => `eq.${encodeURIComponent(v)}`;
