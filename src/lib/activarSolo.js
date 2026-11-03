/**
 * El menú de la semana se activa solo (sin el botón del rayo).
 *
 * Activar es decir «este es el menú de casa»: lo marca (`activatedAt`), devuelve
 * a la despensa lo que se llevaron otros menús activados antes y, solo en el
 * modo de despensa «al generar», descuenta lo que este usa (App.jsx,
 * `activateActiveMenu`). Con el modo por defecto («al cocinar») no toca la
 * despensa.
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
