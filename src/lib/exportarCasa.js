/**
 * Exportar una casa (trozo 36 de #1037, privacidad): todo lo que la base guarda de una casa, en un JSON que la
 * familia se puede descargar. Una lista cerrada de tablas, cada una exportada o fuera con su porqué, para que una
 * tabla nueva de la casa no se quede fuera sin que nadie lo decida: exportarCasa.test.js cruza estas dos listas con
 * las tablas que tienen `household_id` en las migraciones (scripts/lib/migraciones.mjs).
 *
 * Pura: arma el JSON a partir de las filas que le den. Quién la usa: api/_bot/exportar.js (lee cada tabla con la
 * service role), desde GET /api/operacion?casa=<uuid>&exportar=1.
 */

import { AMBITOS_TAREA, porNombre } from "./vocabularios.js";

const AMBITO_TAREA = porNombre(AMBITOS_TAREA);
/** El tipo de chat de Telegram de una conversación a solas con Lola (bot_chats.kind). */
const CHAT_PRIVADO = "private";

/** Versión del formato del JSON: sube si cambia su forma. */
export const VERSION_EXPORTAR = 1;

/** Filas de una tabla como mucho: más, y se corta y se dice (`cortada: true`), nunca en silencio. */
export const LIMITE_FILAS = 1000;

/** Las tablas de la casa que se exportan enteras (sus filas de esa casa, por columnaDeCasa), por orden de lectura. */
export const TABLAS_EXPORTADAS = Object.freeze([
  // La casa y quién es de ella.
  "households", "household_state", "household_members", "persona", "grupo", "grupo_persona",
  // Salud de cada persona.
  "persona_alergia", "persona_intolerancia", "persona_estado", "persona_perfil_salud",
  // La ficha: cada dato con su sobre, las preferencias y lo aprendido.
  "sobre", "preferencia", "plan_preferencias", "senal", "operacion",
  // Menús, compra, despensa, cocina y gasto.
  "user_menus", "user_menu_weeks", "user_menu_recipes", "menu_generado", "user_pantry", "cocinado", "ticket", "precio_observado",
  // Recetas de la casa.
  "household_favorites", "household_recipe_discards", "receta_descartes",
  // Lola: chats, conversación, tareas y uso.
  "bot_chats", "bot_messages", "bot_tareas", "bot_usage",
]);

/** La columna que dice de qué casa es cada fila: `household_id`, salvo en la propia tabla de casas. */
export const COLUMNA_DE_CASA = Object.freeze({ households: "id" });
export const columnaDeCasa = (tabla) => COLUMNA_DE_CASA[tabla] ?? "household_id";

/** Las tablas de la casa que NO se exportan, con su porqué. */
export const TABLAS_NO_EXPORTADAS = new Map([
  ["bot_link_tokens", "secreto: el token que enlaza un chat con la cuenta; exportarlo dejaría enlazar otro chat"],
  ["household_invites", "secreto: el código de invitación a la casa; exportarlo dejaría entrar a otra persona"],
  ["bot_idempotencia", "técnico: las claves para no hacer dos veces el mismo mensaje; no dicen nada de la familia"],
  ["bot_enlaces", "medida: cada intento de conectar un chat (camino y resultado, 0126, #1238), para contar los rechazos; no guarda nada de lo que la familia dice o come, y leerla antes de aplicar la 0126 tumbaría la descarga entera"],
  ["mercadona_cuenta", "secreto: la sesión de Mercadona, sellada; solo sirve al trabajador y exportarla no le dice nada a la familia"],
  ["mercadona_encargo", "técnico: cada vez que se pidió rellenar la lista; lleva el chat de quien lo pidió, y leerla antes de aplicar la 0131 tumbaría la descarga entera"],
  ["bot_deshacer", "técnico: la copia de antes de cada cambio de Lola para deshacerlo; lo que guarda ya sale de sus tablas"],
]);

/**
 * Columnas secretas de una tabla que sí se exporta: se quitan de cada fila, con su porqué. La base solo enseña
 * invite_token a quien edita la casa (0087, `ficha` de la casa); en la exportación no va a nadie.
 */
export const COLUMNAS_SECRETAS = new Map([
  ["households.invite_token", "secreto: el enlace para entrar en la casa; con él, quien tenga el fichero metería a otra persona"],
]);

/** Lo que tiene nombre de secreto (token, clave, código…): cada columna así de una tabla exportada tiene que estar clasificada. */
export const PARECE_SECRETO = /(token|secret|clave|code|codigo|password|key|hash)/i;

