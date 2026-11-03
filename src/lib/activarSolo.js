/**
 * El menú de la semana se activa solo (sin el botón del rayo).
 *
 * Activar a mano (el rayo) marca el menú (`activatedAt`), devuelve a la
 * despensa TODO lo que descontaron los otros menús activados (lo de generar, lo
 * del día y lo cocinado: `reconcileMenusRemoval`) y, en el modo «al generar»,
 * descuenta lo que usa este (App.jsx, `activateActiveMenu`).
 *
 * Activar solo (`devolucionAlActivar`) deja también un solo menú descontando,
 * pero de los anteriores solo devuelve lo previsto al generar: lo cocinado y lo
 * del día ya se gastó. Un menú que alguien desactivó a mano (`desactivadoAt`)
 * no se vuelve a activar solo.
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
  // Lo desactivó alguien a propósito: activarlo solo desharía su decisión.
  if (menu.desactivadoAt != null) return null;
  return id;
}

/**
 * Pura. Lo que se devuelve a la despensa al activar, y cómo quedan los cubos de
 * descuentos de los otros menús activados.
 *
 * A mano (el rayo, `automatica: false`): todo lo de los otros, con `reconcile`
 * (`reconcileMenusRemoval`), como siempre.
 *
 * Solo (`automatica: true`): los otros menús también dejan de contar (sus cubos
 * salen, así solo hay un menú descontando), pero a la despensa solo vuelve lo
 * que se descontó al GENERAR (una previsión de la semana, que no se llegó a
 * usar entera). Lo del día y lo cocinado no vuelve: eso se gastó de verdad, y
 * devolverlo llenaría «En casa» de comida que ya no está.
 */
export function devolucionAlActivar(data, otrosActivados, { automatica, reconcile }) {
  if (!automatica) return reconcile(data, otrosActivados);
  const soloGenerar = reconcile(
    { pantryGenDeltas: data?.pantryGenDeltas ?? {}, pantryDayDeltas: {}, cookedDeltas: {} },
    otrosActivados,
  );
  const sinLoGastado = reconcile(
    { pantryGenDeltas: {}, pantryDayDeltas: data?.pantryDayDeltas ?? {}, cookedDeltas: data?.cookedDeltas ?? {} },
    otrosActivados,
  );
  return {
    deltas: soloGenerar.deltas,
    genOut: soloGenerar.genOut,
    dayOut: sinLoGastado.dayOut,
    cookedOut: sinLoGastado.cookedOut,
  };
}
