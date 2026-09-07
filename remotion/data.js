// Datos del vídeo. Salen del catálogo real (no hay nombres ni cuentas escritos
// a mano) pero sin pasar por src/data/recipeCatalog.js: ese módulo abre
// Supabase con top-level await, y el bundler de Remotion no tiene ni sesión ni
// variables de entorno.
import legumbres from "../src/data/recipes/legumbres.json";
import carnes from "../src/data/recipes/carnes.json";
import pescados from "../src/data/recipes/pescados.json";
import huevos from "../src/data/recipes/huevos.json";
import pastaArroces from "../src/data/recipes/pasta_arroces.json";
import sopasCremas from "../src/data/recipes/sopas_cremas.json";
import ensaladasVerduras from "../src/data/recipes/ensaladas_verduras.json";
import bebes from "../src/data/recipes/bebes.json";
import desayunos from "../src/data/recipes/desayunos.json";
import meriendas from "../src/data/recipes/meriendas.json";
import postres from "../src/data/recipes/postres.json";
import guarniciones from "../src/data/recipes/guarniciones.json";
import { dishImageForRecipe } from "../src/assets/dishes/dishImages.js";

// Etiqueta, color e ilustración de cada categoría: los mismos valores que
// CATEGORY_META en CatalogBrowserSheet.jsx, que es lo que pinta la pantalla.
const CATEGORIES = [
  { id: "bebes", label: "Bebés", color: "#6cb4c4", recipes: bebes },
  { id: "carnes", label: "Carnes", color: "#c0392b", recipes: carnes },
  { id: "desayunos", label: "Desayunos", color: "#c98a3a", recipes: desayunos },
  { id: "guarniciones", label: "Guarnición", color: "#3f9656", recipes: guarniciones },
  { id: "huevos", label: "Huevos", color: "#d4a017", recipes: huevos },
  { id: "legumbres", label: "Legumbres", color: "#b9770e", recipes: legumbres },
  { id: "meriendas", label: "Meriendas", color: "#4a9d6b", recipes: meriendas },
  { id: "pasta_arroces", label: "Pasta y arroz", color: "#cf7833", recipes: pastaArroces },
  { id: "pescados", label: "Pescados", color: "#2f6f9f", recipes: pescados },
  { id: "postres", label: "Postres", color: "#c463a0", recipes: postres },
  { id: "sopas_cremas", label: "Sopas y cremas", color: "#8a6cc4", recipes: sopasCremas },
  { id: "ensaladas_verduras", label: "Verduras", color: "#3f9656", recipes: ensaladasVerduras },
];

// La pantalla solo lista categorías del Recetario Estrella (fullCatalog se
// filtra por `estrella` cuando reference+browseCategories), ordenadas por
// etiqueta. Las guarniciones son la excepción: se navegan por su propia lista,
// que son las que tienen foto.
function countFor({ id, recipes }) {
  if (id === "guarniciones") return recipes.filter((r) => dishImageForRecipe(r)).length;
  return recipes.filter((r) => r.estrella === true).length;
}

export const categoryTiles = [
  // "Mis recetas" es una tesela más del grid desde 2026-08-27, y va primera.
  // La cuenta es de un hogar de ejemplo: lo tuyo no sale del catálogo.
  {
    id: "__mine__",
    label: "Mis recetas",
    color: "#2d5a3d",
    count: 14,
    img: "avatares/cards/empty_recetas_propias.jpg",
  },
  ...CATEGORIES.map((cat) => ({
    id: cat.id,
    label: cat.label,
    color: cat.color,
    count: countFor(cat),
    img: `categories/${cat.id}.png`,
  })),
];

/** El plato que se abre al tocar una tesela: el primero de esa categoría. */
export function firstDishOf(categoryId) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  const recipe = cat.recipes.find((r) => r.estrella === true && dishImageForRecipe(r));
  return {
    id: recipe.id,
    name: recipe.name,
    time: recipe.time,
    kcal: recipe.kcal,
    photo: dishImageForRecipe(recipe),
  };
}

// Hasta 7 platos por categoría para la explosión de miniaturas. Con el mismo
// criterio real que countFor: estrella salvo en guarniciones, que va por foto.
// Meriendas solo tiene 2 con estrella+foto — se queda corta a propósito, es
// el catálogo real, no un relleno inventado para cuadrar un número redondo.
const DISHES_PER_CATEGORY = 7;

export const flyingDishes = CATEGORIES.flatMap((cat) => {
  const pool =
    cat.id === "guarniciones"
      ? cat.recipes.filter((r) => dishImageForRecipe(r))
      : cat.recipes.filter((r) => r.estrella === true && dishImageForRecipe(r));
  // "Fruta de temporada" (postres_003) resuelve a una ruta local de la app
  // (/seasonal-fruit/...), no a la CDN de fotos — staticFile() la serviría,
  // pero es una foto genérica rotatoria, no la de un plato real, así que se
  // descarta en vez de tratarla como una miniatura más.
  return pool
    .filter((r) => dishImageForRecipe(r).startsWith("http"))
    .slice(0, DISHES_PER_CATEGORY)
    .map((r) => ({
      id: r.id,
      category: cat.id,
      photo: dishImageForRecipe(r),
    }));
});

// Las carpetas de dentro de "Mis recetas" (ver COLLECTION_ART y
// BUILT_IN_COLLECTIONS en CatalogBrowserSheet.jsx / recipeCollections.js):
// "Todas" + las 4 fijas que tiene cualquier cuenta + "Descartados", con el
// mismo arte real que usa la app. Los contadores son de un hogar de ejemplo
// (no hay recetas "propias" reales que contar fuera de una sesión con datos).
export const myFolders = [
  { id: "__all__", label: "Todas", img: "avatares/cards/empty_recetas_propias.jpg", count: 14 },
  { id: "dia_a_dia", label: "Día a día", img: "avatares/cards/comidas.jpg", count: 6 },
  { id: "ocasion_especial", label: "Ocasión especial", img: "categories/faceta_gourmet.webp", count: 3 },
  { id: "cena_rapida", label: "Cena rápida", img: "categories/faceta_rapido.webp", count: 4 },
  { id: "hijos", label: "Para mis hijos", img: "categories/faceta_ninos.webp", count: 5 },
  { id: "__discarded__", label: "Descartados", img: "avatares/cards/empty_descartes.jpg", count: 7, muted: true },
];
