// Raciones por persona: cuánto come cada uno, en «raciones de adulto».
//
// Hasta el 30 sep 2026 cada comensal contaba 1, fuera un adulto de 1,90 o un
// niño de 6 años. Ahora, si de una persona se sabe peso y altura (opcionales,
// se piden en el alta por chat), su ración sale de su gasto estimado frente al
// de referencia (2000 kcal).
//
// Sin peso y altura, desde el 1 oct 2026 manda la edad (RACION_POR_EDAD): un
// niño de 3 años no come lo de un adulto, y casi nadie da peso y altura, así
// que la compra salía inflada en cuanto había niños. Sin edad, 1, como antes.
// Los grupos de bebé no pasan por aquí: sus recetas ya son de ración de bebé
// (ver racionesBySlot en aiPlanner).
//
// Estimación, no prescripción (no hay sexo ni actividad, a propósito: ver la
// decisión «menú para familias»): metabolismo basal con la media de las
// fórmulas de hombre y mujer — Mifflin-St Jeor en adultos, Schofield por peso
// en menores — por un nivel de actividad moderado (1,5).

const KCAL_REFERENCIA = 2000;
const ACTIVIDAD = 1.5;
const MIN = 0.4;
const MAX = 1.8;

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

// Ración por tramos de edad, en raciones de adulto: las necesidades de
// energía de referencia de la EFSA (actividad moderada) frente a las 2000 kcal
// del adulto de referencia, redondeadas. Desde los 14, como un adulto.
const RACION_POR_EDAD = [
  { hasta: 1, racion: MIN },
  { hasta: 4, racion: 0.5 },
  { hasta: 9, racion: 0.65 },
  { hasta: 14, racion: 0.75 },
];

/** La ración solo por la edad (años), o 1 si no se sabe. */
export function racionPorEdad(edad) {
  if (edad == null || !Number.isFinite(Number(edad)) || edad < 0) return 1;
  return RACION_POR_EDAD.find((t) => edad < t.hasta)?.racion ?? 1;
}

/** Metabolismo basal estimado, o null si faltan datos. */
export function basalEstimado({ pesoKg, alturaCm, edad }) {
  const w = num(pesoKg);
  const h = num(alturaCm);
  if (!w || !h || edad == null || edad < 0) return null;
  // Mifflin-St Jeor: +5 hombres, −161 mujeres → media −78.
  if (edad >= 18) return 10 * w + 6.25 * h - 5 * edad - 78;
  // Schofield (OMS 1985), media de niños y niñas.
  if (edad >= 10) return 14.85 * w + 698;
  if (edad >= 3) return 22.6 * w + 497;
  return 58.9 * w - 31;
}

/**
 * Ración de una persona frente a la de un adulto de referencia: con peso y
 * altura, por su gasto estimado (redondeada a 0,05 y acotada a [0,4, 1,8]);
 * sin ellos, por la edad (racionPorEdad); sin nada, 1.
 * @param {{ pesoKg?: number, alturaCm?: number }} miembro
 * @param {number | null} edad  resolveMemberAge(miembro)
 */
export function factorRacion(miembro, edad) {
  const basal = basalEstimado({ pesoKg: miembro?.pesoKg, alturaCm: miembro?.alturaCm, edad });
  if (basal == null || basal <= 0) return racionPorEdad(edad);
  const f = (basal * ACTIVIDAD) / KCAL_REFERENCIA;
  return Math.round(Math.min(MAX, Math.max(MIN, f)) * 20) / 20;
}

/** Suma de raciones de quienes comen en un hueco. */
export function racionesDe(miembros, edadDe) {
  const total = miembros.reduce((s, m) => s + factorRacion(m, edadDe(m)), 0);
  return Math.round(total * 100) / 100;
}
