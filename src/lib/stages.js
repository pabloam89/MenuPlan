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
  "Pareja",
  "Hijo/a",
  "Bebé",
  "Abuelo/a",
  "Compi",
  "Amigo/a",
  "Otro",
];

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

export function initialsOf(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || name[0].toUpperCase();
}

export function stageLabel(member) {
  const base = stageForAge(member.age);
  if (base.id === "adulto" && member.stageDetail) return member.stageDetail;
  return base.short;
}
