// Soft, editorial palette per category. No gradient overload, no AI vibes.
// `surface` is the soft pastel background; `ink` is the warm tone used for
// titles, icons, and small accents over that surface.

const DISH_VISUALS = {
  fish: { surface: "#e7eef3", ink: "#3b6685", accent: "#5a8fb0" },
  meat: { surface: "#f4e3da", ink: "#8a3f25", accent: "#b85f45" },
  egg: { surface: "#fbeec1", ink: "#9e6a14", accent: "#d39b22" },
  legume: { surface: "#efe4cc", ink: "#7a5a23", accent: "#a88742" },
  pasta: { surface: "#fae3c4", ink: "#a35e1f", accent: "#c9852f" },
  rice: { surface: "#f7ecc8", ink: "#876820", accent: "#caa544" },
  greens: { surface: "#dfecd3", ink: "#365e3d", accent: "#5a8b56" },
  soup: { surface: "#fcdfc4", ink: "#9d4f1e", accent: "#d06d35" },
  chef: { surface: "#e7efe6", ink: "#27442e", accent: "#3f6948" },
};

export function visualForRecipe(recipe) {
  return DISH_VISUALS[recipe?.iconType] ?? DISH_VISUALS.chef;
}
