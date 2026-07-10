// Age → life stage. 18+ keeps an editable detail (work, university, etc).

export const STAGES = {
  baby: { id: "baby", label: "Bebé / Guardería", short: "Bebé", range: [0, 2] },
  infantil: { id: "infantil", label: "Infantil", short: "Infantil", range: [3, 5] },
  primaria: { id: "primaria", label: "Primaria", short: "Primaria", range: [6, 11] },
  secundaria: { id: "secundaria", label: "Secundaria / Bachillerato", short: "Secundaria", range: [12, 17] },
  adulto: { id: "adulto", label: "Adulto", short: "Adulto", range: [18, 200] },
};

export const HOUSEHOLD_ROLES = [
  "Adulto",
  "Papá",
  "Mamá",
  "Hijo/a",
  "Bebé",
  "Abuelo/a",
  "Amigo/a",
  "Otro",
];

/** Maps legacy stored roles onto the current list. */
export function migrateHomeRole(role) {
  if (role === "Pareja") return "Adulto";
  if (role === "Compi") return "Amigo/a";
  if (HOUSEHOLD_ROLES.includes(role)) return role;
  return "Otro";
}

export function suggestHomeRole(age) {
  const a = Number(age);
  if (Number.isNaN(a)) return "Adulto";
  if (a <= 2) return "Bebé";
  if (a < 18) return "Hijo/a";
  return "Adulto";
}

export const ADULT_DETAILS = [
  "Trabajo",
  "Teletrabajo",
  "Trabajo a turnos",
  "Universidad",
  "Oposiciones",
  "Jubilado",
  "Otro",
];

export function stageForAge(age) {
  const a = Number(age);
  if (Number.isNaN(a)) return STAGES.adulto;
  if (a <= 2) return STAGES.baby;
  if (a <= 5) return STAGES.infantil;
  if (a <= 11) return STAGES.primaria;
  if (a <= 17) return STAGES.secundaria;
  return STAGES.adulto;
}

export function isSchoolAge(age) {
  const a = Number(age);
  return a >= 3 && a <= 17;
}

/**
 * Single source of truth for "how old is this member, right now". Every
 * caller that needs an age (baby/child gating, stage labels, menu
 * generation) MUST go through this — never read `member.age` directly —
 * so a member added via `birthDate` (useBirthDate: true) is treated
 * identically everywhere instead of only in whichever screen happened to
 * compute it locally.
 */
export function resolveMemberAge(member) {
  if (member.useBirthDate && member.birthDate) {
    const d0 = new Date(member.birthDate);
    if (!Number.isNaN(d0.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - d0.getFullYear();
      const md = now.getMonth() - d0.getMonth();
      const dd = now.getDate() - d0.getDate();
      if (md < 0 || (md === 0 && dd < 0)) age -= 1;
      return Math.max(0, age);
    }
  }
  return Number.isFinite(member.age) ? member.age : parseInt(member.age, 10) || 30;
}

/** Fixed avatar palette — one distinct colour per member slot (index-based). */
export const AVATAR_PALETTE = [
  "#e53935", // red
  "#fb8c00", // orange
  "#43a047", // green
  "#039be5", // sky blue
  "#3949ab", // indigo
  "#8e24aa", // purple
  "#d81b60", // pink
  "#00897b", // teal
];

/**
 * Returns the avatar colour for a member.
 * Uses the member's own `color` field if set, otherwise falls back to the
 * palette slot determined by the member's index in the full members array.
 */
export function memberAvatarColor(memberId, allMembers) {
  const idx = allMembers.findIndex((m) => m.id === memberId);
  const member = allMembers[idx];
  if (member?.color) return member.color;
  return AVATAR_PALETTE[(idx < 0 ? 0 : idx) % AVATAR_PALETTE.length];
}

export function initialsOf(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || name[0].toUpperCase();
}

export function stageLabel(member) {
  const base = stageForAge(resolveMemberAge(member));
  if (base.id === "adulto" && member.stageDetail) return member.stageDetail;
  return base.short;
}
