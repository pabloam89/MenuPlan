/**
 * El rastro de lo que hace cada casa: qué plato se quitó y cuál se puso, qué
 * opción eligieron, qué se cocinó, de dónde salen sus recetas. Es lo que lee
 * el analista (specs/ficha-de-la-casa.md, paso 2): sin esto no tiene nada.
 *
 * Va a `user_events` (solo se añade, nunca se borra: un menú borrado no se
 * lleva lo que se cocinó), con `screen = "menu"` y `metadata.canal`
 * ("app" | "telegram"). Los mismos nombres y la misma forma en la app y en el
 * bot, por lo mismo que el embudo (src/lib/embudo.js): comparar canales y que
 * el analista lea una sola cosa.
 *
 * Nada de texto de la persona aquí: ids de receta, días, comidas y motivos.
 */
export const RASTRO = {
  // Un plato quitado y otro puesto. metadata: day, meal, course, groupId,
  // oldRecipeId, newRecipeId, motivo (MOTIVO_CAMBIO).
  PLATO_CAMBIADO: "dish_replaced",
  // Un menú generado. metadata: weekStart, weekEnd, slots, pedidos.
  MENU_GENERADO: "menu_generated",
  // Se ofrecieron opciones y eligieron una (o «Elige tú»). metadata: day,
  // meal, ofrecidas[ids], elegida (id | null), eligeTu.
  OPCION_ELEGIDA: "option_chosen",
  // Marcado como cocinado. metadata: recipeId, day, meal, menuId.
  COCINADO: "dish_cooked",
  // Una receta que entra en el recetario de la casa. metadata: recipeId,
  // origen (ORIGEN_RECETA), baseDishId.
  RECETA_GUARDADA: "recipe_saved",
  // Alguien abre una receta o un menú que le han pasado. metadata: tipo.
  COMPARTIDO_RECIBIDO: "share_received",
  // Tachado o desmarcado en la compra. metadata: n, estado.
  COMPRA_MARCADA: "shopping_marked",
};

/** Por qué cambió un plato: lo que el analista separa (un gusto no es un «lo que sea»). */
export const MOTIVO_CAMBIO = {
  PEDIDO: "pedido",            // dijeron qué plato querían
  ELECCION: "eleccion",        // eligieron una de las opciones ofrecidas
  ELIGE_TU: "elige_tu",        // «elige tú», «me da igual»
  OTRO: "otro",                // «cámbialo» sin más (lo elige el motor)
  MANUAL: "manual",            // en la app, desde el catálogo
};

export const ORIGEN_RECETA = {
  CREADA_APP: "creada_app",
  CREADA_BOT: "creada_bot",
  COPIADA_GENTE: "copiada_gente",
  RECIBIDA_ENLACE: "recibida_enlace",
  VARIANTE: "variante",
};

export const PANTALLA_RASTRO = "menu";

/** El id de catálogo sin el prefijo de grupo («g1__carnes_146» → «carnes_146»). */
export const idBase = (id) => (id ? String(id).split("__").pop() : null);
