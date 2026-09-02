import { AVATAR_PALETTE } from "./stages.js";

/**
 * Utilidades de pintado de la parte social. Viven aparte porque las usan
 * cuatro superficies (feed, notificaciones, gente, perfil) y cada una tenia
 * ya su copia a medio divergir.
 */

/** "hace 2 h". Se corta en semanas: mas alla, la fecha ya no aporta. */
export function relativeTime(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return null;
  if (mins < 2) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} dias`;
  const w = Math.round(d / 7);
  return w === 1 ? "hace 1 semana" : `hace ${w} semanas`;
}

/**
 * Color de avatar estable por usuario, con la MISMA paleta que los miembros
 * del hogar. Es lo que evita que la parte social parezca verde entera: cada
 * persona tiene su color, como en casa — y ademas dos "M" con inicial igual
 * dejan de ser identicas.
 */
export function personColor(userId) {
  const s = String(userId ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
