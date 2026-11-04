/**
 * Borrar una persona (trozo 36 de #1037): qué pasa, tabla por tabla, con lo suyo.
 *
 * Quitar a alguien de la casa va por escribir_persona (0108) en una transacción: borra su fila de `persona` y las FK
 * se llevan su salud, sus sobres y sus preferencias, o sueltan lo que la nombra. Lo que no tiene FK lo barre
 * caducidades.js cada hora (referenciasRotas.js). Quedaban copias de sus datos (nombre, peso, alergias) en dos
 * historiales: las fotos para deshacer (`bot_deshacer`, la casa entera con su familia), que se anonimizan aquí
 * (anonimizarFoto, pura; quien escribe es api/_bot/borrarPersona.js), y el pedido y la inversa de sus operaciones
 * pasadas (`operacion`). Esa es tabla de ficha: solo la escribe la tubería en la base (tuberiaUnica.test.js), así que
 * su anonimizado irá dentro de escribir_persona, con una migración (#1249).
 *
 * Una tabla nueva que apunte a una persona entra en AL_BORRAR_PERSONA: supabase/borrarPersona.test.js falla si una FK
 * a `persona` o una columna `*_member` no está, o si su destino no es el que dice su FK.
 */
import { porNombre } from "./vocabularios.js";

/** Lo que le pasa a una fila (o a una columna) cuando se borra la persona a la que apunta. */
export const DESTINOS_AL_BORRAR = ["borra", "suelta", "barre", "anonimiza", "queda"];
export const DESTINO_AL_BORRAR = porNombre(DESTINOS_AL_BORRAR);

const D = DESTINO_AL_BORRAR;

/**
 * `tabla.columna` → { destino, por }. borra: la FK con `on delete cascade`; suelta: con `set null`; barre: sin FK,
 * la limpia caducidades.js (barrerReferencias); anonimiza: el JSON pierde a la persona (anonimizarFoto); queda: se
 * guarda, con su porqué.
 */
export const AL_BORRAR_PERSONA = Object.freeze({
  "persona.id": { destino: D.BORRA, por: "la fila de la persona: escribir_persona la borra (0108)" },
  "persona_alergia.persona_id": { destino: D.BORRA, por: "su salud" },
  "persona_intolerancia.persona_id": { destino: D.BORRA, por: "su salud" },
  "persona_perfil_salud.persona_id": { destino: D.BORRA, por: "su salud" },
  "persona_estado.persona_id": { destino: D.BORRA, por: "su salud (embarazo, lactancia…)" },
  "grupo_persona.persona_id": { destino: D.BORRA, por: "su sitio en los grupos" },
  "sobre.persona_id": { destino: D.BORRA, por: "sus datos con sobre" },
  "preferencia.persona_id": { destino: D.BORRA, por: "sus gustos" },
  "plan_preferencias.persona_id": { destino: D.BORRA, por: "sus conjuntos de gustos" },
  "bot_tareas.persona_id": { destino: D.SUELTA, por: "la tarea es de la casa; deja de ser sobre ella" },
  "operacion.autor_persona_id": { destino: D.SUELTA, por: "la operación es de la casa; deja de firmarla ella" },
  "bot_tareas.para_member": { destino: D.BARRE, por: "sin FK: caducidades.js descarta el recordatorio que era para ella" },
  "bot_tareas.asignado_member": { destino: D.BARRE, por: "sin FK: caducidades.js deja la tarea sin encargado" },
  "bot_deshacer.antes": { destino: D.ANONIMIZA, por: "la foto de la casa lleva su ficha en members: sale de las que ya no se pueden usar; la del propio borrado se queda para «deshaz»" },
  "operacion.pedido": { destino: D.QUEDA, por: "lleva sus campos (alergias, salud); tabla de ficha: lo anonimizará escribir_persona con una migración (#1249)" },
  "operacion.inversa": { destino: D.QUEDA, por: "lleva su fila entera; tabla de ficha: lo anonimizará escribir_persona con una migración (#1249)" },
  "bot_messages.content": { destino: D.QUEDA, por: "lo que la familia escribió en la charla: no se reescribe; se va con la casa o con la cuenta (cascadas.mjs)" },
});

/**
 * Pura. Una foto de `bot_deshacer` (`antes`) sin esas personas en `state.data.members`. Devuelve el `antes` nuevo o
 * null si no estaban.
 */
export function anonimizarFoto(antes, personas) {
  const ids = new Set([...personas].map(String));
  const members = antes?.state?.data?.members;
  if (!Array.isArray(members) || !members.some((m) => ids.has(String(m?.id)))) return null;
  return { ...antes, state: { ...antes.state, data: { ...antes.state.data, members: members.filter((m) => !ids.has(String(m?.id))) } } };
}

/** Pura. Los ids de las personas que borra un cambio de la familia (`personas: [{ id, borrar: true }]`). */
export const borradasDe = (pedido) => (pedido?.personas ?? []).filter((p) => p?.borrar === true && p.id != null).map((p) => String(p.id));
