import { migrateFixedDishes } from "./fixedDishes.js";
import { formatCookTimeSummary } from "./cookTime.js";
import { DAYS, getMeals, slotKey } from "./planner.js";

const GOAL_LABELS = {
  sano: "Sano",
  economico: "Económico",
  rapido: "Rápido",
  deportivo: "Deportivo",
  variado: "Variado",
};

const FREQ_LABELS = {
  verdura: "Verdura",
  pescado: "Pescado",
  legumbres: "Legumbres",
};

const COOK_LABELS = {
  basic: "Básico",
  normal: "Normal",
  pro: "Me gusta cocinar",
};

function scheduleSummary(data) {
  const meals = getMeals(data);
  let casa = 0;
  let tupper = 0;
  let fuera = 0;
  let cole = 0;

  for (const m of data.members ?? []) {
    for (const day of DAYS) {
      for (const meal of meals) {
        const v = data.schedule?.[slotKey(m.id, day, meal)] ?? "casa";
        if (v === "tupper") tupper++;
        else if (v === "fuera") fuera++;
        else if (v === "cole") cole++;
        else if (v === "casa") casa++;
      }
    }
  }

  const parts = [];
  if (casa) parts.push(`${casa} en casa`);
  if (tupper) parts.push(`${tupper} tupper`);
  if (cole) parts.push(`${cole} cole`);
  if (fuera) parts.push(`${fuera} fuera`);
  return parts.length ? parts.join(" · ") : "Sin horario definido";
}

/** @returns {{ title: string, lines: string[] }[]} */
export function buildProfileSummary(data) {
  const sections = [];

  const members = data.members ?? [];
  if (members.length) {
    sections.push({
      title: "Familia",
      lines: members.map((m) => m.name),
    });
  }

  const allergies = members.flatMap((m) => m.allergies ?? []);
  const dislikes = [
    ...(data.dislikes ?? []),
    ...members.flatMap((m) => m.dislikes ?? []),
  ];
  const uniqueAllergies = [...new Set(allergies)];
  const uniqueDislikes = [...new Set(dislikes)];
  if (uniqueAllergies.length || uniqueDislikes.length) {
    const lines = [];
    if (uniqueAllergies.length) lines.push(`Alergias: ${uniqueAllergies.join(", ")}`);
    if (uniqueDislikes.length) lines.push(`No le gusta: ${uniqueDislikes.join(", ")}`);
    sections.push({ title: "Evitar", lines });
  }

  const fixed = migrateFixedDishes(data.fixedDishes);
  if (fixed.length) {
    sections.push({
      title: "Repetir",
      lines: fixed.map(
        (fd) => `${fd.name} · ${fd.timesPerWeek}×/sem (${fd.meals.join(", ")})`
      ),
    });
  }

  sections.push({
    title: "Horario",
    lines: [scheduleSummary(data)],
  });

  const goalIds = data.goals ?? [];
  const goalDefs = data.goalDefs ?? [];
  if (goalIds.length) {
    sections.push({
      title: "Objetivos",
      lines: goalIds.map((id) => {
        const def = goalDefs.find((g) => g.id === id);
        return def?.label ?? GOAL_LABELS[id] ?? id;
      }),
    });
  }

  const freqs = data.freqs ?? {};
  const freqLines = Object.entries(freqs).map(
    ([k, v]) => `${FREQ_LABELS[k] ?? k}: ≥${v}/sem`
  );
  if (freqLines.length) {
    sections.push({ title: "Frecuencias", lines: freqLines });
  }

  const cook = COOK_LABELS[data.cookLevel] ?? data.cookLevel;
  const tools = [...(data.kitchenTools ?? []), ...(data.customKitchenTools ?? [])];
  sections.push({
    title: "Cocina",
    lines: [
      cook,
      formatCookTimeSummary(data),
      tools.length ? tools.join(", ") : "Sin utensilios marcados",
    ],
  });

  return sections;
}

/** One-line preview for compact profile bar. */
export function buildProfilePreviewLine(data) {
  const bits = [];
  const names = (data.members ?? []).map((m) => m.name);
  if (names.length) bits.push(names.join(", "));

  const goalIds = data.goals ?? [];
  const goalDefs = data.goalDefs ?? [];
  if (goalIds.length) {
    bits.push(
      goalIds
        .slice(0, 3)
        .map((id) => goalDefs.find((g) => g.id === id)?.label ?? GOAL_LABELS[id] ?? id)
        .join(" · ")
    );
  }

  const freqs = data.freqs ?? {};
  const freqBits = Object.entries(freqs)
    .filter(([, v]) => v > 0)
    .slice(0, 2)
    .map(([k, v]) => `${FREQ_LABELS[k] ?? k} ≥${v}`);
  if (freqBits.length) bits.push(freqBits.join(" · "));

  return bits.join(" · ") || "Perfil sin configurar";
}
