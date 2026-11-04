/**
 * Exportar una casa (trozo 36 de #1037, privacidad): todo lo que la base guarda de una casa, en un JSON que la
 * familia se puede descargar. Una lista cerrada de tablas, cada una exportada o fuera con su porqué, para que una
 * tabla nueva de la casa no se quede fuera sin que nadie lo decida: exportarCasa.test.js cruza estas dos listas con
 * las tablas que tienen `household_id` en las migraciones (scripts/lib/migraciones.mjs).
 *
 * Pura: arma el JSON a partir de las filas que le den. Quién la usa: api/_bot/exportar.js (lee cada tabla con la
 * service role), desde GET /api/operacion?casa=<uuid>&exportar=1.
 */

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
  "user_menus", "user_menu_weeks", "user_menu_recipes", "user_pantry", "cocinado", "ticket", "precio_observado",
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
  ["bot_deshacer", "técnico: la copia de antes de cada cambio de Lola para deshacerlo; lo que guarda ya sale de sus tablas"],
]);

/**
 * Pura. El JSON de una casa: `{ formato, casa, exportado_at, tablas: { [tabla]: { filas, cortada } } }`.
 * `leidas`: `{ [tabla]: filas[] }` tal como salen de la base, con hasta LIMITE_FILAS + 1 filas (la de más dice
 * que había más). Una tabla de TABLAS_EXPORTADAS que no llega lanza: una exportación a medias no se da por buena.
 */
export function armarExportacion({ casa, leidas = {}, ahora = new Date() }) {
  if (!casa) throw new Error("exportar: falta la casa");
  const tablas = {};
  for (const t of TABLAS_EXPORTADAS) {
    const filas = leidas[t];
    if (!Array.isArray(filas)) throw new Error(`exportar: la tabla ${t} no se ha leído`);
    const cortada = filas.length > LIMITE_FILAS;
    tablas[t] = { filas: cortada ? filas.slice(0, LIMITE_FILAS) : filas, cortada };
  }
  return { formato: VERSION_EXPORTAR, casa, exportado_at: ahora.toISOString(), tablas };
}
