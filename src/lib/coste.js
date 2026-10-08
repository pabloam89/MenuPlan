// El € por ración de una receta, en UN sitio: a GRANEL. Precio por kilo o por
// litro (bulkPrice de Mercadona): 30 ml de aceite son 30 ml, no la botella. No
// depende de cuántos coman ni de los precios que haya apuntado el usuario. Es
// el número para PLANIFICAR y el mismo en todas partes: la ficha del plato,
// «algo barato» de Lola y el nivel económico / medio / caro del planner.
//
// Lo que se paga en caja es OTRA pregunta y vive en otro sitio: el total de la
// lista de la compra (lib/listPricing.js, priceShoppingList) cuenta envases
// enteros, comparte la botella entre los platos de la semana y sí usa los
// precios del usuario (priceObs). Para un plato suelto ese cálculo infla el
// € por ración (una lata entera por 50 g), y por eso no se usa aquí.
//
// `modo` va siempre explícito, aunque hoy solo exista 'granel': quien lee el
// coste dice qué número quiere.
//
// Fuente: derived/recipeCoste.json (npm run build:coste, y cada sync semanal),
// que es este mismo cálculo hecho de antemano para el catálogo. Con `precios`
// se calcula en vivo (recetas de usuario, o el propio build).
//
// Ojo: recipeCatalog.js llama a costeReceta mientras se evalúa. Este módulo no
// puede importar nada que importe recipeCatalog (listPricing → priceHistory sí
// lo hace): lib/coste.test.js lo vigila.

import recipeCoste from "../data/derived/recipeCoste.json" with { type: "json" };
import { costeDeReceta } from "./derive/coste.js";

// Nivel (solo con cobertura suficiente; si no, null: un coste a medias engaña):
// económico < 1 € · medio · caro > 2,5 € por ración. Umbrales cerca de los
// percentiles 33 y 75 del Recetario Estrella a 30 sep 2026.
export const UMBRALES = { economico: 1, caro: 2.5 };
export const COBERTURA_MINIMA = 0.8;

function nivelDeCoste(porRacion, cobertura) {
  if (porRacion == null || !(cobertura >= COBERTURA_MINIMA)) return null;
  if (porRacion < UMBRALES.economico) return "economico";
  if (porRacion > UMBRALES.caro) return "caro";
  return "medio";
}

const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
const euros = (v) => Math.round(v * 100) / 100;

/**
 * Las líneas de la receta para `raciones`. Una línea con `qtyScaled` (la ficha
 * del plato) ya viene escalada a esas raciones; si no, `amount`/`qty` son para
 * `baseServings` (o `servings`, la receta del puente del planner).
 */
function lineasPara(receta, raciones) {
  const base = num(receta?.baseServings) || num(receta?.servings) || 4;
  const factor = raciones > 0 ? raciones / base : 1;
  return (receta?.ingredients ?? []).map((l) => {
    const escalada = Object.hasOwn(l, "qtyScaled");
    const q = escalada ? num(l.qtyScaled ?? l.qty) : num(l.amount ?? l.qty);
    const qty = q == null ? null : escalada || factor === 1 ? q : q * factor;
    return { name: l.name, unit: l.unit, amount: qty };
  });
}

function deTabla(receta) {
  const fila = recipeCoste.recetas?.[receta?.id];
  if (fila?.porRacion != null) return { porRacion: fila.porRacion, cobertura: fila.cobertura, nivel: fila.nivel ?? null };
  // La receta del puente (catalogToFrontendRecipe) trae el número ya leído
  // de la tabla con su id de catálogo.
  if (num(receta?.costeRacion) != null) return { porRacion: receta.costeRacion, cobertura: null, nivel: receta.costeNivel ?? null };
  return null;
}

/**
 * @param {object} receta `{ id?, ingredients, baseServings? }`
 * @param {{ modo: 'granel', raciones?: number, precios?: object[]|null }} opciones
 *   `precios`: los productos de public/store/mercadona.json. Sin ellos se lee
 *   la tabla.
 * @returns {{ modo: string, porRacion: number, total: number|null, cobertura: number|null, nivel: string|null } | null}
 *   null si nada tiene precio: nunca se inventa un coste.
 */
export function costeReceta(receta, { modo, raciones = null, precios = null } = {}) {
  if (modo !== "granel") throw new Error(`coste: modo «${modo}» desconocido (solo 'granel'; el total de caja es priceShoppingList)`);
  const r = num(raciones) > 0 ? num(raciones) : null;

  if (!precios) {
    const t = deTabla(receta);
    if (!t) return null;
    return { modo, ...t, total: r ? euros(t.porRacion * r) : null };
  }
  const n = r ?? (num(receta?.baseServings) || num(receta?.servings) || 4);
  const c = costeDeReceta({ ingredients: lineasPara(receta, n), baseServings: n }, precios);
  if (c.porRacion == null) return null;
  return { modo, porRacion: c.porRacion, total: c.total, cobertura: c.cobertura, nivel: nivelDeCoste(c.porRacion, c.cobertura) };
}
