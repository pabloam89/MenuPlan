// Coste por ración de una receta, con precios de Mercadona (public/store/
// mercadona.json, sincronizado cada semana por scripts/mercadona-sync.mjs).
//
// Precio POR KILO o POR LITRO (bulkPrice), no por paquete: para saber lo que
// cuesta un plato, 30 ml de aceite son 30 ml, no la botella entera. Es el
// operador del modo 'granel' de lib/coste.js, que es por donde se lee; el modo
// 'paquetes' (la lista de la compra) redondea al envase y vive en listPricing.js.
//
// Honesto con lo que no sabe: una línea sin gramos (al gusto, un «pellizco»)
// o sin producto emparejado con confianza no suma ni resta, y queda contada en
// `cobertura`. Quien lea el coste decide si una cobertura baja le vale.

import { gramsForRecipeQuantity, gramsPerPiece } from "../kitchenUnits.js";
import { matchProductForIngredient } from "../productMatcher.js";
import { productoDeLinea } from "../productoDeLinea.js";

// El producto sale del mismo sitio que en la lista de la compra: la decisión
// guardada en productoPorIngrediente.json, y el emparejador por nombre solo para
// lo que no tiene fila (recetas de la familia escritas a mano). Antes aquí había
// una cadena propia —nombre, nombre canónico, nombre sin adjetivos de cocina—
// que podía elegir otro producto que la compra para el mismo ingrediente.
function emparejar(nombre, productos, match) {
  const r = productoDeLinea(nombre, productos, { emparejar: match });
  return r.product ? r : null;
}
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** € de una línea, o null si no se puede saber. */
export function costeDeLinea(linea, productos, match = matchProductForIngredient) {
  const nombre = linea?.name;
  const cantidad = num(linea?.amount ?? linea?.qty);
  if (!nombre || cantidad == null || cantidad <= 0) return null;
  const encontrado = emparejar(nombre, productos, match);
  const p = encontrado?.product;
  const granel = num(p?.bulkPrice);
  if (!p || granel == null || granel <= 0) return null;
  const formato = String(p.unitFormat ?? "").toLowerCase();

  // El SKU se vende por pieza: €/ud.
  if (formato === "ud" || formato === "unidad" || formato === "unidades") {
    if (linea.unit === "ud") return { euros: cantidad * granel, producto: p.name };
    const gramos = gramsForRecipeQuantity(nombre, cantidad, linea.unit);
    const porPieza = gramsPerPiece(String(nombre).toLowerCase());
    return gramos != null && porPieza ? { euros: (gramos / porPieza) * granel, producto: p.name } : null;
  }
  // Por masa o volumen: €/kg o €/l. Los gramos ya llevan la densidad.
  if (["kg", "g", "l", "ml"].includes(formato)) {
    const gramos = gramsForRecipeQuantity(nombre, cantidad, linea.unit);
    return gramos != null ? { euros: (gramos / 1000) * granel, producto: p.name } : null;
  }
  return null;
}

/**
 * @returns {{ porRacion: number|null, total: number, cobertura: number,
 *   lineas: number, conPrecio: number, sinPrecio: string[] }}
 */
export function costeDeReceta(receta, productos, match = matchProductForIngredient) {
  const lineas = (receta?.ingredients ?? []).filter((l) => num(l.amount ?? l.qty) > 0);
  let total = 0;
  let conPrecio = 0;
  const sinPrecio = [];
  for (const l of lineas) {
    const c = costeDeLinea(l, productos, match);
    if (c) { total += c.euros; conPrecio++; } else sinPrecio.push(l.name);
  }
  const raciones = num(receta?.baseServings) || 4;
  const cobertura = lineas.length ? conPrecio / lineas.length : 0;
  return {
    porRacion: conPrecio ? +(total / raciones).toFixed(2) : null,
    total: +total.toFixed(2),
    cobertura: +cobertura.toFixed(3),
    lineas: lineas.length,
    conPrecio,
    sinPrecio,
  };
}
