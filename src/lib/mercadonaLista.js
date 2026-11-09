/**
 * Lógica pura del prototipo que rellena una lista en la cuenta de Mercadona:
 * valida lo que se va a mandar y compara lo mandado con lo que quedó guardado.
 */

/** El pedido mínimo de Mercadona para que lo lleven a casa, en euros (Pablo, 8 nov 2026). Lo leen la app (Comprar no
 * se pulsa por debajo) y el trabajador (no tramita por debajo): aquí porque el contenedor del trabajador lleva este fichero. */
export const PEDIDO_MINIMO_MERCADONA = 60;

/** Tope de líneas del prototipo: una compra grande de una familia cabe de sobra. */
const MAX_LINEAS = 80;
/** Tope del nombre: sobra para «Compra HoMenu» y frena un texto enorme. */
const MAX_NOMBRE = 80;

/**
 * @param {{ name?: string, products?: { merca_code: string, quantity: number }[] }} lista
 * @returns {string[]} errores; vacío si se puede mandar
 */
export function erroresDeLista(lista) {
  const errores = [];
  if (typeof lista?.name !== "string" || !lista.name.trim()) errores.push("la lista no tiene nombre");
  else if (lista.name.length > MAX_NOMBRE) errores.push(`nombre de más de ${MAX_NOMBRE} letras`);
  const productos = lista?.products;
  if (!Array.isArray(productos) || productos.length === 0) {
    errores.push("la lista no tiene productos");
    return errores;
  }
  if (productos.length > MAX_LINEAS) errores.push(`más de ${MAX_LINEAS} líneas`);
  for (const p of productos) {
    const codigoBueno = ["string", "number"].includes(typeof p?.merca_code) && /^\d+(\.\d+)?$/.test(String(p.merca_code));
    if (!codigoBueno) errores.push(`código raro: ${p?.merca_code}`);
    if (!Number.isInteger(p?.quantity) || p.quantity < 1 || p.quantity > 24) {
      errores.push(`cantidad rara: ${p?.merca_code}`);
    }
  }
  return errores;
}

/**
 * Los productos de la lista guardada. Su respuesta no trae la cantidad de cada
 * uno (`products_quantity` cuenta productos distintos), así que aquí no se
 * comprueba. Otra forma lanza: no es «lista vacía».
 * @returns {string[]} códigos
 */
export function leerGuardada(respuesta) {
  const productos = respuesta?.products;
  if (!Array.isArray(productos) || productos.some((p) => p?.id == null)) {
    throw new Error("la lista guardada no tiene la forma esperada");
  }
  return productos.map((p) => String(p.id));
}

/**
 * @param {{ merca_code: string }[]} enviados
 * @param {string[]} codigos los de la lista guardada
 * @returns {{ entraron: number, faltan: string[] }}
 */
export function compararLista(enviados, codigos) {
  const guardados = new Set(codigos);
  const faltan = enviados.map((e) => String(e.merca_code)).filter((c) => !guardados.has(c));
  return { entraron: enviados.length - faltan.length, faltan };
}
