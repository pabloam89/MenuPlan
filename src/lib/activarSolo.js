/**
 * El menú de la semana se activa solo (sin el botón del rayo).
 *
 * Activar a mano (el rayo) marca el menú (`activatedAt`), devuelve a la
 * despensa TODO lo que descontaron los otros menús activados (lo de generar, lo
 * del día y lo cocinado: `reconcileMenusRemoval`) y, en el modo «al generar»,
 * descuenta lo que usa este (App.jsx, `activateActiveMenu`).
 *
 * Activar solo NO devuelve lo de los otros menús (`devolucionAlActivar`): el
 * menú nuevo suele ser el de la semana siguiente, y lo cocinado con el anterior
 * ya se comió; devolverlo llenaría «En casa» de comida que no está. Solo marca
 * este menú y, en el modo «al generar», descuenta lo suyo.
 *
 * Antes había que pulsar un rayo que nadie entendía, y un menú sin activar no
 * descontaba nada. El menú activo solo cambia al crear uno (generar, pizarra en
 * blanco, repetir) o al llegar de la nube; mirar uno guardado no lo cambia. Por
 * eso activarlo al aparecer es lo que la familia ya esperaba.
 *
 * Solo con la casa ya llegada de la nube: activar con la copia local vieja
 * podría activar un menú que en la nube ya está activado y descontar dos veces.
 */

/**
 * Pura. ¿Hay que activar ya el menú activo? Devuelve su id o null.
 * @param {{ data: object, conCuenta: boolean, soloLectura: boolean, nubeLista: boolean }} p
 */
export function menuPorActivar({ data, conCuenta, soloLectura, nubeLista }) {
  if (!conCuenta || soloLectura || !nubeLista) return null;
  const id = data?.activeMenuId;
  const menu = id ? data?.menus?.[id] : null;
  if (!menu || menu.activatedAt != null) return null;
  return id;
}

/**
 * Pura. Lo que se devuelve a la despensa al activar, y cómo quedan los cubos de
 * descuentos. A mano (`automatica: false`): lo de todos los otros menús
 * activados, con `reconcile` (`reconcileMenusRemoval`). Solo: nada, y los cubos
 * quedan como están.
 */
export function devolucionAlActivar(data, otrosActivados, { automatica, reconcile }) {
  if (!automatica) return reconcile(data, otrosActivados);
  return {
    deltas: [],
    genOut: data?.pantryGenDeltas ?? {},
    dayOut: data?.pantryDayDeltas ?? {},
    cookedOut: data?.cookedDeltas ?? {},
  };
}
