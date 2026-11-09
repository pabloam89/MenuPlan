/**
 * Euros para leer: «64,10 €». Un solo sitio para la receta; aparte de priceHistory.js (que la reexporta) porque aquel
 * arrastra el recetario entero, y el servidor de Mercadona y el trabajador solo necesitan esto.
 */
export function formatEuro(n) {
  const v = Number(n) || 0;
  return `${v.toFixed(2).replace(".", ",")} €`;
}
