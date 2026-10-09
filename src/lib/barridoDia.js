// El barrido del día (modo de consumo «al acabar el día»): por cada día
// pendiente, lee la despensa, mira qué gasta ese día y lo descuenta. Un día
// queda «barrido» cuando su entrada aparece en el resultado.
//
// Si la despensa no se pudo leer (#317), ese día NO se devuelve: no se sabe
// qué gastar, y marcarlo como barrido (como se hacía con la despensa «vacía»
// que devolvía la carga fallida) lo dejaba sin descontar para siempre. Se
// reintenta en el siguiente barrido.

/**
 * @param {{
 *   dias: { dayISO: string, dayPlan: object }[],
 *   cargar: () => Promise<{ data: object[]|null, error: object|null }>,
 *   usados: (dayPlan: object, stock: object[]) => object[],
 *   consumir: (usados: object[], stock: object[]) => Promise<{ deltas: object[] }>,
 * }} args
 * @returns {Promise<Record<string, object[]>>} dayISO → deltas de los días barridos
 */
export async function barrerDias({ dias, cargar, usados, consumir }) {
  const barridos = {};
  for (const { dayISO, dayPlan } of dias) {
    const carga = await cargar();
    if (!carga || carga.error || !Array.isArray(carga.data)) continue;
    const stock = carga.data;
    const used = usados(dayPlan, stock);
    // Un día que no gasta nada también queda barrido.
    if (!used.length) {
      barridos[dayISO] = [];
      continue;
    }
    const { deltas } = await consumir(used, stock);
    barridos[dayISO] = deltas;
  }
  return barridos;
}
