// Cómo está el presupuesto semanal de la casa, leído en UN sitio (#958).
//
// Un solo dato, `presupuesto` (€ por semana; null = sin presupuesto), en vez
// del par de antes `hasBudget` + `budget` (trozo 12 de #1037). Vive en su
// fila de preferencia (trozo 14; abajo, «En filas de preferencia»), no en un
// sobre. El par de antes se queda sin lector en los documentos que aún lo
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

// ── En filas de preferencia (trozo 14 de #1037; tabla preferencia, 0109) ──────────────────────────────────────
// El presupuesto es una preferencia de la casa sobre la semana: «el coste de la semana, como mucho N €». Una fila, o
// ninguna (sin presupuesto). Lo lee la app y Lola al cargar (libretaEnData.js) y lo que cambia va con la libreta a
// escribir_preferencias.

/** La forma de la fila del presupuesto. Fuerza alta: el solver lo prefiere, no lo exige (presupuesto.js). */
export const FORMA_PRESUPUESTO = Object.freeze({ nivel: "semana", eje: "coste", medida: "suma", operador: "como_mucho", fuerza: "alto" });

/** ¿Es esta fila la del presupuesto? De la casa entera, sin ámbito ni conjunto. */
export const esFilaDePresupuesto = (f) => Object.entries(FORMA_PRESUPUESTO).every(([k, v]) => k === "fuerza" || f?.[k] === v)
  && f.valor == null && !f.persona_id && !f.grupo_id && !f.plan_id && !f.dias && !f.comidas && !f.semanas && !f.desde && !f.hasta;

/** Pura. El presupuesto de las filas (preferencias_de_casa): los € de la suya, o null si no hay (sin presupuesto). */
export function presupuestoDeFilas(filas) {
  const fila = (filas ?? []).find(esFilaDePresupuesto);
  return fila ? Number(fila.cantidad) : null;
}

/**
 * Pura. Lo que cambió del presupuesto, como lista de escribir_preferencias: la fila con los € nuevos (con el id de la
 * que hay), borrarla (null: sin presupuesto), o nada. Un presupuesto que no es una cifra positiva no cabe en la fila:
 * lanza `ErrorClase` (PreferenciaInvalida de quien llama) en vez de guardarlo como «sin».
 */
export function cambiosDePresupuesto(antes, despues, filas, ErrorClase = Error) {
  if (despues === undefined || despues === antes) return [];
  const id = (filas ?? []).find(esFilaDePresupuesto)?.id;
  if (despues === null) return id ? [{ id, borrar: true }] : [];
  const euros = positivo(despues);
  if (euros == null) throw new ErrorClase(`el presupuesto es una cifra en euros, no «${despues}»`);
  return [{ ...(id ? { id } : {}), ...FORMA_PRESUPUESTO, valor: null, cantidad: euros, origen: "dicho" }];
}
