/**
 * Tareas abiertas del bot (supabase/migrations/0076_bot_tareas.sql): seguimientos
 * y preguntas pendientes. Lola las lee en cada turno junto a la ficha; solo se
 * crea un seguimiento con el sí explícito de la persona (confirmado = true), y
 * el tope por casa y la caducidad evitan que se acumulen.
 */

import { select, insert, update, eq } from "./db.js";

export const LIMITE_ABIERTAS = 8;
export const CADUCIDAD_DIAS = 30;
const TEXTO_MAX = 240;

/** Pura. Qué tareas puede ver quien escribe: las de la casa, y las suyas solo en privado. */
export function filtroDeLectura({ householdId, userId = null, privado = false }) {
  const desde = new Date(Date.now() - CADUCIDAD_DIAS * 86400000).toISOString();
  const ver = privado && userId
    ? `or=(scope.eq.casa,and(scope.eq.personal,owner_user_id.eq.${userId}))`
    : "scope=eq.casa";
  return `household_id=${eq(householdId)}&status=eq.abierta&created_at=gt.${encodeURIComponent(desde)}&${ver}&order=created_at.asc&limit=${LIMITE_ABIERTAS}`;
}

/** Pura. El bloque que se pasa al modelo junto al mensaje, sin id visible para la persona. */
export function bloqueDeTareas(tareas = []) {
  if (!tareas.length) return "";
  const lineas = tareas.map((t) => `- [${t.id}] ${t.kind === "pregunta" ? "Falta saber" : "Seguimiento"}: ${t.texto}${t.falta ? ` (falta: ${t.falta})` : ""}${t.scope === "personal" ? " (personal)" : ""}`);
  return ["[Tareas abiertas de la casa. No las ha escrito la persona.]", ...lineas,
    "Si lo que dice ahora la cierra, llama a cerrar_tarea con su id."].join("\n");
}

/** Pura. Valida lo que propone el modelo antes de escribir nada. */
export function validarNueva({ texto, kind, scope, confirmado }) {
  if (confirmado !== true) return { error: "Antes de anotarlo, pregúntale si quiere que lo apunte. Solo con su sí." };
  const limpio = String(texto ?? "").trim().slice(0, TEXTO_MAX);
  if (!limpio) return { error: "¿Qué quieres que quede apuntado?" };
  if (!["seguimiento", "pregunta"].includes(kind)) return { error: "Tipo de tarea no válido." };
  if (!["casa", "personal"].includes(scope ?? "casa")) return { error: "Ámbito no válido." };
  return { valor: { texto: limpio, kind, scope: scope ?? "casa" } };
}

export async function tareasAbiertas(householdId, opciones) {
  if (!householdId) return [];
  return select("bot_tareas", filtroDeLectura({ householdId, ...opciones }), "id,kind,scope,texto,falta,clave,created_at");
}

export async function anotarTarea({ householdId, channel, chatId, userId = null, privado = false }, datos) {
  const v = validarNueva(datos);
  if (v.error) return v.error;
  const abiertas = await select("bot_tareas", `household_id=${eq(householdId)}&status=eq.abierta`, "id");
  if (abiertas.length >= LIMITE_ABIERTAS) return `Ya hay ${LIMITE_ABIERTAS} tareas abiertas en la casa; cierra alguna antes.`;
  if (v.valor.scope === "personal" && !(privado && userId)) return "Lo personal solo se apunta en un chat privado.";
  await insert("bot_tareas", [{
    household_id: householdId, channel, chat_id: String(chatId), kind: v.valor.kind, scope: v.valor.scope,
    owner_user_id: v.valor.scope === "personal" ? userId : null, texto: v.valor.texto, created_by: userId,
  }]);
  return "Hecho: lo tengo apuntado.";
}

export async function cerrarTarea(householdId, id, estado = "hecha") {
  if (!/^[0-9a-f-]{36}$/i.test(String(id ?? ""))) return "No encuentro esa tarea.";
  await update("bot_tareas", `id=${eq(id)}&household_id=${eq(householdId)}&status=eq.abierta`, { status: estado, closed_at: new Date().toISOString() });
  return estado === "hecha" ? "Hecho: la tengo por cerrada." : "Hecho: la he descartado.";
}
