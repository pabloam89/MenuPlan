/**
 * DE QUÉ FAMILIA ES UN PLATO, por masa y no por cajón.
 *
 * Las seis familias —carne, pescado, legumbres, huevos, pasta_arroz, verdura—
 * son las claves de `freqs`: los topes que el motor respeta, el reparto que el
 * panel enseña y el vocabulario de la pista `familia` de la burbuja.
 *
 * ── Por qué existía este fichero antes de existir ─────────────────────────
 *
 * La regla vivía en TRES copias que ya no decían lo mismo:
 *
 *   · `FREQ_KEY_MATCHERS` (utils/validateMenu.js) — el solver y el validador.
 *     Mira `category` o la proteína, y además `mainBase` para pasta_arroz.
 *   · `FAMILIA_POR_CATEGORIA` + `FAMILIA_POR_PROTEINA` (lib/menuRecuento.js) —
 *     el panel y la burbuja. La misma idea SIN `mainBase`, así que un «Pollo
 *     tikka masala» con arroz contaba pasta_arroz para el solver y no para el
 *     panel.
 *   · El prompt del planner (api/_prompts.js) — el modelo.
 *
 * Y las tres compartían el mismo defecto de fondo: son BINARIAS. `mainProtein`
 * vale «cerdo» igual en unos filetes empanados (33 % de la masa del plato) que
 * en una pasta con bacon (12 %), así que las dos contaban como carne. Y
 * `category` mezcla de qué está hecho un plato con qué FORMA tiene:
 * `sopas_cremas` y `ensaladas_verduras` son formato —lo dice el eje 6 del
 * registro, «disfrazado en category»— y sin embargo eran la única fuente de la
 * familia «verdura».
 *
 * ── La regla ──────────────────────────────────────────────────────────────
 *
 * Una familia entra si sus nodos suman al menos `UMBRAL` de la masa servida.
 * Tres consecuencias, y las tres son la gracia:
 *
 *   1. Pueden entrar VARIAS. Un cocido es legumbres y es carne, y gasta las
 *      dos cuotas — que es lo que el prompt del planner ya pedía a mano.
 *   2. La cuota se suma POR FAMILIA, no por nodo. Una cazuela con rape (9 %) y
 *      gambas (9 %) es pescado al 18 %: por nodo no llegaría ninguno.
 *   3. Lo que no llega, no entra. El bacon al 12 % no convierte una pasta en
 *      un plato de carne.
 *
 * Y la categoría no pinta nada: el formato tiene su propio eje.
 */

import { composicionDe } from "./composicion.js";

/** Las seis claves de `freqs`. No hay más y no se inventan aquí. */
export const FAMILIAS = ["carne", "pescado", "legumbres", "huevos", "pasta_arroz", "verdura"];

/**
 * Nodo del vector → familia.
 *
 * `patatas` y `pan` no están, y no es un olvido: la patata gasta presupuesto
 * de guarnición y no convierte el plato en un plato de patatas (eje 45), y el
 * pan de un bocadillo no lo hace pasta. Sus nodos siguen en el vector para
 * quien los quiera; simplemente no producen familia.
 */
export const FAMILIA_POR_NODO = {
  // plano de la proteína
  pollo: "carne", pavo: "carne", cerdo: "carne", ternera: "carne",
  cordero: "carne", pato: "carne", caza: "carne",
  pescado_blanco: "pescado", pescado_azul: "pescado", marisco: "pescado",
  legumbre: "legumbres",
  huevo: "huevos",
  // plano del hidrato — solo las féculas de verdad
  arroz: "pasta_arroz", pasta: "pasta_arroz", quinoa: "pasta_arroz", cuscus: "pasta_arroz",
  // plano de la verdura
  verdura: "verdura",
};

