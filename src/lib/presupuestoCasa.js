// Cómo está el presupuesto semanal de la casa, leído en UN sitio (#958).
//
// Un solo dato, `presupuesto` (€ por semana; null = sin presupuesto), en vez
// del par de antes `hasBudget` + `budget` (trozo 12 de #1037). Vive en
// household_state.data; los PR siguientes del trozo lo escriben (el asistente
// de la app, Onboarding.jsx, y Lola, ajustar_compra en api/_bot/ajustes.js) y
// lo pasan a su sobre con la 0112 (CAMPOS_CASA_CON_SOBRE, estadoDeDato.js).
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
 * dijo que no tiene, o undefined si nadie lo ha dicho. Una casa que aún guarda
 * el par de antes en el documento se lee como su presupuesto sin reescribirla:
 * sin el interruptor, null; con él, su `budget` (o 0 si falta, que es
 * «sin_cifra»). Con `presupuesto` en `data` el par no cuenta.
 */
export function presupuestoGuardado(data) {
  if (data?.presupuesto !== undefined) return data.presupuesto;
  if (data?.hasBudget === undefined) return undefined;
  return data.hasBudget ? (data.budget ?? 0) : null;
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

/** Los € por semana que se aplican, o null (sin presupuesto o sin cifra). */
export function presupuestoSemanal(data) {
  return leerPresupuesto(data).euros;
}
