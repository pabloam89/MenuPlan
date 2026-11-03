/**
 * Empezar una pizarra en blanco cuando ya hay un menú con platos.
 *
 * «Nueva» pone un menú vacío como el de la semana. Con cuenta, el de antes no
 * se pierde (pasa a «Menús guardados», `foldInNewMenu` en menuArchive.js); sin
 * cuenta, no hay histórico y se borra. Hasta noviembre de 2026 pasaba sin
 * decir nada, y quien solo quería retocar dos platos pisaba el menú entero
 * (Pablo, 3 nov: «pisas menús como quien pisa camisetas»). Ahora se avisa antes,
 * y el aviso dice qué le pasa al menú de ahora.
 */

/** Pura. Cuántos platos hay puestos en el plan de la semana. */
export function platosEnPlan(plan) {
  let n = 0;
  for (const huecos of Object.values(plan ?? {})) {
    if (!huecos || typeof huecos !== "object" || Array.isArray(huecos)) continue;
    for (const hueco of Object.values(huecos)) if (hueco && typeof hueco === "object" && hueco.recipeId) n += 1;
  }
  return n;
}

/**
 * Pura. El aviso antes de empezar en blanco, o null si no hace falta (el menú
 * de ahora no tiene platos: no hay nada que perder).
 */
export function avisoAlEmpezar({ plan, conCuenta }) {
  if (!platosEnPlan(plan)) return null;
  return conCuenta
    ? { titulo: "¿Empezar un menú nuevo?", texto: "El de ahora no se borra: queda en «Menús»." }
    : { titulo: "¿Empezar un menú nuevo?", texto: "Sin cuenta no se guardan menús: el de ahora se borra." };
}
