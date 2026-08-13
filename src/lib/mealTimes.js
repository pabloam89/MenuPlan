// One palette for the three meal times, shared by every screen that labels a
// meal. Kept out of the screens because it used to be copy-pasted between
// Onboarding, Menu and RecipePlanner, and the copies drifted apart — dinner was
// indigo in the schedule and a different blue in the recipe form.
//
// Dinner is indigo rather than the old slate blue: that blue sat 6° of hue from
// the schedule's "come fuera", so the same moon meant the time of day in one
// place and the location right next to it. Indigo moves to 237°, clear of both
// the teal of "fuera" and the green of "en casa".

export const MEAL_TIME_COLOR = {
  Desayuno: "#e0654f",
  Comida: "#c9820a",
  Cena: "#5a5fc8",
};

// Tinted background for a glyph sitting on white.
export const MEAL_TIME_BG = {
  Desayuno: "#fdeeeb",
  Comida: "#fdf4e3",
  Cena: "#eff0fb",
};

const DEFAULT_COLOR = "#2d5a3d";
const DEFAULT_BG = "#eef4f0";

/** Accent colour for a meal name, falling back to the app green. */
export function mealTimeColor(meal) {
  return MEAL_TIME_COLOR[meal] ?? DEFAULT_COLOR;
}

/** Soft background matching {@link mealTimeColor}. */
export function mealTimeBg(meal) {
  return MEAL_TIME_BG[meal] ?? DEFAULT_BG;
}
