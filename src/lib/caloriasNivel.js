// Etiqueta de calorías de una receta: «ligero», «medio» o «contundente».
//
// Pedida por Pablo (30 sep 2026): una etiqueta rellena en TODO el catálogo,
// para que «algo ligero» sea un filtro y no una intuición. Se deriva de `kcal`
// por ración (100 % relleno) al cargar, así que no se desincroniza nunca.
//
// La escala depende del papel del plato, porque 400 kcal no pesan igual en un
// primero que en un plato principal. Umbrales sacados de la distribución del
// Recetario Estrella (743 recetas, 30 sep 2026): cerca de los percentiles
// 25 y 75 de cada papel, redondeados.
//
//   principal (segundo, plato único o cena)  ligero < 350 · contundente > 550
//   primero                                  ligero < 250 · contundente > 450
//   desayuno, merienda, postre, bebé         ligero < 200 · contundente > 400

const ESCALAS = {
  principal: [350, 550],
  primero: [250, 450],
  pequeno: [200, 400],
};

export const NIVELES_CALORIAS = ["ligero", "medio", "contundente"];

/** Qué escala le toca a una receta según su papel en el menú. */
export function escalaDe(recipe) {
  const roles = recipe?.mealRole ?? [];
  if (recipe?.category === "bebes") return "pequeno";
  if (roles.some((r) => r === "segundo" || r === "plato_unico" || r === "cena")) return "principal";
  if (roles.includes("primero")) return "primero";
  return "pequeno";
}

/** @returns {"ligero"|"medio"|"contundente"|null} null solo si no hay kcal. */
export function nivelCalorias(recipe) {
  const kcal = Number(recipe?.kcal);
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  const [ligero, contundente] = ESCALAS[escalaDe(recipe)];
  if (kcal < ligero) return "ligero";
  if (kcal > contundente) return "contundente";
  return "medio";
}

/** Añade `caloriasNivel` a cada receta (al cargar el catálogo). */
export function conNivelCalorias(recipes) {
  return recipes.map((r) => ({ ...r, caloriasNivel: nivelCalorias(r) }));
}
