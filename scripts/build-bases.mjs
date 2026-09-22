/**
 * build-bases.mjs
 *
 * Genera src/data/recipes/bases.json — el catálogo de BASES.
 *
 * Una base es lo que se cocina UNA VEZ y alimenta a varios platos de la
 * semana: una olla de arroz, una de legumbre, una bandeja de boniato. No es un
 * ingrediente (hay que cocinarla) ni un plato (nadie cena un táper de arroz),
 * y por eso vive donde ya vivía esa misma figura en este catálogo: como
 * receta off-menu con `type` propio, exactamente igual que las 28 salsas.
 *
 * ── Por qué hay siete y no ocho ────────────────────────────────────────────
 * Hay una base por cada valor de MAIN_BASES que algún plato marque como
 * `baseMode: "aparte"`. `pan` y `avena` no tienen base y no es un olvido: los
 * 83 platos de pan (Wellington, hamburguesas, tostas) y los 9 de avena están
 * todos marcados "dentro", así que no hay tanda que cocinar. La ausencia la
 * decide el dato, no una excepción escrita a mano — que era justo el punto.
 *
 * ── Por qué se generan y no se escriben a mano ─────────────────────────────
 * `steps` y `stepsRich` tienen que decir lo mismo (recipeSchema.js: "Kept in
 * sync with `steps`"), y mantener dos copias a mano es como se desincronizan.
 * Aquí solo se escribe el rico y el plano se deriva con la misma
 * `richToPlainSteps()` que usa el resto del sistema.
 *
 * Usage:  node scripts/build-bases.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { richToPlainSteps } from "../src/lib/recipeSteps.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "recipes", "bases.json");

/**
 * Los tiempos son el modelo AFÍN del que depende que esto ahorre algo:
 * `minutosFijos` es lo que cuesta aunque cocines una sola ración (hervir es
 * hervir) y `minutosPorRacion` lo poco que crece (pelar y cortar sí escala).
 * `capacidadMax` es cuántas raciones caben en una olla o una bandeja; por
 * encima hace falta otra tanda y el tiempo se suma entero.
 *
 * Los números no son de laboratorio: son los de una cocina de casa con una
 * olla grande y un horno normal. La legumbre es el caso que mejor enseña por
 * qué esto merece la pena — 55 min tanto para 2 raciones como para 16.
 */
