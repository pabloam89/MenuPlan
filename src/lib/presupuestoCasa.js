// Cómo está el presupuesto semanal de la casa, leído en UN sitio (#958).
//
// Un solo dato, `presupuesto` (€ por semana; null = sin presupuesto), en vez
// del par de antes `hasBudget` + `budget` (trozo 12 de #1037). Vive en su
// sobre (CAMPOS_CASA_CON_SOBRE, estadoDeDato.js; la 0112, aplicada el 2 nov
// 2026). El par de antes se queda sin lector en los documentos que aún lo
// guardan: no se lee ni se borra (sin convivencia). Lo escriben el asistente de la app (Onboarding.jsx)
// y Lola (ajustar_compra, api/_bot/ajustes.js), los dos con conPresupuesto.
// Quien lo enseña o hace cuentas con él lo lee aquí: la ficha del bot
// (api/_bot/ficha.js), lib/presupuesto.js y la pregunta del asistente
// (wizardRegistry.js), para que «mucho» no sea una cifra en un sitio y «sin
// cifra» en otro.
//
// Sin imports a propósito: api/_bot/ lo carga con Node a secas.

// `sin_cifra`: hay presupuesto pero no es un número positivo (0, «mucho»…). No se aplica y SE DICE.
export const ESTADOS_PRESUPUESTO = Object.freeze(["sin", "activo", "sin_cifra"]);

/** Un número mayor que 0 (también escrito como texto), o null. */
export const positivo = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/**
 * Lo guardado: los € (o lo que haya, aunque no sea una cifra), null si la casa
 * dijo que no tiene, o undefined si nadie lo ha dicho. Solo `presupuesto`: el
 * par de antes (`hasBudget`/`budget`) no cuenta.
 */
export function presupuestoGuardado(data) {
  return data?.presupuesto;
}

/** Los datos con el presupuesto puesto (null = sin presupuesto); lo demás, como estaba. */
export function conPresupuesto(data, euros) {
  return { ...(data ?? {}), presupuesto: euros };
}

/**
 * @param {object} data household_state.data
 * @returns {{ estado: "sin"|"activo"|"sin_cifra", euros: number|null }}
 */
export function leerPresupuesto(data) {
  const v = presupuestoGuardado(data);
  if (v == null) return { estado: "sin", euros: null };
  const b = positivo(v);
  return b == null ? { estado: "sin_cifra", euros: null } : { estado: "activo", euros: b };
}

/** La cifra con la que arranca el presupuesto al encenderlo en el asistente (la que traía antes el documento de partida). */
export const PRESUPUESTO_DE_PARTIDA = 80;

/** El interruptor del asistente (Onboarding.jsx): al encender, la cifra que hubiera o la de partida; al apagar, null. */
export function conInterruptor(data, encendido) {
  return conPresupuesto(data, encendido ? (leerPresupuesto(data).euros ?? PRESUPUESTO_DE_PARTIDA) : null);
}

/** Los € por semana que se aplican, o null (sin presupuesto o sin cifra). */
export function presupuestoSemanal(data) {
  return leerPresupuesto(data).euros;
}
