// Deterministic "does this dish comply with a health profile?" check, used to
// surface a visible badge on the menu/dish detail. Rules are copy-pasted 1:1
// from the SYSTEM_PROMPT instructions we give the LLM (see aiPlanner.js
// "PERFILES DE SALUD") so the badge never claims something the planner wasn't
// actually told to do.
//
// This is a coarse heuristic over `healthFlags` (see lib/healthFlags.js), not
// a medical claim: a badge means "this pick avoids the flagged risk factors
// for that profile", not "this dish was clinically designed for you".

import { Beef, CircleDot, Flame, HeartPulse, Zap } from "lucide-react";

export const HEALTH_PROFILE_BADGE = {
  glucemico: {
    label: "Diabetes",
    Icon: Zap,
    color: "#dd8a2c",
    explain: "Sin azúcar añadido — pensado para el control de la diabetes.",
    matches: (flags) => !flags.includes("azucar_anadido"),
  },
  corazon: {
    label: "Corazón y colesterol",
    Icon: HeartPulse,
    color: "#c0562f",
    explain: "Sin fritos ni embutidos — cuida el corazón y el colesterol.",
    matches: (flags) => !flags.includes("frito") && !flags.includes("embutido"),
  },
  bajo_sodio: {
    label: "Bajo en sal",
    Icon: CircleDot,
    color: "#3f87b0",
    explain: "Sin ingredientes de alto contenido en sal.",
    matches: (flags) => !flags.includes("alto_sodio") && !flags.includes("embutido"),
  },
  reflux: {
    label: "Digestión / reflujo",
    Icon: Flame,
    color: "#a06b2f",
    explain: "Sin frituras, picante ni ingredientes ácidos.",
    matches: (flags) => !flags.includes("frito") && !flags.includes("picante") && !flags.includes("acido"),
  },
  anemia: {
    label: "Anemia (más hierro)",
    Icon: Beef,
    color: "#b0303f",
    explain: "Rico en hierro — pensado para la anemia.",
    // Inverted vs the others: anemia is a positive-presence check (the dish
    // must actively contain iron-rich ingredients), not an absence-of-risk one.
    matches: (flags) => flags.includes("rico_hierro"),
  },
};

/**
 * Which active health profiles (member.healthProfile values present in the
 * group) this recipe complies with, based on its healthFlags.
 * @param {string[]} healthFlags - recipe.healthFlags (frontend hydrated shape)
 * @param {Iterable<string>} activeProfiles - healthProfile ids active in the group
 * @returns {Array<{ id: string, label: string, Icon: Function, color: string, explain: string }>}
 */
export function matchingHealthProfiles(healthFlags, activeProfiles) {
  const flags = healthFlags ?? [];
  const ids = Array.from(new Set(activeProfiles ?? [])).filter((id) => HEALTH_PROFILE_BADGE[id]);
  return ids
    .filter((id) => HEALTH_PROFILE_BADGE[id].matches(flags))
    .map((id) => ({ id, ...HEALTH_PROFILE_BADGE[id] }));
}