/**
 * Cuánta masa del plato hace falta para que una familia cuente.
 *
 * El 15 % sale de mirar el catálogo entero: la cuota de la proteína dominante
 * tiene mediana 35 % y cuartil inferior 20 %, así que el 15 % deja pasar lo
 * que de verdad estructura el plato y corta lo que solo lo condimenta — las
 * anchoas al 3 % de una pasta con brócoli, el jamón al 6 % de una vichyssoise.
 *
 * No se baja más porque por debajo entra el sabor y no la comida, y no se sube
 * porque al 20 % empiezan a caerse platos que sí son de esa familia.
 */
export const UMBRAL = 0.15;

/**
 * La masa de cada familia, en tanto por uno de la masa servida.
 *
 * Se devuelve entera —no solo las que pasan el umbral— porque el número es la
 * explicación: «esto no cuenta como carne porque el cerdo es el 12 %» es una
 * respuesta, y «no cuenta» a secas no lo es.
 *
 * @returns {Record<string, number>}
 */
export function cuotasDeFamilia(vector) {
  const masa = vector?.masaTotal ?? 0;
  const out = {};
  if (!(masa > 0)) return out;
  for (const plano of [vector.proteina, vector.hidrato, vector.verdura]) {
    for (const [nodo, g] of plano ?? []) {
      const familia = FAMILIA_POR_NODO[nodo];
      if (!familia) continue;
      out[familia] = (out[familia] ?? 0) + g / masa;
    }
  }
  for (const k of Object.keys(out)) out[k] = +out[k].toFixed(4);
  return out;
}

/**
 * Las cinco que ESTRUCTURAN un plato. La verdura no está, y ese es el punto.
 */
const ESTRUCTURAN = ["carne", "pescado", "legumbres", "huevos", "pasta_arroz"];

/**
 * Las familias que pasan el umbral, en el orden de `FAMILIAS`.
 *
 * ── La verdura es el RESIDUO, no una cuota más ────────────────────────────
 *
 * Se probó a tratarla como las otras cinco —entra si llega al 15 % de la
 * masa— y da 529 recetas de 1.033. Eso no es una familia, es «lleva verdura»:
 * entraban el «Fricandó de ternera» y el «Atún encebollado», que llevan un 31 %
 * de hortaliza porque el sofrito pesa. Y no se arregla subiendo el listón,
 * porque la verdura es agua: al 40 % seguían colándose guisos y ya se caían
 * cremas que sí lo son.
 *
 * La pregunta buena no es cuánta verdura lleva, sino si la verdura es el EJE
 * del plato. Y eso se contesta mirando a las otras: si ninguna de las cinco
 * que estructuran llega al umbral, lo que queda en pie es la verdura.
 *
 * Medido: da 151 recetas, y las 58 que dejan de ser verdura respecto de hoy se
 * van todas a su sitio — «Sopa de fideos» a pasta_arroz, «Crema de lentejas» a
 * legumbres, «Sopa de marisco» a pescado. Eran verdura solo porque su
 * `category` era `sopas_cremas`, que es un FORMATO.
 */
export function familiasDesdeCuotas(cuotas, umbral = UMBRAL) {
  const estructurales = ESTRUCTURAN.filter((f) => (cuotas?.[f] ?? 0) >= umbral);
  if (estructurales.length > 0) return estructurales;
  return (cuotas?.verdura ?? 0) >= umbral ? ["verdura"] : [];
}

/**
 * La familia de una receta de catálogo, calculada desde cero.
 *
 * Es la que usa el build para escribir la tabla derivada. En caliente NO se
 * llama a esto: se lee `receta.familias`, que ya viene calculada — recorrer
 * los ingredientes de catorce platos en cada render del panel sería pagar en
 * cada pintada lo que se puede pagar una vez al construir.
 */
export function familiasDeReceta(receta, umbral = UMBRAL) {
  let vector;
  try { vector = composicionDe(receta); } catch { return { familias: [], cuotas: {} }; }
  const cuotas = cuotasDeFamilia(vector);
  return { familias: familiasDesdeCuotas(cuotas, umbral), cuotas };
}
