// El coste de una receta o de un menú, en UN sitio y con el modo dicho en voz
// alta. Hay dos preguntas distintas y cada una tiene su número:
//
//   'granel'   — ¿cuánto cuesta COMERSE este plato? Precio por kilo o por litro
//                (bulkPrice de Mercadona): 30 ml de aceite son 30 ml, no la
//                botella. No depende de cuántos coman ni de lo que haya en la
//                despensa. Es el número para PLANIFICAR: el € por ración de la
//                ficha del plato, «algo barato» del bot, el nivel económico /
//                medio / caro del planner y el presupuesto de la semana.
//   'paquetes' — ¿cuánto voy a pagar en caja? Envases enteros del SKU
//                emparejado (y, si no lo hay, los precios que el usuario apuntó:
//                priceObs). Es el número de la COMPRA: el total de la lista, que
//                comparte la botella entre todos los platos de la semana. Para un
//                plato suelto infla el € por ración (una lata entera por 50 g).
//
// Lo que se enseña al usuario como «€/ración» es siempre 'granel': así la ficha
// dice lo mismo que el bot cuando llama «barato» a un plato.
//
// Fuente del modo granel: derived/recipeCoste.json (npm run build:coste, y cada
// sync:mercadona), que es este mismo cálculo hecho de antemano para el catálogo.
// Con `precios` se calcula en vivo (recetas de usuario, o el propio build).

import recipeCoste from "../data/derived/recipeCoste.json" with { type: "json" };
import { costeDeReceta } from "./derive/coste.js";
import { priceOneItem } from "./listPricing.js";


// Nivel (solo con cobertura suficiente; si no, null: un coste a medias engaña):
// económico < 1 € · medio · caro > 2,5 € por ración. Umbrales cerca de los
// percentiles 33 y 75 del Recetario Estrella a 30 sep 2026.
export const UMBRALES = { economico: 1, caro: 2.5 };
export const COBERTURA_MINIMA = 0.8;

export function nivelDeCoste(porRacion, cobertura) {
  if (porRacion == null || !(cobertura >= COBERTURA_MINIMA)) return null;
  if (porRacion < UMBRALES.economico) return "economico";
  if (porRacion > UMBRALES.caro) return "caro";
  return "medio";
}

// Ojo: recipeCatalog.js llama a costeReceta MIENTRAS se evalúa, y hay un
// ciclo de imports (listPricing → priceHistory → recipeCatalog → aquí). Lo que
// use el modo granel sin `precios` tiene que ser declaración de función (se
// iza), nunca una const: esa aún no existiría.
function num(v) {
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}
function euros(v) {
  return Math.round(v * 100) / 100;
}

function exigirModo(modo) {
  if (modo !== "granel" && modo !== "paquetes") throw new Error(`coste: modo «${modo}» desconocido (granel | paquetes)`);
}

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
    return { id: l.id, name: l.name, unit: l.unit, qty };
  });
}

function granelDeTabla(receta) {
  const fila = recipeCoste.recetas?.[receta?.id];
  if (fila?.porRacion != null) return { porRacion: fila.porRacion, cobertura: fila.cobertura, nivel: fila.nivel ?? null };
  // La receta del puente (catalogToFrontendRecipe) trae el número ya leído
  // de la tabla con su id de catálogo.
  if (num(receta?.costeRacion) != null) return { porRacion: receta.costeRacion, cobertura: null, nivel: receta.costeNivel ?? null };
  return null;
}

/**
 * @param {object} receta `{ id?, ingredients, baseServings? }`
 * @param {{ modo: 'granel'|'paquetes', raciones?: number, precios?: object[]|null, priceObs?: object[] }} opciones
 *   `precios`: los productos del catálogo de Mercadona (public/store/mercadona.json).
 *   'granel' sin `precios` lee la tabla; 'paquetes' los necesita siempre.
 * @returns {{ modo: string, porRacion: number, total: number|null, cobertura: number|null, nivel: string|null } | null}
 *   null si nada tiene precio: nunca se inventa un coste.
 */
export function costeReceta(receta, { modo, raciones = null, precios = null, priceObs = [] } = {}) {
  exigirModo(modo);
  const r = num(raciones) > 0 ? num(raciones) : null;

  if (modo === "granel") {
    if (!precios) {
      const t = granelDeTabla(receta);
      if (!t) return null;
      return { modo, ...t, total: r ? euros(t.porRacion * r) : null };
    }
    const base = num(receta?.baseServings) || num(receta?.servings) || 4;
    const n = r ?? base;
    const c = costeDeReceta(
      { ingredients: lineasPara(receta, n).map((l) => ({ name: l.name, unit: l.unit, amount: l.qty })), baseServings: n },
      precios,
    );
    if (c.porRacion == null) return null;
    return { modo, porRacion: c.porRacion, total: c.total, cobertura: c.cobertura, nivel: nivelDeCoste(c.porRacion, c.cobertura) };
  }

  // paquetes
  if (!r || !precios) return null;
  const lineas = lineasPara(receta, r);
  if (!lineas.length) return null;
  let total = 0;
  let conPrecio = 0;
  for (const l of lineas) {
    const p = priceOneItem(l, precios, priceObs).line.price;
    if (p != null) { total += p; conPrecio++; }
  }
  if (!conPrecio) return null;
  return { modo, porRacion: euros(total / r), total: euros(total), cobertura: conPrecio / lineas.length, nivel: null };
}

/**
 * Coste de un menú: `platos` = [{ receta, raciones }].
 * 'granel' suma lo que se come cada plato; 'paquetes' junta antes las líneas
 * iguales de toda la semana y cuenta envases enteros (una botella de aceite
 * para todos los platos), que es lo que se paga.
 * @returns {{ modo: string, total: number, cobertura: number }}
 */
export function costeMenu(platos, { modo, precios = null, priceObs = [] } = {}) {
  exigirModo(modo);
  const lista = platos ?? [];
  if (modo === "granel") {
    let total = 0;
    let conPrecio = 0;
    for (const { receta, raciones } of lista) {
      const c = costeReceta(receta, { modo, raciones, precios });
      if (c?.total != null) { total += c.total; conPrecio++; }
    }
    return { modo, total: euros(total), cobertura: lista.length ? conPrecio / lista.length : 0 };
  }
  const juntas = new Map();
  for (const { receta, raciones } of lista) {
    for (const l of lineasPara(receta, raciones)) {
      const clave = `${String(l.name).toLowerCase()}|${l.unit ?? "ud"}`;
      const previa = juntas.get(clave);
      if (!previa) juntas.set(clave, { ...l, id: clave });
      else if (l.qty != null) previa.qty = (previa.qty ?? 0) + l.qty;
    }
  }
  let total = 0;
  let conPrecio = 0;
  for (const l of juntas.values()) {
    const p = precios ? priceOneItem(l, precios, priceObs).line.price : null;
    if (p != null) { total += p; conPrecio++; }
  }
  return { modo, total: euros(total), cobertura: juntas.size ? conPrecio / juntas.size : 0 };
}
