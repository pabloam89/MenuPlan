// El barrido del día (modo de consumo «al acabar el día»): por cada día
// pendiente, lee la despensa, mira qué gasta ese día y lo descuenta. Un día
// queda «barrido» cuando su entrada aparece en el resultado.
//
// Si la despensa no se pudo leer (#317), ese día NO se devuelve: no se sabe
// qué gastar, y marcarlo como barrido (como se hacía con la despensa «vacía»
// que devolvía la carga fallida) lo dejaba sin descontar para siempre. Se
// reintenta en el siguiente barrido.

import { diaDeISO, sumarDiasISO } from "./dias.js";

// Ventana única del barrido: solo se barren (y solo se guardan) los días de los
// últimos N días. Las dos cosas DEBEN usar el mismo límite: si se podara la
// marca de un día que todavía es barrible, la siguiente pasada lo volvería a
// descontar una y otra vez.
export const VENTANA_BARRIDO_DIAS = 45;

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Los días ya cerrados y sin barrer, cada uno con su plan recortado a ese día.
 * Las fechas son «AAAA-MM-DD» de la casa. Pura.
 * @param {{
 *   semanas: { startISO?: string, endISO?: string|null, plan?: object }[],
 *   ya: Record<string, unknown>,
 *   desde: string,
 *   hoy: string,
 * }} args  `ya`: las marcas de los días barridos; `desde`: nunca se barre nada anterior
 * @returns {{ dayISO: string, dayPlan: object }[]}
 */
export function diasPorBarrer({ semanas, ya, desde, hoy }) {
  if (!desde) return [];
  const inicio = sumarDiasISO(hoy, -VENTANA_BARRIDO_DIAS);
  const pendientes = [];
  for (const wk of semanas ?? []) {
    if (!wk?.plan || !ES_FECHA.test(wk.startISO ?? "")) continue;
    const fin = wk.endISO ?? sumarDiasISO(wk.startISO, 6);
    for (let dayISO = wk.startISO; dayISO <= fin; dayISO = sumarDiasISO(dayISO, 1)) {
      if (dayISO >= hoy || dayISO < inicio || dayISO < desde || ya?.[dayISO]) continue;
      const dia = diaDeISO(dayISO);
      const dayPlan = {};
      for (const [gid, slots] of Object.entries(wk.plan)) {
        const kept = Object.fromEntries(Object.entries(slots ?? {}).filter(([k]) => k.startsWith(`${dia}-`)));
        if (Object.keys(kept).length) dayPlan[gid] = kept;
      }
      pendientes.push({ dayISO, dayPlan });
    }
  }
  return pendientes;
}

/** Las marcas de días sin las de fuera de la ventana, que tampoco se vuelven a barrer. Pura. */
export function podarMarcas(marcas, hoy) {
  const inicio = sumarDiasISO(hoy, -VENTANA_BARRIDO_DIAS);
  return Object.fromEntries(Object.entries(marcas ?? {}).filter(([k]) => !ES_FECHA.test(k) || k >= inicio));
}

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
