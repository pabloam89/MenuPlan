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
  "#00acc1", // cyan
  "#7cb342", // lime
  "#f9a825", // amber
  "#6d4c41", // brown
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

/**
 * Maps a member's `profileKey` to the folder under /public/avatares that holds
 * its illustrated avatars. `amigo` and `adulto` borrow the young hijo/hija sets;
 * `otro` has no illustration and falls back to initials.
 */
export const AVATAR_FOLDER = {
  papa: "papa", mama: "mama", hijo: "hijo", hija: "hija",
  bebe: "bebe", abuelo: "abuelo", abuela: "abuela",
  adulto: "hija", amigo: "hijo", otro: null,
};

/**
 * Resolves the illustrated avatar for a member, ignoring any uploaded photo.
 *
 * The folder comes from the key itself (`hija_7` → `/avatares/hija/hija_7.png`)
 * rather than from AVATAR_FOLDER[profileKey], because keys outlive the mapping:
 * a member saved while `adulto` pointed at its own set keeps `adulto_3`, and
 * re-pointing `adulto` at the `hija` set must not turn that into a 404.
 */
export function memberIllustratedAvatarSrc(member) {
  const key = member?.avatarKey;
  if (!key) return null;
  const cut = key.lastIndexOf("_");
  const folder = cut > 0 ? key.slice(0, cut) : null;
  return folder ? `/avatares/${folder}/${key}.png` : null;
}

/**
 * Same head-and-shoulders crop as memberAvatarThumbSrc, but keyed directly by
 * avatarKey — for pickers that render candidate avatars the user hasn't chosen
 * yet, so there's no member object to pass.
 *
 * Exists so the "small circle ⇒ thumbnail" rule has one home: the onboarding
 * pickers each built the full-size path by hand and so pulled 1024×1024 PNGs
 * (~450 KB each) into 36–100 px circles — a whole avatar set was several MB on
 * the first screens of onboarding.
 */
export function avatarThumbSrcByKey(key) {
  if (!key) return null;
  const cut = key.lastIndexOf("_");
  const folder = cut > 0 ? key.slice(0, cut) : null;
  return folder ? `/avatares/thumbs/${folder}/${key}.png` : null;
}

/**
 * Head-and-shoulders crop of the illustrated avatar, generated by
 * scripts/make_avatar_thumbs.py. The originals are full-body renders where the
 * character is a narrow column in the middle, so anything drawn in a small
 * circle must use these instead — otherwise the person is a few pixels tall.
 * Use the full-body original only where the avatar is shown large.
 */
export function memberAvatarThumbSrc(member) {
  if (!member) return null;
  if (member.photo) return member.photo;
  const full = memberIllustratedAvatarSrc(member);
  return full ? full.replace("/avatares/", "/avatares/thumbs/") : null;
}

/**
 * Resolves the image a member should show, in priority order:
 * uploaded photo → illustrated avatar → null (caller falls back to initials).
 */
export function memberAvatarSrc(member) {
  if (!member) return null;
  if (member.photo) return member.photo;
  return memberIllustratedAvatarSrc(member);
}

const firstNameOf = (name) =>
  (name ?? "").trim().split(/\s+/)[0]?.toLocaleLowerCase("es")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") ?? "";

/**
 * Which family member is the account holder. Nothing stores this explicitly,
 * so it is matched on first name against the signed-in account and left
 * undefined when there is no unambiguous match.
 */
/**
 * Cual de los miembros eres TU.
 *
 * Antes solo existia findAccountMember(), que lo adivina comparando tu nombre
 * de Google con el de cada miembro — y devuelve null si no coincide ninguno o
 * si coinciden dos. Es decir: si en Google te llamas "Jose Luis" y en la app
 * te pusiste "Josele", la app no sabia quien eras y no lo decia.
 *
 * Ahora manda `accountMemberId`, que se marca a mano. La adivinanza se queda
 * de respaldo para quien todavia no lo haya marcado, asi que nadie pierde el
 * comportamiento que tenia.
 */
export function resolveAccountMember(members, accountMemberId, accountName) {
  const explicit = (members ?? []).find((m) => m.id === accountMemberId);
  if (explicit) return explicit;
  return findAccountMember(members, accountName);
}

export function findAccountMember(members, accountName) {
  const target = firstNameOf(accountName);
  if (!target) return null;
  const hits = (members ?? []).filter((m) => firstNameOf(m.name) === target);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * The image that represents *the account holder*, which is three separate
 * things the user can set independently: an explicitly uploaded profile photo,
 * the illustrated avatar picked for their own family member, and the Google
 * account picture. Prefer the ones the user chose inside the app — the Google
 * URL is last because it is remote and expires.
 */
export function userAvatarSrc({ profilePhoto, member, googlePhoto } = {}) {
  return profilePhoto ?? memberIllustratedAvatarSrc(member) ?? googlePhoto ?? null;
}

export function stageLabel(member) {
  const base = stageForAge(resolveMemberAge(member));
  if (base.id === "adulto" && member.stageDetail) return member.stageDetail;
  return base.short;
}
