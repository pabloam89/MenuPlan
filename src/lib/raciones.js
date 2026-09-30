// Raciones por persona: cuánto come cada uno, en «raciones de adulto».
//
// Hasta el 30 sep 2026 cada comensal contaba 1, fuera un adulto de 1,90 o un
// niño de 6 años. Ahora, si de una persona se sabe peso y altura (opcionales,
// se piden en el alta por chat), su ración sale de su gasto estimado frente al
// de referencia (2000 kcal). Sin esos datos sigue valiendo 1: el menú de quien
// no los da no cambia en nada.
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
 * Ración de una persona frente a la de un adulto de referencia: 1 si no se
 * sabe, redondeada a 0,05 y acotada a [0,4, 1,8].
 * @param {{ pesoKg?: number, alturaCm?: number }} miembro
 * @param {number | null} edad  resolveMemberAge(miembro)
 */
export function factorRacion(miembro, edad) {
  const basal = basalEstimado({ pesoKg: miembro?.pesoKg, alturaCm: miembro?.alturaCm, edad });
  if (basal == null || basal <= 0) return 1;
  const f = (basal * ACTIVIDAD) / KCAL_REFERENCIA;
  return Math.round(Math.min(MAX, Math.max(MIN, f)) * 20) / 20;
}

/** Suma de raciones de quienes comen en un hueco. */
export function racionesDe(miembros, edadDe) {
  const total = miembros.reduce((s, m) => s + factorRacion(m, edadDe(m)), 0);
  return Math.round(total * 100) / 100;
}
