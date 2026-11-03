/**
 * Un solo modo de menú: el tablero de la pizarra, venga el menú de donde venga.
 *
 * Hasta noviembre de 2026 solo los menús nacidos en blanco (`origin: "pizarra"`)
 * se manejaban con el tablero; los generados por Lola o por la app salían con
 * otros mandos (la fila del asistente antiguo, el burger, el rayo). La misma
 * semana se tocaba de dos formas según quién la hubiera hecho, y eso despistaba.
 *
 * `origin` sigue guardando de dónde salió el menú: lo usa la hoja de arranque de
 * la pizarra en blanco (`empezarPizarra`, App.jsx), no la pantalla.
 */

/** ¿El menú activo se maneja con el tablero? Siempre que haya menú. */
export function usaTablero(data) {
  return Boolean(data?.menus?.[data?.activeMenuId]);
}
