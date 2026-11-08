/**
 * Si hay menú para un día, en un vocabulario cerrado: lo leen la ficha del día
 * (lo que ve Lola) y la vía rápida (que contesta sin modelo). Una sola fuente,
 * para que los dos digan lo mismo (#931: con «no hay menú para esta semana» en
 * la ficha, Lola dijo «hoy, 25 de octubre, tenéis judías» el lunes 26).
 *
 * Pura: sin base ni reloj. Las semanas son las del menú activo (cargarCasa).
 */

/**
 *   si       ese día está dentro de una semana del menú
 *   ya_paso  el último día con menú es anterior
 *   despues  hay menú, pero empieza más tarde
 *   ninguno  la casa no tiene ningún menú
 * Un día sin menú dentro del rango (un hueco) cuenta como `despues` si queda
 * menú más adelante, y como `ya_paso` si no.
 */
export const ESTADOS_MENU = ["si", "ya_paso", "despues", "ninguno"];

/**
 * @param {Array<{ weekStart: string, weekEnd: string }>} semanas  AAAA-MM-DD
 * @param {string} dia  AAAA-MM-DD
 * @returns {{ dia: string, estado: string, ultimoDia: string|null, proximoDia: string|null }}
 */
export function estadoDelMenu(semanas = [], dia) {
  const ws = (semanas ?? []).filter((w) => w?.weekStart && w?.weekEnd);
  if (!ws.length) return { dia, estado: "ninguno", ultimoDia: null, proximoDia: null };
  const ultimoDia = ws.map((w) => w.weekEnd).sort().at(-1);
  const futuras = ws.map((w) => w.weekStart).filter((s) => s > dia).sort();
  const proximoDia = futuras[0] ?? null;
  if (ws.some((w) => w.weekStart <= dia && dia <= w.weekEnd)) return { dia, estado: "si", ultimoDia, proximoDia: null };
  return { dia, estado: proximoDia ? "despues" : "ya_paso", ultimoDia, proximoDia };
}

/** La línea tabulada de la ficha del día: campos fijos y valores cerrados. */
export function lineaEstadoMenu({ dia, estado, ultimoDia, proximoDia }) {
  return `ESTADO DEL MENÚ (manda sobre la charla): hoy=${dia} · menu_hoy=${estado} · ultimo_dia_con_menu=${ultimoDia ?? "ninguno"} · proximo_dia_con_menu=${proximoDia ?? "ninguno"}`;
}