const BASES = [
  {
    id: "bases_001",
    name: "Arroz blanco rehogado",
    mainBase: "arroz",
    rinde: { amount: 800, unit: "g" },
    time: 20, minutosFijos: 18, minutosPorRacion: 0.5, capacidadMax: 12,
    difficulty: "facil",
    kcal: 290, protein_g: 6, carbs_g: 55, fat_g: 6,
    fiber_g: 1, sugar_g: 0, saturated_fat_g: 1, sodium_mg: 480,
    freezable: true,
    allergens: [],
    ingredients: [
      { name: "Arroz", amount: 280, unit: "g" },
      { name: "Ajo", amount: 10, unit: "g" },
      { name: "Aceite de oliva virgen extra", amount: 20, unit: "ml" },
      { name: "Agua", amount: 560, unit: "ml" },
      { name: "Sal", amount: 5, unit: "g" },
    ],
    stepsRich: [
      { text: "Pelar y laminar {{Ajo}}.", minutes: 2, kind: "prep" },
      { text: "Calentar {{Aceite de oliva virgen extra}} en una {{@Cazuela}} y dorar el ajo a fuego suave.", minutes: 2, kind: "activo" },
      { text: "Añadir {{Arroz}} y rehogar removiendo hasta que el grano se vuelva translúcido.", minutes: 2, kind: "activo" },
      { text: "Verter {{Agua}} y {{Sal|gusto}}, subir el fuego y llevar a ebullición.", minutes: 2, kind: "activo" },
      { text: "Bajar el fuego, tapar y cocer sin destapar hasta que el grano esté suelto.", minutes: 16, kind: "pasivo" },
      { text: "Retirar del fuego, dejar reposar tapado y remover con un tenedor para soltar el grano.", minutes: 5, kind: "espera" },
      { text: "Extender en una bandeja para que enfríe rápido y repartir en táperes.", minutes: 3, kind: "emplatado" },
    ],
    thawSteps: [
      { text: "Sacar la ración del congelador y pasarla a un bol.", minutes: 1, kind: "prep" },
      { text: "Regar con una cucharada de agua y tapar el bol.", minutes: 1, kind: "activo" },
      { text: "Calentar en el microondas removiendo a mitad, hasta que el grano vuelva a estar suelto.", minutes: 3, kind: "activo" },
    ],
    description: "Arroz blanco rehogado con ajo, la base de una olla que da para varios platos de la semana.",
  },
  {
    id: "bases_002",
    name: "Pasta cocida al dente",
    mainBase: "pasta",
    rinde: { amount: 700, unit: "g" },
    time: 12, minutosFijos: 10, minutosPorRacion: 0.5, capacidadMax: 8,
    difficulty: "facil",
    kcal: 300, protein_g: 11, carbs_g: 60, fat_g: 3,
    fiber_g: 3, sugar_g: 2, saturated_fat_g: 0, sodium_mg: 520,
    freezable: false,
    allergens: ["gluten"],
    ingredients: [
      { name: "Pasta corta", amount: 320, unit: "g" },
      { name: "Agua", amount: 3000, unit: "ml" },
      { name: "Sal", amount: 30, unit: "g" },
      { name: "Aceite de oliva virgen extra", amount: 10, unit: "ml" },
    ],
    stepsRich: [
      { text: "Llevar {{Agua}} a ebullición en una {{@Olla}} grande y añadir {{Sal|gusto}}.", minutes: 8, kind: "pasivo" },
      { text: "Echar {{Pasta corta}} de golpe y remover para que no se pegue.", minutes: 1, kind: "activo" },
      { text: "Cocer un minuto MENOS de lo que diga el paquete: va a recalentarse después.", minutes: 9, kind: "pasivo" },
      { text: "Escurrir sin enjuagar y devolver a la olla.", minutes: 1, kind: "activo" },
      { text: "Remover con {{Aceite de oliva virgen extra}} para que no se apelmace al enfriar.", minutes: 1, kind: "activo" },
      { text: "Repartir en táperes y guardar en la nevera.", minutes: 2, kind: "emplatado" },
    ],
    description: "Pasta hervida un punto por debajo, lista para saltear con cualquier salsa de la semana.",
  },
  {
    id: "bases_003",
    name: "Patatas cocidas",
    mainBase: "patatas",
    rinde: { amount: 900, unit: "g" },
    time: 30, minutosFijos: 28, minutosPorRacion: 1, capacidadMax: 12,
    difficulty: "facil",
    kcal: 190, protein_g: 4, carbs_g: 43, fat_g: 0,
    fiber_g: 4, sugar_g: 2, saturated_fat_g: 0, sodium_mg: 380,
    freezable: false,
    allergens: [],
    ingredients: [
      { name: "Patata", amount: 1000, unit: "g" },
      { name: "Agua", amount: 2000, unit: "ml" },
      { name: "Sal", amount: 20, unit: "g" },
    ],
    stepsRich: [
      { text: "Lavar {{Patata}} y dejarlas enteras con piel: así no se aguan al cocer.", minutes: 3, kind: "prep" },
      { text: "Cubrir con {{Agua}} fría en una {{@Olla}}, añadir {{Sal|gusto}} y llevar a ebullición.", minutes: 8, kind: "pasivo" },
      { text: "Cocer hasta que un cuchillo entre sin resistencia en la más gorda.", minutes: 20, kind: "pasivo" },
      { text: "Escurrir y dejar templar lo justo para poder manipularlas.", minutes: 8, kind: "espera" },
      { text: "Pelar en caliente, que la piel sale sola, y trocear al tamaño que pida cada plato.", minutes: 6, kind: "activo" },
      { text: "Repartir en táperes y guardar en la nevera.", minutes: 2, kind: "emplatado" },
    ],
    description: "Patatas cocidas enteras con piel, la base de ensaladas, revueltos, purés y guarniciones.",
  },
  {
    id: "bases_004",
    name: "Legumbre cocida",
    mainBase: "legumbre",
    rinde: { amount: 1000, unit: "g" },
    time: 60, minutosFijos: 55, minutosPorRacion: 1, capacidadMax: 16,
    difficulty: "facil",
    kcal: 320, protein_g: 17, carbs_g: 50, fat_g: 5,
    fiber_g: 12, sugar_g: 3, saturated_fat_g: 1, sodium_mg: 300,
    freezable: true,
    allergens: [],
    ingredients: [
      { name: "Garbanzos secos", amount: 400, unit: "g" },
      { name: "Agua", amount: 2000, unit: "ml" },
      { name: "Laurel", amount: 1, unit: "ud" },
      { name: "Sal", amount: 10, unit: "g" },
    ],
    stepsRich: [
      { text: "Poner {{Garbanzos secos}} en remojo con agua abundante la noche anterior.", minutes: 5, kind: "prep" },
      { text: "Dejar reposar en remojo un mínimo de 8 h.", minutes: 480, kind: "espera" },
      { text: "Escurrir el remojo y pasar los garbanzos a una {{@Olla}}.", minutes: 2, kind: "activo" },
      { text: "Cubrir con {{Agua}} caliente, añadir {{Laurel}} y llevar a ebullición.", minutes: 8, kind: "activo" },
      { text: "Bajar el fuego y cocer a fuego lento hasta que estén tiernos, retirando la espuma.", minutes: 50, kind: "pasivo" },
      { text: "Añadir {{Sal|gusto}} al final de la cocción, nunca al principio, o la piel se endurece.", minutes: 1, kind: "activo" },
      { text: "Escurrir reservando el caldo aparte, que vale para sopas y guisos de la semana.", minutes: 3, kind: "activo" },
      { text: "Repartir en táperes con un poco de su caldo y guardar.", minutes: 3, kind: "emplatado" },
    ],
    thawSteps: [
      { text: "Sacar la ración del congelador a la nevera la noche anterior.", minutes: 2, kind: "prep" },
      { text: "Escurrir el caldo sobrante y pasar a un cazo.", minutes: 1, kind: "activo" },
      { text: "Calentar a fuego suave con un chorro de agua hasta que rompa a hervir.", minutes: 5, kind: "activo" },
    ],
    description: "Una olla de garbanzos o lentejas cocidos, con su caldo: la base de guisos, ensaladas y cremas.",
  },
  {
    id: "bases_005",
    name: "Quinoa cocida",
    mainBase: "quinoa",
    rinde: { amount: 700, unit: "g" },
    time: 20, minutosFijos: 18, minutosPorRacion: 0.5, capacidadMax: 8,
    difficulty: "facil",
    kcal: 220, protein_g: 8, carbs_g: 39, fat_g: 4,
    fiber_g: 5, sugar_g: 1, saturated_fat_g: 0, sodium_mg: 300,
    freezable: true,
    allergens: [],
    ingredients: [
      { name: "Quinoa", amount: 240, unit: "g" },
      { name: "Agua", amount: 480, unit: "ml" },
      { name: "Sal", amount: 5, unit: "g" },
    ],
    stepsRich: [
      { text: "Enjuagar {{Quinoa}} bajo el grifo en un colador fino hasta que el agua salga clara.", minutes: 3, kind: "prep" },
      { text: "Pasar a un {{@Cazo}} con {{Agua}} y {{Sal|gusto}} y llevar a ebullición.", minutes: 4, kind: "activo" },
      { text: "Tapar, bajar el fuego y cocer hasta que el grano abra su germen en espiral.", minutes: 14, kind: "pasivo" },
      { text: "Retirar del fuego y dejar reposar tapada.", minutes: 5, kind: "espera" },
      { text: "Soltar el grano con un tenedor y repartir en táperes.", minutes: 3, kind: "emplatado" },
    ],
    thawSteps: [
      { text: "Sacar la ración del congelador y pasarla a un bol tapado.", minutes: 1, kind: "prep" },
      { text: "Calentar en el microondas removiendo a mitad, hasta que esté caliente.", minutes: 3, kind: "activo" },
    ],
    description: "Quinoa enjuagada y cocida, lista para bowls, ensaladas y rellenos.",
  },
  {
    id: "bases_006",
    name: "Cuscús hidratado",
    mainBase: "cuscus",
    rinde: { amount: 600, unit: "g" },
    time: 8, minutosFijos: 6, minutosPorRacion: 0.3, capacidadMax: 10,
    difficulty: "facil",
    kcal: 220, protein_g: 7, carbs_g: 45, fat_g: 2,
    fiber_g: 3, sugar_g: 0, saturated_fat_g: 0, sodium_mg: 320,
    freezable: false,
    allergens: ["gluten"],
    ingredients: [
      { name: "Cuscús", amount: 240, unit: "g" },
      { name: "Agua", amount: 260, unit: "ml" },
      { name: "Aceite de oliva virgen extra", amount: 15, unit: "ml" },
      { name: "Sal", amount: 4, unit: "g" },
    ],
    stepsRich: [
      { text: "Poner {{Cuscús}} en un bol amplio con {{Sal|gusto}}.", minutes: 1, kind: "prep" },
      { text: "Calentar {{Agua}} hasta que hierva y verterla sobre el cuscús.", minutes: 3, kind: "activo" },
      { text: "Tapar el bol y dejar que absorba sin tocarlo.", minutes: 5, kind: "espera" },
      { text: "Añadir {{Aceite de oliva virgen extra}} y soltar el grano con un tenedor.", minutes: 2, kind: "activo" },
      { text: "Repartir en táperes y guardar en la nevera.", minutes: 2, kind: "emplatado" },
    ],
    description: "Cuscús hidratado y suelto, la base más rápida de todas: cinco minutos y está.",
  },
  {
    id: "bases_007",
    name: "Boniato asado",
    mainBase: "boniato",
    rinde: { amount: 800, unit: "g" },
    time: 45, minutosFijos: 42, minutosPorRacion: 1, capacidadMax: 8,
    difficulty: "facil",
    kcal: 200, protein_g: 3, carbs_g: 45, fat_g: 2,
    fiber_g: 6, sugar_g: 12, saturated_fat_g: 0, sodium_mg: 220,
    freezable: true,
    allergens: [],
    ingredients: [
      { name: "Boniato", amount: 1000, unit: "g" },
      { name: "Aceite de oliva virgen extra", amount: 20, unit: "ml" },
      { name: "Sal", amount: 5, unit: "g" },
    ],
    stepsRich: [
      { text: "Precalentar el {{@Horno}} a 200 grados.", minutes: 10, kind: "pasivo" },
      { text: "Lavar {{Boniato}} y pincharlos varias veces con un tenedor.", minutes: 4, kind: "prep" },
      { text: "Untar con {{Aceite de oliva virgen extra}} y {{Sal|gusto}} y colocar en una bandeja.", minutes: 3, kind: "activo" },
      { text: "Asar hasta que estén blandos por dentro y la piel arrugada.", minutes: 40, kind: "pasivo" },
      { text: "Dejar templar antes de manipular.", minutes: 10, kind: "espera" },
      { text: "Pelar, trocear y repartir en táperes.", minutes: 5, kind: "emplatado" },
    ],
    thawSteps: [
      { text: "Sacar la ración del congelador a la nevera la noche anterior.", minutes: 2, kind: "prep" },
      { text: "Calentar en el horno o en una sartén hasta que vuelva a dorarse por fuera.", minutes: 8, kind: "activo" },
    ],
    description: "Boniato asado entero al horno, dulce y listo para bowls, purés y guarniciones.",
  },
];

