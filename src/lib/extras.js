/**
 * Desayuno, merienda y postre: las comidas de fuera del menú de comida y cena
 * (`data.extraMeals`), con sus valores en un solo sitio. Las pinta el asistente
 * de la app (Onboarding.jsx, con su foto y su etiqueta), las apunta Lola
 * (ajustar_extras) y las lee el motor (aiPlanner.js, postres.js).
 *
 *  - desayuno: off · variado (uno distinto cada día) · findes (igual entre
 *    semana, otro el finde) · igual (siempre el mismo).
 *  - merienda (solo si hay niños): off · semana (los 7 días) · laborables (L–V).
 *  - postre: off · comida · cena · ambas.
 *  - postreTipo: inmediato (sin cocinar) · cazo (cremas) · horno (horneados).
 *  - postreInmediato (si es sin cocinar): fruta · yogur · mix (alterna).
 */
import { POSTRE_TIPOS, POSTRE_INMEDIATO_KINDS } from "./postres.js";

export const EXTRAS = Object.freeze({
  desayuno: ["off", "variado", "findes", "igual"],
  merienda: ["off", "semana", "laborables"],
  postre: ["off", "comida", "cena", "ambas"],
  postreTipo: POSTRE_TIPOS.map((t) => t.id),
  postreInmediato: POSTRE_INMEDIATO_KINDS.map((k) => k.id),
});

/** Lo de una casa nueva: nada fuera de comida y cena. */
export const EXTRAS_POR_DEFECTO = Object.freeze({ desayuno: "off", merienda: "off", postre: "off", postreTipo: "inmediato", postreInmediato: "mix" });

/** `extraMeals` con los cambios que estén en su lista; lo demás, como estaba. */
export function conExtras(extraMeals, cambios = {}) {
  const out = { ...EXTRAS_POR_DEFECTO, ...(extraMeals ?? {}) };
  for (const [k, v] of Object.entries(cambios)) if (EXTRAS[k]?.includes(v)) out[k] = v;
  return out;
}
