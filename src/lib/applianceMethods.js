// Appliance preparation methods — shared selection logic + labels.
//
// Each recipe may carry `methods[]`, where every entry is:
//   { appliance: "airfryer"|"horno"|"thermomix"|"vaporera"|"olla_express"|"microondas",
//     time: number, difficulty: "facil"|"normal"|"elaborada", prepSummary: string }
//
// The recipe's top-level { time, difficulty } stays as the BASE version
// (stovetop / its own technique). Methods are alternatives the user can pick
// based on the kitchen tools they declared in onboarding.

import { Wind, Flame, Microwave, Bot, CookingPot, Layers2 } from "../components/icons.jsx";

/**
 * Los trastos que una casa declara tener, con su ilustración.
 *
 * Es la lista que el asistente ya enseñaba (`APPLIANCES`, que vivía dentro de
 * Onboarding.jsx) traída a la librería, para que la baldosa de batch cooking
 * pinte los MISMOS seis aparatos con las MISMAS fotos sin arrastrar el
 * asistente entero detrás. Las claves son las de `REQUIRED_APPLIANCE_ICONS`,
 * en español y con mayúscula, porque así están guardadas ya en producción.
 */
export const KITCHEN_TOOLS = [
  { id: "Airfryer", img: "/avatares/cards/electrodomesticos/airfryer.webp" },
  { id: "Horno", img: "/avatares/cards/electrodomesticos/horno.webp" },
  { id: "Microondas", img: "/avatares/cards/electrodomesticos/microondas.webp" },
  { id: "Olla rápida", img: "/avatares/cards/electrodomesticos/olla_rapida.webp" },
  { id: "Thermomix", img: "/avatares/cards/electrodomesticos/thermomix.webp" },
  { id: "Vaporera", img: "/avatares/cards/electrodomesticos/vaporera.webp" },
];

/** Solo los nombres, para quien compara contra `data.kitchenTools`. */
export const KITCHEN_TOOL_IDS = KITCHEN_TOOLS.map((t) => t.id);

export const APPLIANCE_LABELS = {
  airfryer: "Airfryer",
  horno: "Horno",
  thermomix: "Thermomix",
  vaporera: "Vaporera",
  olla_express: "Olla exprés",
  microondas: "Microondas",
};

// Per-appliance accent colour (UI chips/icons).
export const APPLIANCE_COLORS = {
  airfryer: "#f97316",
  horno: "#ef4444",
  thermomix: "#8b5cf6",
  vaporera: "#06b6d4",
  olla_express: "#6b7280",
  microondas: "#3b82f6",
};

// Icono por slug de `methods[]`. Comparte los dibujos con
// REQUIRED_APPLIANCE_ICONS de abajo (que es el otro sistema de ids) porque un
// horno se dibuja igual se llame como se llame la clave; lo que no se comparte
// son los ids. Lo usa el modo cocina para decir con qué estás cocinando.
export const APPLIANCE_ICONS = {
  airfryer: Wind,
  horno: Flame,
  thermomix: Bot,
  vaporera: Layers2,
  olla_express: CookingPot,
  microondas: Microwave,
};

// Segundo sistema de electrodoméstico, DELIBERADAMENTE separado del de arriba
// (APPLIANCE_LABELS/APPLIANCE_COLORS, ids en snake_case, para `methods[]` —
// técnicas alternativas de un mismo plato). Este es el de `requiredAppliances`
// (RecipePlanner.jsx, "¿Cómo se prepara?" — QUÉ aparato hizo falta para
// cocinar ESTE plato, uno solo), con sus propios ids en español-mayúscula
// porque así se guarda ya en producción — cambiar el id rompería recetas
// reales guardadas. Solo se comparten los ICONOS, no los ids: un electro
// puede tener un icono coherente en los dos sitios sin que las dos listas
// sean la misma lista.
export const REQUIRED_APPLIANCE_ICONS = {
  "Airfryer": Wind,
  "Horno": Flame,
  "Microondas": Microwave,
  "Thermomix": Bot,
  "Olla rápida": CookingPot,
  "Vaporera": Layers2,
};

export const REQUIRED_APPLIANCE_COLORS = {
  "Airfryer": "#2f6fb8",
  "Horno": "#c0392b",
  "Microondas": "#0f9d8c",
  "Thermomix": "#6b4fa0",
  "Olla rápida": "#c96a1c",
  "Vaporera": "#2d8659",
};

/**
 * Cuánto cabe de UNA vez en cada aparato, en mililitros o gramos de producto.
 *
 * La capacidad es del CACHARRO, no de la receta. Hasta ahora `capacidadMax`
 * vivía solo en la base, igual para todos los métodos, y eso hacía que un
 * caldo para doce fuera "una tanda" con olla exprés y también con Thermomix.
 * No: el vaso de una Thermomix son 2,2 litros y una olla exprés son seis, así
 * que ese mismo caldo son tres vasos, cada uno con su carga y su lavado. Sin
 * esto, el aparato salía mejor parado de lo que le toca en cuanto había
 * volumen de por medio.
 *
 * Va en VOLUMEN y no en raciones porque una ración no mide lo mismo según qué:
 * una de caldo son 250 ml y una de pesto 38 g. Con un número fijo de raciones
 * por tanda, la bechamel para ocho salía en dos vasos cuando cabe de sobra en
 * uno. Las raciones que caben se calculan con el `rinde` que cada base ya
 * declara (ver `tiempoDeBase`).
 *
 * Son capacidades ÚTILES, no nominales: nadie llena un vaso hasta el borde.
 */
export const CAPACIDAD_POR_APARATO = {
  thermomix: 1800,
  microondas: 1500,
  airfryer: 1200,
  vaporera: 2500,
  horno: 4000,
  olla_express: 4500,
};

// Onboarding tool label (lowercased) → method appliance slug.
const TOOL_TO_APPLIANCE = {
  "airfryer": "airfryer",
  "freidora de aire": "airfryer",
  "horno": "horno",
  "microondas": "microondas",
  "thermomix": "thermomix",
  "robot/thermomix": "thermomix",
  "robot de cocina": "thermomix",
  "olla rápida": "olla_express",
  "olla rapida": "olla_express",
  "olla exprés": "olla_express",
  "olla express": "olla_express",
  "olla a presión": "olla_express",
  "vaporera": "vaporera",
};

/** Maps a list of onboarding kitchen tool labels to a Set of appliance slugs. */
export function userApplianceSlugs(kitchenTools = []) {
  const out = new Set();
  for (const t of kitchenTools) {
    const slug = TOOL_TO_APPLIANCE[String(t).toLowerCase().trim()];
    if (slug) out.add(slug);
  }
  return out;
}

/**
 * Picks the best method for the user's tools (fastest matching appliance),
 * or null when the recipe has no methods or none match the user's tools
 * (in which case the base/top-level version is used).
 */
export function selectMethodForRecipe(recipe, kitchenTools = []) {
  const methods = recipe?.methods;
  if (!Array.isArray(methods) || methods.length === 0) return null;
  const slugs = userApplianceSlugs(kitchenTools);
  if (slugs.size === 0) return null;
  const candidates = methods.filter((m) => slugs.has(m.appliance));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, m) => (m.time < best.time ? m : best));
}

const DIFFICULTY_LABELS = { facil: "Fácil", normal: "Normal", elaborada: "Elaborada" };
export function methodDifficultyLabel(difficulty) {
  return DIFFICULTY_LABELS[difficulty] ?? "Normal";
}