const out = BASES.map((b) => ({
  id: b.id,
  name: b.name,
  category: "bases",
  mainProtein: "none",
  mainBase: b.mainBase,
  mealRole: ["base"],
  type: "base",
  rinde: b.rinde,
  time: b.time,
  minutosFijos: b.minutosFijos,
  minutosPorRacion: b.minutosPorRacion,
  capacidadMax: b.capacidadMax,
  difficulty: b.difficulty,
  kcal: b.kcal,
  protein_g: b.protein_g,
  carbs_g: b.carbs_g,
  fat_g: b.fat_g,
  fiber_g: b.fiber_g,
  sugar_g: b.sugar_g,
  saturated_fat_g: b.saturated_fat_g,
  sodium_mg: b.sodium_mg,
  baseServings: 4,
  kidFriendly: true,
  tupperFriendly: true,
  freezable: b.freezable,
  allergens: b.allergens,
  season: "all",
  ingredients: b.ingredients,
  steps: richToPlainSteps(b.stepsRich),
  description: b.description,
  stepsRich: b.stepsRich,
  ...(b.thawSteps ? { thawSteps: b.thawSteps } : {}),
}));

writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`${out.length} bases escritas en src/data/recipes/bases.json`);
for (const b of out) {
  console.log(`  ${b.id}  ${b.name.padEnd(24)} ${b.mainBase.padEnd(9)} rinde ${b.rinde.amount}${b.rinde.unit}  ${b.minutosFijos}min fijos + ${b.minutosPorRacion}/ración (máx ${b.capacidadMax})`);
}
