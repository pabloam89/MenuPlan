/**
 * La compra de las semanas de Lola, en la frontera con la base (trozo 18):
 * la semana guarda solo las marcas de la familia (src/lib/compraMarcas.js) y
 * Lola trabaja con la lista que se ve. Al leer la casa, la lista sale del menú
 * y la despensa con las marcas encima; al guardar, de la lista que se ve vuelven
 * a salir las marcas. Las herramientas de la compra (menu.js) no cambian: ven
 * `semana.shopping.items` como siempre.
 *
 * Una semana con la forma de antes (`{ items }`) se lee y se guarda tal cual.
 */
import { esCompraConMarcas, compraQueSeVe, compraParaGuardar, articulosDe } from "../../src/lib/compraMarcas.js";

// menu.js importa casa.js, que importa esto: el motor se pide al usarlo, no al cargar.
const deMenu = () => import("./menu.js");

/**
 * La lista que sale del menú de una semana (sin marcas), con la despensa.
 * @param {object} m el motor (menu.js, motor())
 * @param {object} casa
 * @param {object} semana
 * @param {object[]} despensa
 */
export async function derivadaDe(m, casa, semana, despensa) {
  const { grupos } = await deMenu();
  const gs = grupos({ ...casa, semana });
  return articulosDe(m.buildShoppingList(semana?.plan ?? {}, gs, m.getDayMeals(casa?.state?.data ?? {}), despensa));
}

/**
 * La casa con la compra que se ve en cada semana que guarda marcas; la guardada
 * queda en `semana.compraGuardada`. Si ninguna semana guarda marcas, no carga el
 * motor ni lee la despensa. Muta las semanas de `casa` (recién leídas).
 */
export async function conCompraQueSeVe(casa) {
  const conMarcas = (casa?.semanas ?? []).filter((s) => esCompraConMarcas(s.shopping));
  if (!conMarcas.length) return casa;
  const { motor, leerDespensa } = await deMenu();
  const m = await motor();
  const despensa = await leerDespensa(m, casa.householdId);
  // Sin la despensa, lo que hay en casa saldría por comprar: la casa no se lee (como con la familia).
  if (despensa == null) throw new Error("no he podido leer la despensa, y sin ella no sé qué falta comprar");
  for (const s of conMarcas) {
    const derivada = await derivadaDe(m, casa, s, despensa);
    s.compraGuardada = s.shopping;
    s.shopping = compraQueSeVe(s.shopping, () => derivada);
  }
  return casa;
}

/**
 * Lo que se guarda de la compra de `semana` (los cambios de una herramienta)
 * sobre la semana leída: si esa semana guardaba marcas, las marcas de la lista
 * que se ve, frente a la que sale del plan que se guarda; si no, la lista tal
 * cual. Sin compra en los cambios, los cambios tal cual.
 */
export async function semanaParaGuardar(casa, semana) {
  if (!semana?.shopping || !esCompraConMarcas(casa?.semana?.compraGuardada)) return semana;
  const { motor } = await deMenu();
  const m = await motor();
  const plan = semana.plan ?? casa.semana.plan;
  // Sin despensa a propósito: solo cuentan los ids de lo que pide el menú (lo quitado), y la despensa no los cambia.
  const derivada = await derivadaDe(m, casa, { ...casa.semana, plan }, []);
  return { ...semana, shopping: compraParaGuardar(semana.shopping, derivada) };
}
