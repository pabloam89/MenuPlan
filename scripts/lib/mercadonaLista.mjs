/**
 * Lógica pura del prototipo que rellena una lista en la cuenta de Mercadona:
 * valida lo que se va a mandar y compara lo mandado con lo que quedó guardado.
 */

/** Motivos por los que una línea no quedó como se pidió: vocabulario cerrado. */
export const MOTIVO_LINEA = { NO_ENTRO: "no_entro", CANTIDAD_DISTINTA: "cantidad_distinta" };

/** Tope de líneas del prototipo: una compra grande de una familia cabe de sobra. */
const MAX_LINEAS = 80;

/**
 * @param {{ name?: string, products?: { merca_code: string, quantity: number }[] }} lista
 * @returns {string[]} errores; vacío si se puede mandar
 */
export function erroresDeLista(lista) {
  const errores = [];
  if (!lista?.name?.trim()) errores.push("la lista no tiene nombre");
  const productos = lista?.products;
  if (!Array.isArray(productos) || productos.length === 0) {
    errores.push("la lista no tiene productos");
    return errores;
  }
  if (productos.length > MAX_LINEAS) errores.push(`más de ${MAX_LINEAS} líneas`);
  for (const p of productos) {
    if (!/^\d+(\.\d+)?$/.test(String(p?.merca_code ?? ""))) errores.push(`código raro: ${p?.merca_code}`);
    if (!Number.isInteger(p?.quantity) || p.quantity < 1 || p.quantity > 24) {
      errores.push(`cantidad rara: ${p?.merca_code}`);
    }
  }
  return errores;
}

/**
 * Las líneas de la lista guardada, en forma común. La forma exacta de su
 * respuesta no está documentada: se aceptan las variantes más probables.
 */
export function lineasGuardadas(respuesta) {
  const crudas = respuesta?.products ?? respuesta?.items ?? respuesta?.results ?? [];
  return crudas.map((l) => ({
    merca_code: String(l.merca_code ?? l.product?.id ?? l.product_id ?? l.id ?? ""),
    quantity: l.quantity ?? l.recommended_quantity ?? null,
  }));
}

/**
 * @param {{ merca_code: string, quantity: number }[]} enviados
 * @param {{ merca_code: string, quantity: number|null }[]} guardados
 * @returns {{ entraron: number, problemas: { merca_code: string, motivo: string }[] }}
 */
export function compararLista(enviados, guardados) {
  const porCodigo = new Map(guardados.map((g) => [String(g.merca_code), g]));
  const problemas = [];
  let entraron = 0;
  for (const e of enviados) {
    const g = porCodigo.get(String(e.merca_code));
    if (!g) {
      problemas.push({ merca_code: e.merca_code, motivo: MOTIVO_LINEA.NO_ENTRO });
    } else if (g.quantity != null && Number(g.quantity) !== e.quantity) {
      problemas.push({ merca_code: e.merca_code, motivo: MOTIVO_LINEA.CANTIDAD_DISTINTA });
    } else {
      entraron += 1;
    }
  }
  return { entraron, problemas };
}
