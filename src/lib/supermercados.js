/**
 * Los supermercados que la casa puede decir que usa (`data.supermarkets`), en
 * un solo sitio: los pinta la app (SpendPanel.jsx, con su chapa de color) y
 * los apunta Lola (ajustar_compra). Sin dependencias, para que el bot lo
 * importe sin arrastrar el JSX.
 *
 * Solo Mercadona tiene hoy catálogo de precios (storeCatalog.js): con él, la
 * lista de la compra de la app enseña la chapa y lo que costará cada cosa.
 */
export const SUPERMERCADOS = [
  "Mercadona", "Lidl", "Alcampo", "Carrefour", "Dia", "Aldi", "Eroski", "Consum", "Hipercor",
  "Supercor", "El Corte Inglés", "Bonpreu", "Gadis", "Ahorramás", "Froiz", "Deza", "Alimerka",
];

/** Los que tienen precios en la app. */
export const CON_PRECIOS = ["Mercadona"];

const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** El nombre de la lista que corresponde a lo dicho («mercadona», «el corte ingles»), o null. */
export function supermercadoDe(texto) {
  const q = plano(texto);
  if (!q) return null;
  return SUPERMERCADOS.find((s) => plano(s) === q) ?? null;
}
