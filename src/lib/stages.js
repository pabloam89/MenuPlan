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

/**
 * El papel que se propone por la edad, con los mismos cortes que etapaDe (bebé
 * hasta cumplir 3: 2,5 es «Bebé»). Sin edad (null, "", «no») no se sabe nada y
 * se propone «Adulto», como siempre; antes Number(null) = 0 lo hacía «Bebé».
 */
export function suggestHomeRole(age) {
  const a = edadEscrita(age);
  if (a == null) return "Adulto";
  if (a < DESDE_INFANTIL) return "Bebé";
  if (a < DESDE_ADULTO) return "Hijo/a";
  return "Adulto";
}

// Etiquetas de HOUSEHOLD_ROLES, tal y como las devuelve migrateHomeRole.
const FAMILY_ROLES_SET = new Set(["Papá", "Mamá", "Hijo/a", "Bebé", "Abuelo/a"]);

/**
 * Si en la casa hay algún papel de familia (padres, hijos, bebé, abuelos), el
 * menú común se llama «Familia»; si no (pisos de amigos, parejas), «Todos».
 */
export function isFamilyGroup(members) {
  return (members ?? []).some((m) =>
    FAMILY_ROLES_SET.has(migrateHomeRole(m.homeRole ?? suggestHomeRole(resolveMemberAge(m))))
  );
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

// Los cortes salen de STAGES y de ningún otro sitio. Se comparan con «<» el
// principio del tramo siguiente, para que una edad con decimales (2,5) caiga
// donde toca: bebé es hasta el día antes de cumplir 3.
const DESDE_INFANTIL = STAGES.infantil.range[0]; // 3
const DESDE_PRIMARIA = STAGES.primaria.range[0]; // 6
const DESDE_SECUNDARIA = STAGES.secundaria.range[0]; // 12
const DESDE_ADULTO = STAGES.adulto.range[0]; // 18

export function stageForAge(age) {
  const a = Number(age);
  if (Number.isNaN(a)) return STAGES.adulto;
  if (a < DESDE_INFANTIL) return STAGES.baby;
  if (a < DESDE_PRIMARIA) return STAGES.infantil;
  if (a < DESDE_SECUNDARIA) return STAGES.primaria;
  if (a < DESDE_ADULTO) return STAGES.secundaria;
  return STAGES.adulto;
}

/**
 * «YYYY-MM-DD» como día local: new Date("2023-10-08") es medianoche UTC, que al
 * oeste de Greenwich cae el día 7 y adelanta el cumpleaños. Lo demás, tal cual.
 */
function fechaLocal(v) {
  const m = typeof v === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
}

/** Edad en años cumplidos a `hoy` desde una fecha de nacimiento; null si no se lee. */
function edadDesdeFecha(birthDate, hoy) {
  const d0 = fechaLocal(birthDate);
  const ahora = hoy instanceof Date ? hoy : hoy == null ? new Date() : fechaLocal(hoy);
  if (Number.isNaN(d0.getTime()) || Number.isNaN(ahora.getTime())) return null;
  let edad = ahora.getFullYear() - d0.getFullYear();
  const md = ahora.getMonth() - d0.getMonth();
  if (md < 0 || (md === 0 && ahora.getDate() < d0.getDate())) edad -= 1;
  return Math.max(0, edad);
}

/** La edad escrita, si es un número de verdad (0 incluido, también «"0"»). */
function edadEscrita(age) {
  if (age == null || age === "") return null;
  const t = String(age).trim();
  const n = typeof age === "number" ? age : Number.isFinite(Number(t)) ? Number(t) : parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const sinAcentos = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Lo que dice el papel cuando no hay edad. Es una pista floja: solo se mira
 * si no hay fecha ni edad. «Amigo/a» y «Otro» no dicen nada (un amigo puede
 * tener 8 años o 40). El papel escrito a mano («bebé», «hija») también vale.
 */
function etapaPorPapel(homeRole) {
  const t = sinAcentos(homeRole);
  if (!t) return null;
  if (/\bbebes?\b/.test(t)) return "bebe"; // «bebé», «bebés»; no «bebedor»
  if (/^(hij[oa]|hijo\/a|nin[oa]|nino\/a)$/.test(t)) return "nino";
  if (/^(adult[oa]|papa|mama|padre|madre|abuel[oa]|abuelo\/a|pareja)$/.test(t)) return "adulto";
  return null;
}

/**
 * LA definición de etapa de una persona de la casa. Todo lo que pregunte «¿es
 * bebé?», «¿es niño?», «¿es adulto?» —en la app y en el bot— pasa por aquí.
 *
 *   etapa: 'bebe' | 'nino' | 'adolescente' | 'adulto' | 'desconocida'
 *   edad:  años cumplidos, o null si no se sabe
 *   fuente: 'fechaNacimiento' | 'edad' | 'papel' | 'ninguna'
 *
 * Orden: la fecha de nacimiento si se usa (`useBirthDate`), si no la edad, y
 * si no hay ninguna, el papel como pista. Sin nada, 'desconocida': nunca 30
 * años en silencio; quien llama decide (para el menú cuenta como adulto, y
 * para el menú del bebé solo cuenta quien es 'bebe', con edad o por papel).
 *
 * Cortes (STAGES): bebé 0–2 (hasta cumplir 3), niño 3–11, adolescente 12–17,
 * adulto 18+. El bebé se corta en 3 y no en 2 porque es lo prudente: a los 2
 * años aún hay riesgo de atragantamiento y la sal cuenta; quien ya come como
 * los demás lo dice con «ya come como un niño» (`notBaby`), que se respeta
 * siempre, con edad o sin ella.
 */
export function etapaDe(persona, { hoy } = {}) {
  const p = persona ?? {};
  let edad = null;
  let fuente = "ninguna";
  if (p.useBirthDate && p.birthDate) {
    edad = edadDesdeFecha(p.birthDate, hoy);
    if (edad != null) fuente = "fechaNacimiento";
  }
  if (edad == null) {
    edad = edadEscrita(p.age);
    if (edad != null) fuente = "edad";
  }
  let etapa;
  if (edad != null) {
    etapa = edad < DESDE_INFANTIL ? "bebe" : edad < DESDE_SECUNDARIA ? "nino" : edad < DESDE_ADULTO ? "adolescente" : "adulto";
  } else {
    etapa = etapaPorPapel(p.homeRole);
    if (etapa) fuente = "papel";
    else etapa = "desconocida";
  }
  if (etapa === "bebe" && p.notBaby) etapa = "nino";
  return { etapa, edad, fuente };
}

/** ¿Come del menú del bebé? */
export const esEtapaBebe = (persona, opts) => etapaDe(persona, opts).etapa === "bebe";
/** Menor de edad (bebé, niño o adolescente). */
export const esMenor = (persona, opts) => ["bebe", "nino", "adolescente"].includes(etapaDe(persona, opts).etapa);
/** Niño de 3 a 11 (o sin edad con papel de hijo, o bebé que ya come como niño). */
export const esNino = (persona, opts) => etapaDe(persona, opts).etapa === "nino";

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
//
// OJO: sin edad devuelve 30. Vale para pintar y para raciones; para decidir
// si alguien es bebé, niño o adulto, etapaDe(), que dice 'desconocida'.
export function resolveMemberAge(member) {
  return etapaDe(member).edad ?? 30;
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

/**
 * El `accountMemberId` marcado por ESTA cuenta.
 *
 * `data.accountMemberId` vive en el JSON de la casa, que es compartido: el
 * titular y la cotitular pisaban el mismo valor y la segunda «era» el primero.
 * Ahora cada cuenta guarda el suyo en `data.accountMemberIdByUser[userId]` (va
 * con la casa a todos los dispositivos, y cada casa tiene su mapa). El valor
 * viejo compartido solo vale de respaldo para el titular, que es quien lo
 * marcaba antes de que hubiera cotitulares; a los demás les toca la adivinanza
 * por nombre hasta que marquen el suyo.
 *
 * TRANSICIÓN (ver supabase/PENDIENTES.md): el sitio de verdad es
 * `household_members.persona_id`, con FK compuesta a `persona`. Se hará
 * DESPUÉS de que menuplan-1e pase los ids de persona a uuid (bloque 0120+),
 * para no chocar con ese cambio de tipo. Hasta entonces este mapa es una caché
 * declarada en el JSON de la casa, y el día de la columna se copia de aquí.
 * @returns {string|null}
 */
export function miembroDeCuentaId(data, userId, { esTitular = true } = {}) {
  const porUsuario = data?.accountMemberIdByUser;
  if (userId && porUsuario && Object.prototype.hasOwnProperty.call(porUsuario, userId)) {
    return porUsuario[userId] ?? null;
  }
  return (!userId || esTitular) && typeof data?.accountMemberId === "string" ? data.accountMemberId : null;
}

/** Marca (o desmarca con null) quién es esta cuenta en la familia. */
export function conMiembroDeCuenta(data, userId, memberId) {
  if (!userId) return { ...data, accountMemberId: memberId };
  return { ...data, accountMemberIdByUser: { ...(data?.accountMemberIdByUser ?? {}), [userId]: memberId ?? null } };
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
