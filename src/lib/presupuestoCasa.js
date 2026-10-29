// Cómo está el presupuesto semanal de la casa, leído en UN sitio (#958).
//
// El dato vive en household_state.data: `hasBudget` (si hay tope) y `budget`
// (€ por semana). Lo escriben el asistente de la app (wizardRegistry.js,
// Onboarding.jsx) y Lola (ajustar_compra, api/_bot/ajustes.js). Quien lo
// enseña o hace cuentas con él lo lee aquí: la ficha del bot
// (api/_bot/ficha.js) y lib/presupuesto.js, para que «mucho» no sea una cifra
// en un sitio y «sin cifra» en otro.
//
// Sin imports a propósito: api/_bot/ lo carga con Node a secas.

// `sin_cifra`: el interruptor está puesto pero `budget` no es un número
// positivo. No se aplica y SE DICE.
export const ESTADOS_PRESUPUESTO = Object.freeze(["sin", "activo", "sin_cifra"]);

/** Un número mayor que 0 (también escrito como texto), o null. */
export const positivo = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/**
 * @param {object} data household_state.data
 * @returns {{ estado: "sin"|"activo"|"sin_cifra", euros: number|null }}
 */
export function leerPresupuesto(data) {
  if (!data?.hasBudget) return { estado: "sin", euros: null };
  const b = positivo(data.budget);
  return b == null ? { estado: "sin_cifra", euros: null } : { estado: "activo", euros: b };
}

/** Los € por semana que se aplican, o null (sin presupuesto o sin cifra). */
export function presupuestoSemanal(data) {
  return leerPresupuesto(data).euros;
}
