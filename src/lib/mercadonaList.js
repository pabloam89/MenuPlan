/**
 * Lista de la compra → lo que se manda a una lista en la cuenta de Mercadona.
 *
 * Lista y no carrito a propósito: el carrito se sustituye entero y pisaría lo
 * que la persona ya tuviera metido.
 */

import { normalizeName } from "./ingredientCategories.js";

// Lo que sale en la lista de ingredientes pero no se compra: el agua del grifo.
const NO_SE_COMPRA = /^agua\b(?! (?:mineral|con gas)\b)/;

/**
 * @param {{ id: string, name: string }[]} items líneas pendientes de la lista
 * @param {Map<string, { storeProductId?: string, storeProductName?: string, storePacks?: number, storePrice?: number }>} priceMap
 *   el mapa de `priceShoppingList`: solo trae producto quien pasó MATCH_HIGH
 * @param {string} name nombre de la lista en Mercadona
 * @returns {{ lista: { name: string, products: { merca_code: string, quantity: number }[] },
 *   lineas: { id: string, nombre: string, paquetes: number, precio: number }[], total: number, sinProducto: string[] }}
 */
export function listaParaMercadona(items, priceMap, name) {
  const porProducto = new Map();
  const sinProducto = [];
  for (const item of items) {
    if (NO_SE_COMPRA.test(normalizeName(item.name))) continue;
    const m = priceMap.get(item.id);
    if (!m?.storeProductId) {
      sinProducto.push(item.name);
      continue;
    }
    // Dos ingredientes que caen en el mismo producto —«Pimentón» y «Pimentón
    // dulce»— se quedan con el mayor, no con la suma: cada línea ya redondeó
    // a paquete entero, y sumar dos «1 bote» de especia compra dos botes.
    const paquetes = Math.max(1, m.storePacks ?? 1);
    const ya = porProducto.get(m.storeProductId);
    if (ya && ya.paquetes >= paquetes) continue;
    porProducto.set(m.storeProductId, {
      id: m.storeProductId,
      nombre: m.storeProductName ?? item.name,
      paquetes,
      precio: m.storePrice ?? 0,
    });
  }
  const lineas = [...porProducto.values()];
  return {
    lista: { name, products: lineas.map((l) => ({ merca_code: l.id, quantity: l.paquetes })) },
    lineas,
    total: Math.round(lineas.reduce((n, l) => n + l.precio, 0) * 100) / 100,
    sinProducto,
  };
}

/** La ficha del producto en Mercadona; en el móvil, su enlace abre su app. */
export const fichaMercadona = (id) => `https://tienda.mercadona.es/product/${encodeURIComponent(id)}`;
