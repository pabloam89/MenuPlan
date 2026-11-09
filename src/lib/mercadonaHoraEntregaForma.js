/**
 * La forma de una hora de entrega de Mercadona y cuántas se guardan (0134), sin dependencias: la usan el servidor
 * (mercadonaHoraEntrega.js, que la reexporta) y el trabajador, cuyo contenedor solo lleva lo suyo.
 */

/** Lo que admite la 0134 en `horas_entrega`: de 1 a 4. El trabajador ofrece como mucho estas. */
export const TOPE_HORAS_ENTREGA = 4;

/** Pura. ¿Tiene forma de hora de entrega de Mercadona? Un id y dos fechas que se leen, la de fin después de la de inicio. */
export function esHoraEntrega(f) {
  if (!f || typeof f !== "object" || Array.isArray(f) || f.id == null || String(f.id) === "") return false;
  const desde = new Date(f.start).getTime();
  const hasta = new Date(f.end).getTime();
  return Number.isFinite(desde) && Number.isFinite(hasta) && hasta > desde;
}
