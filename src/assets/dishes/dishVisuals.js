// Palette per recipe family (iconType). Used for dish row icons, badges, and detail hero.

export const DISH_VISUALS = {
  fish:   { surface: "#d0e8f8", ink: "#1a4d72", accent: "#2072b8", label: "Pescado" },
  meat:   { surface: "#f5cfc0", ink: "#7a2010", accent: "#c03818", label: "Carne" },
  egg:    { surface: "#f8f0a8", ink: "#6a5000", accent: "#c8a000", label: "Huevo" },
  legume: { surface: "#bfe8cc", ink: "#1a4a28", accent: "#2d8a48", label: "Legumbre" },
  pasta:  { surface: "#f8ddb8", ink: "#7a4008", accent: "#c07018", label: "Pasta" },
  rice:   { surface: "#f7ecc8", ink: "#876820", accent: "#caa544", label: "Arroz" },
  greens: { surface: "#b8f0cc", ink: "#155028", accent: "#4cba6e", label: "Verdura" },
  soup:   { surface: "#ddc8f8", ink: "#4a1a90", accent: "#7830d0", label: "Sopa" },
  chef:   { surface: "#e7efe6", ink: "#27442e", accent: "#3f6948", label: "Plato" },
};

export function visualForRecipe(recipe) {
  const key = recipe?.iconType;
  return DISH_VISUALS[key] ?? DISH_VISUALS.chef;
}

export function paletteForRecipe(recipe) {
  const v = visualForRecipe(recipe);
  return { surface: v.surface, ink: v.ink, accent: v.accent };
}
