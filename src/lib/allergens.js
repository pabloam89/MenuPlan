import {
  Bean,
  CircleDot,
  Egg,
  Fish,
  FlaskConical,
  Leaf,
  Milk,
  Nut,
  Shell,
  Shrimp,
  Sprout,
  Wheat,
  Wine,
} from "lucide-react";

/** Reglamento UE — 14 alérgenos declarables */
export const EU_ALLERGENS = {
  gluten: {
    label: "Gluten",
    Icon: Wheat,
    color: "#a67c00",
  },
  crustaceos: {
    label: "Crustáceos",
    Icon: Shrimp,
    color: "#c03818",
  },
  huevos: {
    label: "Huevos",
    Icon: Egg,
    color: "#c8a000",
  },
  pescado: {
    label: "Pescado",
    Icon: Fish,
    color: "#2072b8",
  },
  cacahuetes: {
    label: "Cacahuetes",
    Icon: Nut,
    color: "#b86a2a",
  },
  soja: {
    label: "Soja",
    Icon: Bean,
    color: "#5a8f3a",
  },
  leche: {
    label: "Leche",
    Icon: Milk,
    color: "#4a7ab8",
  },
  frutos_cascara: {
    label: "Frutos de cáscara",
    Icon: Nut,
    color: "#8a5a28",
  },
  apio: {
    label: "Apio",
    Icon: Leaf,
    color: "#4cba6e",
  },
  mostaza: {
    label: "Mostaza",
    Icon: FlaskConical,
    color: "#d4a017",
  },
  sesamo: {
    label: "Sésamo",
    Icon: CircleDot,
    color: "#9a7b4f",
  },
  sulfitos: {
    label: "Sulfitos",
    Icon: Wine,
    color: "#8b4a6b",
  },
  altramuces: {
    label: "Altramuces",
    Icon: Sprout,
    color: "#6b9a3a",
  },
  moluscos: {
    label: "Moluscos",
    Icon: Shell,
    color: "#5a6a8a",
  },
};

const ALLERGEN_ALIASES = {
  gluten: "gluten",
  crustaceos: "crustaceos",
  crustaceo: "crustaceos",
  marisco: "crustaceos",
  mariscos: "crustaceos",
  huevo: "huevos",
  huevos: "huevos",
  pescado: "pescado",
  cacahuete: "cacahuetes",
  cacahuetes: "cacahuetes",
  soja: "soja",
  lactosa: "leche",
  leche: "leche",
  frutos_secos: "frutos_cascara",
  frutos_de_cascara: "frutos_cascara",
  frutos_cascara: "frutos_cascara",
  apio: "apio",
  mostaza: "mostaza",
  sesamo: "sesamo",
  sésamo: "sesamo",
  sulfito: "sulfitos",
  sulfitos: "sulfitos",
  dioxido_de_azufre: "sulfitos",
  altramuz: "altramuces",
  altramuces: "altramuces",
  molusco: "moluscos",
  moluscos: "moluscos",
};

function slugifyAllergen(raw) {
  return String(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

/** @param {string} raw */
export function normalizeAllergenId(raw) {
  const slug = slugifyAllergen(raw);
  return ALLERGEN_ALIASES[slug] ?? (EU_ALLERGENS[slug] ? slug : slug);
}

/** @param {string[] | undefined} allergens */
export function resolveRecipeAllergens(allergens) {
  const seen = new Set();
  const items = [];
  for (const raw of allergens ?? []) {
    const id = normalizeAllergenId(raw);
    const meta = EU_ALLERGENS[id];
    if (!meta || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, ...meta });
  }
  return items;
}

/** @param {string[] | undefined} allergens */
export function formatAllergenLabels(allergens) {
  return resolveRecipeAllergens(allergens)
    .map((a) => a.label)
    .join(", ");
}
