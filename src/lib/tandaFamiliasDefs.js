/**
 * Qué familias existen en la sesión de tandas, aparte de las bases.
 *
 * Vive separado de `tandaFamilias.js` porque ESO importa el catálogo entero
 * para repartir las recetas, y la libreta solo necesita saber qué ids son
 * legales. Sin el corte, `notepadFields.js` —que lo importa todo el mundo—
 * arrastraría `recipeCatalog.js` y su await de Supabase detrás.
 *
 * El orden de los cortes MANDA: gana el primero que encaja. Por eso los
 * rellenos rebozados van antes que las verduras rellenas, y las cremas frías
 * antes que las cremas.
 */

/** Platos que se dejan a medio hacer. El corte por receta vive en `adelanto`. */
export const SEMI = [
  { id: "croquetas-crudas", etiqueta: "Croquetas", re: /croqueta/i },
  { id: "bunuelos-masa", etiqueta: "Buñuelos", re: /buñuelo/i },
  { id: "falafel-crudo", etiqueta: "Falafel", re: /falafel/i },
  { id: "empanadillas-cerradas", etiqueta: "Empanadillas", re: /empanadilla|gyoza/i },
  { id: "empanada-montada", etiqueta: "Empanada", re: /\bempanada\b/i },
  { id: "lasana-montada", etiqueta: "Lasaña y canelones", re: /lasaña|canelon/i },
  { id: "ravioli-cortados", etiqueta: "Pasta rellena", re: /ravioli|tortellini/i },
  { id: "quiche-sin-hornear", etiqueta: "Quiche", re: /quiche|tarta salada/i },
  { id: "pastel-al-horno", etiqueta: "Pasteles al horno", re: /pastel de|shepherd|moussaka/i },
  { id: "huevos-rellenos", etiqueta: "Huevos rellenos", re: /huevos rellenos/i },
  // Antes que el "rellen" genérico de abajo, que si no se los come: lo que
  // define a estos dos no es el relleno, sino que van rebozados y a la sartén.
  { id: "carne-empanada", etiqueta: "Rellenos rebozados", re: /pollo relleno|pechuga|chiles rellenos/i },
  { id: "verduras-rellenas", etiqueta: "Verduras rellenas", re: /rellen/i },
];

/**
 * Ollas que se cocinan del todo y duran varias noches.
 *
 * Los fríos van los primeros a propósito: una crema fría de pepino es un
 * gazpacho en todo lo que importa aquí —no se recalienta, aguanta en la nevera
 * y se sirve tal cual—, y dejarla caer en "cremas" la habría mandado al
 * microondas.
 */
export const COCINADO = [
  { id: "gazpacho", etiqueta: "Gazpachos y fríos", re: /gazpacho|salmorejo|ajoblanco|sopa fría|crema fría/i },
  { id: "caldo-casero", etiqueta: "Caldo", re: /caldo|consomé|consome/i },
  { id: "crema", etiqueta: "Cremas y purés", re: /crema|velouté|veloute|vichyssoise|bisque|puré|pure\b/i },
  { id: "sopa", etiqueta: "Sopas", re: /sopa|chupe|bullabesa/i },
];

/**
 * Lo que NO aguanta la olla, aunque sea una sopa.
 *
 * Una sopa de cebolla se gratina ración a ración y una de ajo lleva huevo
 * escalfado: cocinarlas el domingo no las mejora, las estropea. Es el mismo
 * criterio que decide qué plato se puede dejar a medio hacer, mirando el otro
 * lado.
 */
export const NO_AGUANTA = /gratinad|escalfado|picatostes|grilled cheese|pappa al pomodoro|burrata|fideos|\bpan\b/i;

/** Los ids legales para el campo `tandaPlatos` de la libreta. */
export const CLAVES_PLATO = [...SEMI, ...COCINADO].map((f) => f.id);
