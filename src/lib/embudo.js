/**
 * Los nombres del embudo de alta, compartidos por la app y el bot.
 *
 * Se escriben en `user_events` con `screen = "funnel"` y `metadata.canal`
 * ("app" | "telegram" | "whatsapp"). Un solo sitio para los nombres porque
 * comparar canales es el motivo de medir: si la app dijera "first_menu" y el
 * bot "primer_menu", la pregunta de si el chat convierte mejor no se podría
 * contestar con una consulta.
 *
 * Arranque, cimientos y primer menú los emiten los dos canales. Enlace (cuenta
 * y chat unidos) y segunda semana, de momento solo el bot. Familia y alergias
 * son pasos del alta de la app que el bot no tiene como tales.
 */
export const EMBUDO = {
  ARRANQUE: "funnel_start",
  ENLACE: "funnel_linked",
  CIMIENTOS: "funnel_foundations_done",
  PRIMER_MENU: "funnel_first_menu",
  SEGUNDA_SEMANA: "funnel_week2_return",
  // Solo app: los pasos del alta.
  FAMILIA: "funnel_members_done",
  ALERGIAS: "funnel_allergies_done",
};

export const PANTALLA_EMBUDO = "funnel";