/** Las columnas con nombre de secreto que no lo son, con su porqué (exportarCasa.test.js exige una u otra lista). */
export const COLUMNAS_QUE_NO_SON_SECRETO = new Map([
  ["persona.clave_perfil", "la clave de la persona en la ficha (de quién es cada dato), no una contraseña"],
  ["persona.clave_avatar", "qué dibujo lleva la persona"],
  ["operacion.clave", "la clave para no apuntar dos veces la misma operación"],
  ["bot_tareas.clave", "la clave para no abrir dos veces la misma tarea"],
  ["bot_usage.input_tokens", "cuánto texto leyó el modelo en ese turno (una cuenta, no una credencial)"],
  ["bot_usage.output_tokens", "cuánto texto escribió el modelo en ese turno"],
  ["bot_usage.cache_read_tokens", "cuánto texto salió de la caché del modelo"],
  ["bot_usage.cache_write_tokens", "cuánto texto entró en la caché del modelo"],
]);

/**
 * Lo que es de una sola persona de la casa y no se da a las demás: su chat privado con Lola (`bot_chats` de tipo
 * `private` y sus `bot_messages`) y sus tareas personales (`bot_tareas` con `scope` personal). En la app nadie
 * ve esas tablas (0057: RLS sin policy), y en privado Lola habla solo con esa persona. Pura: deja lo de la casa y lo
 * de quien exporta. `quien`: `{ userId, propios }`, los ids de mensajería de quien exporta (su chat privado).
 */
export function soloLoQueEsSuyo(leidas, { userId, propios = [] }) {
  const mios = new Set(propios.map(String));
  const chats = (leidas.bot_chats ?? []).filter((c) => c.kind !== CHAT_PRIVADO || mios.has(String(c.chat_id)));
  const vistos = new Set(chats.map((c) => `${c.channel}|${c.chat_id}`));
  return {
    ...leidas,
    bot_chats: chats,
    // Un mensaje de un chat que no está entre los que se ven (de otra persona, o de un chat ya desenlazado) no sale.
    bot_messages: (leidas.bot_messages ?? []).filter((m) => vistos.has(`${m.channel}|${m.chat_id}`)),
    bot_tareas: (leidas.bot_tareas ?? []).filter((t) => t.scope !== AMBITO_TAREA.PERSONAL || (userId && t.owner_user_id === userId)),
  };
}

const secretasDe = (tabla) => [...COLUMNAS_SECRETAS.keys()].filter((k) => k.startsWith(`${tabla}.`)).map((k) => k.slice(tabla.length + 1));
const sinSecretas = (filas, fuera) => (fuera.length ? filas.map((f) => Object.fromEntries(Object.entries(f).filter(([c]) => !fuera.includes(c)))) : filas);

/**
 * Pura. El JSON de una casa: `{ formato, casa, exportado_at, tablas: { [tabla]: { filas, cortada } } }`.
 * `leidas`: `{ [tabla]: filas[] }` tal como salen de la base, con hasta LIMITE_FILAS + 1 filas (la de más dice
 * que había más). Una tabla de TABLAS_EXPORTADAS que no llega lanza: una exportación a medias no se da por buena.
 * Las columnas de COLUMNAS_SECRETAS se quitan de cada fila, y lo privado de otra persona (soloLoQueEsSuyo) no sale.
 */
export function armarExportacion({ casa, leidas: crudas = {}, quien, ahora = new Date() }) {
  if (!casa) throw new Error("exportar: falta la casa");
  if (!quien?.userId) throw new Error("exportar: falta quién exporta (sin él no se sabe qué es privado de otro)");
  for (const t of TABLAS_EXPORTADAS) if (!Array.isArray(crudas[t])) throw new Error(`exportar: la tabla ${t} no se ha leído`);
  const leidas = soloLoQueEsSuyo(crudas, quien);
  const tablas = {};
  for (const t of TABLAS_EXPORTADAS) {
    // Cortada se mira en lo leído, antes de quitar lo privado de otros: si no, una tabla cortada podría parecer entera.
    const cortada = crudas[t].length > LIMITE_FILAS;
    tablas[t] = { filas: sinSecretas(leidas[t].slice(0, LIMITE_FILAS), secretasDe(t)), cortada };
  }
  return { formato: VERSION_EXPORTAR, casa, exportado_at: ahora.toISOString(), tablas };
}
