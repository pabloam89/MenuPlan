/**
 * La compra es derivada más marcas (plan fichas con estado, trozo 18).
 *
 * La lista sale del menú cada vez que se lee (buildShoppingList, con la
 * despensa); lo único que se guarda de una semana son las marcas de la familia
 * sobre esa lista: lo comprado, lo que hay en casa, lo apuntado a mano y lo
 * quitado. Antes se guardaba la lista entera con las marcas dentro, y cambiar
 * un plato rehacía la lista y tenía que volver a copiar las marcas (cinco
 * copias de esa regla en la app, una en Lola), lo apuntado a mano acababa en
 * dos listas (#958 E) y quitar algo se deshacía al regenerar.
 *
 * Forma guardada (`user_menu_weeks.shopping` y la copia viva de la casa):
 *   { marcas: [{ id, nombre, unidad, marcas: MARCAS_COMPRA[], ...lo de un añadido }] }
 * `id` es el del artículo derivado (normalizeIngredientKey de nombre y unidad,
 * el mismo que le pone buildShoppingList), o el `manual:…` de un añadido.
 *
 * Fuera, a propósito: Mercadona y los precios (no cambian), y la lista con
 * forma vieja (`{ items }`): se lee tal cual hasta que se vuelva a guardar.
 * Puro: sin base ni red.
 */
import { MARCA_COMPRA } from "./vocabularios.js";

const { ANADIDO, COMPRADO, EN_CASA, QUITADO } = MARCA_COMPRA;

/** Si lo guardado ya es de marcas (y no la lista entera de antes). */
export const esCompraConMarcas = (guardada) => Array.isArray(guardada?.marcas);

// Lo que un añadido a mano necesita para pintarse sin derivarse de nada.
const CAMPOS_ANADIDO = ["category", "qty", "displayQty"];

/**
 * Las marcas de una lista que se ve (`items`, con have / atHome / manual)
 * frente a la que sale del menú (`derivados`): lo que está en la derivada y no
 * en la vista, se quitó. Lo que no lleva ninguna marca no se guarda.
 * @param {object[]} items la lista tal como la tiene la app o Lola
 * @param {object[]} derivados la lista que sale del menú y la despensa
 * @returns {{ marcas: object[] }}
 */
export function marcasDe(items, derivados) {
  const vistos = new Set((items ?? []).map((it) => it?.id));
  const marcas = [];
  for (const it of items ?? []) {
    if (!it?.id) continue;
    const suyas = [];
    if (it.manual) suyas.push(ANADIDO);
    if (it.have) suyas.push(COMPRADO);
    if (it.atHome) suyas.push(EN_CASA);
    if (!suyas.length) continue;
    const m = { id: it.id, nombre: it.name, unidad: it.unit ?? "", marcas: suyas };
    if (it.manual) for (const c of CAMPOS_ANADIDO) if (it[c] != null) m[c] = it[c];
    marcas.push(m);
  }
  for (const d of derivados ?? []) {
    if (d?.id && !vistos.has(d.id)) marcas.push({ id: d.id, nombre: d.name, unidad: d.unit ?? "", marcas: [QUITADO] });
  }
  return { marcas };
}

/**
 * La lista que se ve: la derivada del menú con las marcas guardadas encima.
 * Lo quitado no sale; lo comprado o en casa sale marcado; lo añadido a mano va
 * al final (si el menú ya pide lo mismo, el añadido no se repite: la marca va
 * al derivado). Una marca de algo que el menú ya no pide se olvida, salvo los
 * añadidos, que no dependen del menú.
 * @param {object[]} derivados
 * @param {{ marcas?: object[] } | null | undefined} guardada
 * @returns {object[]}
 */
export function listaConMarcas(derivados, guardada) {
  const porId = new Map((guardada?.marcas ?? []).map((m) => [m.id, m]));
  const tiene = (m, marca) => Boolean(m?.marcas?.includes(marca));
  const lista = [];
  const usados = new Set();
  for (const d of derivados ?? []) {
    const m = porId.get(d.id);
    if (m) usados.add(d.id);
    if (tiene(m, QUITADO)) continue;
    lista.push(m ? { ...d, have: Boolean(d.have) || tiene(m, COMPRADO), atHome: Boolean(d.atHome) || tiene(m, EN_CASA) } : d);
  }
  for (const m of guardada?.marcas ?? []) {
    if (usados.has(m.id) || !tiene(m, ANADIDO)) continue;
    const extra = Object.fromEntries(CAMPOS_ANADIDO.filter((c) => m[c] != null).map((c) => [c, m[c]]));
    lista.push({
      category: "Otros", qty: null, displayQty: "", sources: [], adapted: false, ...extra,
      id: m.id, name: m.nombre, unit: m.unidad ?? "", manual: true,
      have: tiene(m, COMPRADO), atHome: tiene(m, EN_CASA),
    });
  }
  return lista;
}

/**
 * Lo que se ve de una compra guardada: con marcas, la derivada con ellas
 * encima; con la forma de antes (`{ items }`), esa lista tal cual. `derivar`
 * solo se llama si hace falta (cuesta recorrer el menú).
 * @param {object | null | undefined} guardada
 * @param {() => object[]} derivar
 * @returns {{ items: object[] }}
 */
export function compraQueSeVe(guardada, derivar) {
  if (esCompraConMarcas(guardada)) return { items: listaConMarcas(derivar(), guardada) };
  return { items: guardada?.items ?? [] };
}

/** Los artículos derivados de una lista de buildShoppingList: los del súper y los que cubre la despensa. */
export const articulosDe = (lista) => [...(lista?.byCategory ?? []).flatMap((c) => c.items), ...(lista?.pantryItems ?? [])];
