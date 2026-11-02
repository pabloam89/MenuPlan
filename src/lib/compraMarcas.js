/**
 * La compra es derivada más marcas (trozo 18 de #1037): la lista sale del menú
 * al leerla (buildShoppingList) y de una semana solo se guardan las marcas de la
 * familia: comprado, en casa, añadido a mano y quitado. Antes se guardaba la
 * lista entera, cambiar un plato tenía que volver a copiar las marcas (cinco
 * copias en la app, una en Lola) y lo apuntado a mano acababa en dos listas (#958 E).
 *
 * Forma guardada: `{ marcas: [{ id, nombre, unidad, marcas: MARCAS_COMPRA[], ...lo de un añadido }] }`,
 * con `id` el del artículo derivado (el de buildShoppingList) o el `manual:…` de un añadido.
 * La forma de antes (`{ items }`) se lee tal cual hasta que se vuelve a guardar. Puro.
 */
import { MARCA_COMPRA } from "./vocabularios.js";
import { articuloAMano, idDeArticulo } from "./compraIdentidad.js";

const { ANADIDO, COMPRADO, EN_CASA, QUITADO } = MARCA_COMPRA;

/** Si lo guardado ya es de marcas (y no la lista entera de antes). */
export const esCompraConMarcas = (guardada) => Array.isArray(guardada?.marcas);

// Lo que un añadido a mano necesita para pintarse sin derivarse de nada.
const CAMPOS_ANADIDO = ["category", "qty", "displayQty"];

/**
 * Las marcas de una lista que se ve (`items`, con have / atHome / manual)
 * frente a la que sale del menú (`derivados`): lo que está en la derivada y no
 * en la vista, se quitó. Lo que no lleva ninguna marca no se guarda.
 */
export function marcasDe(items, derivados) {
  const vistos = new Set((items ?? []).map(idDeArticulo));
  const marcas = [];
  for (const it of items ?? []) {
    if (!it?.name && !it?.id) continue;
    const suyas = [];
    if (it.manual) suyas.push(ANADIDO);
    if (it.have) suyas.push(COMPRADO);
    if (it.atHome) suyas.push(EN_CASA);
    if (!suyas.length) continue;
    const m = { id: idDeArticulo(it), nombre: it.name, unidad: it.unit ?? "", marcas: suyas };
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
    lista.push(articuloAMano({ id: m.id, name: m.nombre, unit: m.unidad ?? "", have: tiene(m, COMPRADO), atHome: tiene(m, EN_CASA) }, extra));
  }
  return lista;
}

/**
 * Lo que se ve de una compra guardada: con marcas, la derivada con ellas
 * encima; con la forma de antes (`{ items }`), esa lista tal cual. `derivar`
 * solo se llama si hace falta (cuesta recorrer el menú). Con marcas, las que no
 * se ven (lo quitado, y lo comprado o en casa de algo que el menú de ahora no
 * pide, o que aún no se puede derivar) viajan aparte (`aparte`), para volver a
 * guardarlas: tocar la lista no borra una marca que no se ve.
 */
export function compraQueSeVe(guardada, derivar) {
  if (!esCompraConMarcas(guardada)) return { items: guardada?.items ?? [] };
  const items = listaConMarcas(derivar(), guardada);
  const vistos = new Set(items.map((it) => it.id));
  return { items, aparte: guardada.marcas.filter((m) => !vistos.has(m.id)) };
}

/**
 * Lo que se guarda de la compra que se ve: sus marcas (marcasDe frente a
 * `derivados`, si se tienen) más las que viajaban aparte y no han vuelto a la
 * lista. Si ya son marcas, tal cual.
 */
export function compraParaGuardar(vista, derivados = []) {
  if (esCompraConMarcas(vista)) return vista;
  const { marcas } = marcasDe(vista?.items, derivados);
  const ya = new Set([...marcas.map((m) => m.id), ...(vista?.items ?? []).map(idDeArticulo)]);
  for (const m of vista?.aparte ?? []) if (!ya.has(m.id)) marcas.push(m);
  return { marcas };
}

/**
 * Un cambio sobre la lista que se ve, hecho sobre lo guardado: `cambio` es la
 * vista nueva o una función de la vista de ahora a la nueva (como un setState),
 * `verla` saca la vista de lo guardado. Devuelve lo que se guarda: marcas.
 */
export function cambiarCompra(guardada, cambio, verla) {
  return compraParaGuardar(typeof cambio === "function" ? cambio(verla(guardada)) : cambio);
}

/** Los artículos derivados de una lista de buildShoppingList: los del súper y los que cubre la despensa. */
export const articulosDe = (lista) => [...(lista?.byCategory ?? []).flatMap((c) => c.items), ...(lista?.pantryItems ?? [])];
