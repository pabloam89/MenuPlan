/**
 * columnasVocabulario.mjs — las columnas de la base con un CHECK de lista de un vocabulario
 * del producto, en una sola lista (#549, fondo #479).
 *
 * La leen dos sitios, y por eso vive aquí y no en un test:
 *   - src/lib/vocabularios.test.js (COLUMNA_A_VOCABULARIO): la paridad del CHECK vigente de
 *     cada columna con su lista de src/lib/vocabularios.js, vivos y retirados;
 *   - scripts/lib/escritoresVocabulario.mjs (COLUMNAS): quién escribe cada una y si pasa por
 *     la lista viva (paraEscribir / listaParaEscribir).
 * Una columna nueva con vocabulario del producto se añade aquí, y las dos comprobaciones la
 * vigilan a la vez: no hay una segunda lista que se pueda olvidar.
 *
 * Cada entrada, «tabla.columna» → { lista, patrones?, comun?, rpc? }:
 *   - `lista`: el nombre en VOCABULARIOS (src/lib/vocabularios.js);
 *   - `patrones`: los `like` que el CHECK admite además de la lista (las carpetas del
 *     usuario, `fld_…`);
 *   - `comun`: el nombre de la columna lo usan también objetos que no son filas (`channel` en
 *     el contexto de un chat del bot, `lang` en el de Telegram, `origen` en la libreta). El
 *     escáner solo la mira en los escritores de su tabla (supabase/cableado.json) y en los
 *     objetos con forma de fila (otra clave en snake_case al lado, como `chat_id`);
 *   - `rpc`: { función: parámetro } cuando el valor entra a la tabla por una RPC desde JS: el
 *     escáner mira ese parámetro en los ficheros que llaman a la función.
 *
 * Fuera, a propósito: las listas que no son del producto (la ficha, `registro_campo.*`, y las
 * tareas del bot, `bot_tareas.kind/scope/…`), que no tienen ciclo de vida todavía; su paridad
 * la mira vocabularios.test.js con `valores`.
 */
export const COLUMNAS_VOCABULARIO = Object.freeze({
  "user_menu_weeks.active_days": { lista: "dias" },
  "user_pantry.pack_kind": { lista: "envases" },
  "user_recipes.required_appliances": { lista: "aparatos" },
  "user_recipes.usage_tags": { lista: "usos_receta" },
  "recipe_collections.collection_id": { lista: "carpetas_fijas", patrones: ["fld\\_%"] },
  "bot_entradas.proveedor": { lista: "canales", comun: true },
  "bot_identities.channel": { lista: "canales", comun: true },
  "bot_chats.channel": { lista: "canales", comun: true },
  "bot_codigos.channel": { lista: "canales", comun: true },
  "bot_messages.channel": { lista: "canales", comun: true },
  "bot_reminders.channel": { lista: "canales", comun: true },
  "bot_tareas.channel": { lista: "canales", comun: true },
  "bot_cola.channel": { lista: "canales", comun: true },
  "user_profiles.ui_lang": { lista: "idiomas" },
  "household_invites.lang": { lista: "idiomas", comun: true, rpc: { create_household_invite: "p_lang" } },
  "sobre.origen": { lista: "origen_dato", comun: true },
  "sobre.canal": { lista: "canales_dato", comun: true },
  // `ref_tipo` es también la clave de su lista en VOCABULARIOS: común, para no confundir la una con la otra.
  "receta_descartes.alcance": { lista: "alcances_descarte" },
  "sobre.ref_tipo": { lista: "ref_tipo", comun: true },
  // Las columnas del eje de registro_campo (0105): listas del producto que registroFicha.js usa en cada dato.
  // Comunes: «ficha», «clase», «escribe» y «choque» son también claves de objetos que no son filas.
  "registro_campo.ficha": { lista: "fichas", comun: true },
  "registro_campo.clase": { lista: "clase_dato", comun: true },
  "registro_campo.escribe": { lista: "escritores", comun: true },
  "registro_campo.choque": { lista: "choque", comun: true },
  // La operación (0105): la escribirá solo aplicar_operacion (0106), desde el jsonb que le pase la tubería (trozo 26).
  "operacion.canal": { lista: "canales_dato", comun: true },
  "operacion.ref_tipo": { lista: "refs_operacion", comun: true },
  "operacion.estado": { lista: "estados_operacion", comun: true },
});

/**
 * Las columnas que se escriben desde SQL además de (o en vez de) desde JS, con quién y por qué
 * la lista viva las cubre igual. El escáner solo lee JS: esto deja a la vista lo que no ve, y
 * vocabularios.test.js falla si un `update … set <col>`, un `insert into <tabla> (… <col> …)` o
 * un `default '<valor>'` de las migraciones sobre una columna de arriba no está aquí.
 */
export const ESCRITORES_SQL = Object.freeze({
  "bot_cola.channel": "el default 'telegram' de la 0063 lo pondría la base si una fila llegara sin channel; encolar (api/_bot/turnos.js) lo pasa explícito por paraEscribir, así que hoy no actúa",
  "user_menu_weeks.active_days": "la RPC de guardar semana (0057, 0068) inserta el active_days de la fila que monta weekToRow (src/lib/menusSync.js), que ya pasa por listaParaEscribir",
  "household_invites.lang": "create_household_invite (0071) inserta su p_lang, que householdsSync.js pasa por paraEscribir",
  "user_profiles.ui_lang": "bot_unirse_por_invitacion y accept_household_invite (0073, 0087) copian household_invites.lang, que ya entró por la lista viva",
  "registro_campo.ficha": "el INSERT de la 0105, generado de REGISTRO_CAMPOS (registroCampos.test.js lo compara); ningún JS escribe la tabla",
  "registro_campo.clase": "el INSERT de la 0105, generado de REGISTRO_CAMPOS (registroCampos.test.js lo compara); ningún JS escribe la tabla",
  "registro_campo.escribe": "el INSERT de la 0105, generado de REGISTRO_CAMPOS (registroCampos.test.js lo compara); ningún JS escribe la tabla",
  "registro_campo.choque": "el INSERT de la 0105, generado de REGISTRO_CAMPOS (registroCampos.test.js lo compara); ningún JS escribe la tabla",
});
