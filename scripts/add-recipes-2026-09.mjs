/**
 * add-recipes-2026-09.mjs
 *
 * Alta de las 16 recetas que el informe de cobertura (scripts/axis-coverage.mjs)
 * señaló como necesarias: 9 mexicanas y 7 asiáticas.
 *
 * ── Por qué estas y no otras ──────────────────────────────────────────────
 * El informe no dice "faltan recetas", dice para qué NO daba el catálogo. Y
 * los dos huecos no eran solo de número:
 *
 *  · Mexicana tenía 6 y una sola de primero: todo caía en cena o plato único.
 *    Cinco de las nueve nuevas son primeros.
 *  · Asiática tenía 8, pero CUATRO eran salmón o atún con teriyaki. Con esa
 *    concentración, la regla de no repetir proteína bloquea media semana en
 *    cuanto alguien pide "algo asiático". Las siete nuevas traen pollo, cerdo,
 *    ternera, huevo, legumbre y tofu.
 *
 * Todas nacen con `estrella: true`. Sin ese flag se quedan en el fondo de
 * armario y el generador no las ve nunca (isPrimaryCatalog en
 * utils/filterRecipes.js), así que el hueco seguiría abierto con las recetas
 * ya escritas — que es la forma más tonta de no arreglar nada.
 *
 * Los demás ejes (tecnica, cocina, mainIngredients, kidFavourite…) NO se
 * escriben aquí: los ponen sus scripts, que es donde vive esa lógica. Este
 * fichero solo trae el plato.
 *
 * Uso:
 *   node scripts/add-recipes-2026-09.mjs           (informe)
 *   node scripts/add-recipes-2026-09.mjs --write   (aplica)
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");

const base = {
  type: "principal",
  season: "all",
  baseServings: 2,
  estrella: true,
};

const RECETAS = [
  // ── Mexicanas ───────────────────────────────────────────────────────────
  {
    file: "sopas_cremas", id: "sopas_cremas_087",
    name: "Sopa de tortilla con aguacate y crema",
    category: "sopas_cremas", mainProtein: "none", mealRole: ["primero"],
    type: "completo", time: 30, difficulty: "facil",
    kcal: 310, protein_g: 8, carbs_g: 32, fat_g: 17,
    kidFriendly: true, tupperFriendly: true, allergens: ["lactosa"],
    ingredients: [
      { name: "Tortillas de maíz", amount: 4, unit: "ud" },
      { name: "Tomate maduro", amount: 400, unit: "g" },
      { name: "Cebolla", amount: 80, unit: "g" },
      { name: "Ajo", amount: 10, unit: "g" },
      { name: "Caldo de pollo", amount: 600, unit: "ml" },
      { name: "Aguacate", amount: 1, unit: "ud" },
      { name: "Queso crema", amount: 60, unit: "g" },
      { name: "Cilantro fresco", amount: 10, unit: "g" },
      { name: "Aceite de oliva", amount: 30, unit: "ml" },
      { name: "Sal", amount: 3, unit: "g" },
    ],
    steps: [
      "Cortar las tortillas en tiras finas y freírlas en el aceite hasta que estén doradas y crujientes. Reservar sobre papel absorbente.",
      "En la misma cazuela, pochar la cebolla y el ajo picados hasta que estén transparentes.",
      "Añadir el tomate troceado y cocinar 10 minutos, aplastándolo con la cuchara.",
      "Triturar el sofrito y devolverlo a la cazuela con el caldo. Cocer 10 minutos a fuego suave y salar.",
      "Servir la sopa bien caliente con las tiras de tortilla por encima.",
      "Coronar con el aguacate en dados, una cucharada de queso crema y el cilantro picado.",
    ],
    description: "La sopa mexicana de siempre: caldo de tomate suave, tiras de tortilla crujientes por encima y el contraste fresco del aguacate y la crema.",
  },
  {
    file: "legumbres", id: "legumbres_074",
    name: "Frijoles charros con chorizo y bacon",
    category: "legumbres", mainProtein: "legumbre", extraProteins: ["cerdo"],
    mealRole: ["primero", "plato_unico"],
    type: "completo", time: 35, difficulty: "facil",
    kcal: 430, protein_g: 22, carbs_g: 38, fat_g: 21,
    kidFriendly: true, tupperFriendly: true, allergens: [],
    ingredients: [
      { name: "Frijoles negros cocidos", amount: 400, unit: "g" },
      { name: "Chorizo", amount: 80, unit: "g" },
      { name: "Bacon en lonchas", amount: 60, unit: "g" },
      { name: "Cebolla", amount: 100, unit: "g" },
      { name: "Tomate maduro", amount: 150, unit: "g" },
      { name: "Ajo", amount: 10, unit: "g" },
      { name: "Caldo de carne", amount: 250, unit: "ml" },
      { name: "Cilantro fresco", amount: 10, unit: "g" },
      { name: "Aceite de oliva", amount: 15, unit: "ml" },
    ],
    steps: [
      "Dorar el bacon y el chorizo en dados en una cazuela con el aceite, hasta que suelten su grasa.",
      "Añadir la cebolla y el ajo picados y pochar 5 minutos.",
      "Incorporar el tomate troceado y cocinar otros 5 minutos.",
      "Agregar los frijoles escurridos y el caldo. Cocer 15 minutos a fuego suave, hasta que espese.",
      "Rectificar de sal y servir con el cilantro picado por encima.",
    ],
    description: "Frijoles guisados con chorizo y bacon, caldosos y con mucho fondo. De cuchara, de las que saben mejor al día siguiente.",
  },
  {
    file: "ensaladas_verduras", id: "ensaladas_verduras_124",
    name: "Ensalada de maíz, aguacate y lima con cilantro",
    category: "ensaladas_verduras", mainProtein: "none", mealRole: ["primero", "cena"],
    type: "completo", time: 10, difficulty: "facil",
    kcal: 260, protein_g: 5, carbs_g: 24, fat_g: 16,
    kidFriendly: true, tupperFriendly: false, allergens: [],
    ingredients: [
      { name: "Maíz", amount: 250, unit: "g" },
      { name: "Aguacate", amount: 1, unit: "ud" },
      { name: "Tomate cherry", amount: 150, unit: "g" },
      { name: "Cebolla morada", amount: 50, unit: "g" },
      { name: "Lima", amount: 1, unit: "ud" },
      { name: "Cilantro fresco", amount: 10, unit: "g" },
      { name: "Aceite de oliva", amount: 20, unit: "ml" },
      { name: "Sal", amount: 2, unit: "g" },
    ],
    steps: [
      "Escurrir bien el maíz y ponerlo en una ensaladera.",
      "Cortar el aguacate en dados y los cherries por la mitad. Picar la cebolla morada muy fina.",
      "Mezclarlo todo con cuidado para no deshacer el aguacate.",
      "Aliñar con el zumo de la lima, el aceite y la sal, y terminar con el cilantro picado.",
    ],
    description: "Fresca, crujiente y sin encender el fuego. El maíz dulce y la lima hacen que se coma sola.",
  },
  {
    file: "sopas_cremas", id: "sopas_cremas_088",
    name: "Crema de calabaza con chile y cacahuetes tostados",
    category: "sopas_cremas", mainProtein: "none", mealRole: ["primero", "cena"],
    type: "completo", time: 35, difficulty: "facil",
    kcal: 280, protein_g: 8, carbs_g: 26, fat_g: 16,
    kidFriendly: false, tupperFriendly: true, allergens: ["cacahuetes"],
    ingredients: [
      { name: "Calabaza", amount: 600, unit: "g" },
      { name: "Cebolla", amount: 100, unit: "g" },
      { name: "Ajo", amount: 10, unit: "g" },
      { name: "Chile fresco", amount: 5, unit: "g" },
      { name: "Caldo de verduras", amount: 500, unit: "ml" },
      { name: "Cacahuetes tostados", amount: 40, unit: "g" },
      { name: "Aceite de oliva", amount: 20, unit: "ml" },
      { name: "Sal", amount: 3, unit: "g" },
    ],
    steps: [
      "Pochar la cebolla y el ajo picados en el aceite, a fuego suave, hasta que estén transparentes.",
      "Añadir la calabaza en dados y el chile sin semillas, muy picado. Rehogar 5 minutos.",
      "Cubrir con el caldo y cocer 20 minutos, hasta que la calabaza esté muy tierna.",
      "Triturar hasta que quede fina y rectificar de sal.",
      "Servir con los cacahuetes picados por encima, que es lo que le da el crujiente.",
    ],
    description: "Dulce por la calabaza, con un punto justo de picante y el crujido de los cacahuetes. Una crema que no aburre.",
  },
  {
    file: "huevos", id: "huevos_090",
    name: "Chiles rellenos de queso con salsa de tomate asado",
    category: "huevos", mainProtein: "huevo", mealRole: ["primero", "segundo"],
    type: "principal", time: 40, difficulty: "normal",
    kcal: 480, protein_g: 22, carbs_g: 22, fat_g: 34,
    kidFriendly: false, tupperFriendly: true, allergens: ["huevo", "lactosa", "gluten"],
    ingredients: [
      { name: "Pimiento verde", amount: 4, unit: "ud" },
      { name: "Queso fresco", amount: 200, unit: "g" },
      { name: "Huevo", amount: 3, unit: "ud" },
      { name: "Harina", amount: 60, unit: "g" },
      { name: "Tomate maduro", amount: 400, unit: "g" },
      { name: "Cebolla", amount: 80, unit: "g" },
      { name: "Ajo", amount: 10, unit: "g" },
      { name: "Aceite de oliva", amount: 80, unit: "ml" },
      { name: "Sal", amount: 3, unit: "g" },
    ],
    steps: [
      "Asar los pimientos hasta que la piel se ampolle, taparlos 10 minutos y pelarlos.",
      "Abrirlos con cuidado por un lado, retirar las semillas y rellenarlos con el queso en bastones.",
      "Asar el tomate con la cebolla y el ajo, triturar y colar. Salar: esa es la salsa.",
      "Separar las claras y montarlas a punto de nieve. Incorporar las yemas con movimientos suaves.",
      "Pasar los chiles por harina y luego por el huevo montado.",
      "Freír en aceite caliente hasta que estén dorados y escurrir sobre papel.",
      "Servir sobre la salsa de tomate bien caliente.",
    ],
    description: "Pimientos asados y rellenos de queso, rebozados en huevo montado y servidos sobre una salsa de tomate asado. Un clásico que impresiona.",
  },
  {
    file: "carnes", id: "carnes_157",
    name: "Cochinita pibil con cebolla roja encurtida",
    category: "carnes", mainProtein: "cerdo", mealRole: ["segundo", "plato_unico"],
    type: "principal", time: 150, difficulty: "normal",
    kcal: 560, protein_g: 42, carbs_g: 14, fat_g: 36,
    kidFriendly: false, tupperFriendly: true, allergens: [],
    ingredients: [
      { name: "Lomo de cerdo en filetes", amount: 600, unit: "g" },
      { name: "Naranja", amount: 2, unit: "ud" },
      { name: "Lima", amount: 1, unit: "ud" },
      { name: "Pimentón dulce", amount: 10, unit: "g" },
      { name: "Ajo", amount: 15, unit: "g" },
      { name: "Cebolla morada", amount: 150, unit: "g" },
      { name: "Vinagre de vino", amount: 60, unit: "ml" },
      { name: "Orégano", amount: 3, unit: "g" },
      { name: "Aceite de oliva", amount: 20, unit: "ml" },
      { name: "Sal", amount: 5, unit: "g" },
    ],
    steps: [
      "Triturar el zumo de las naranjas y la lima con el ajo, el pimentón, el orégano y la sal.",
      "Cubrir la carne con ese adobo y dejarla reposar al menos 1 hora en la nevera.",
      "Hornear tapada a 160 °C durante 2 horas, hasta que se deshaga con el tenedor.",
      "Mientras, cortar la cebolla morada en juliana fina y cubrirla con el vinagre y una pizca de sal. Reservar 30 minutos.",
      "Desmenuzar la carne con dos tenedores y mezclarla con su propio jugo.",
      "Servir con la cebolla encurtida por encima.",
    ],
    description: "Cerdo adobado en cítricos y pimentón, hecho al horno hasta que se deshace. La cebolla encurtida corta la grasa y lo levanta todo.",
  },
  {
    file: "pasta_arroces", id: "pasta_arroces_100",
    name: "Tinga de pollo con arroz blanco y aguacate",
    category: "pasta_arroces", mainProtein: "pollo", mealRole: ["plato_unico", "cena"],
    type: "completo", time: 40, difficulty: "facil",
    kcal: 590, protein_g: 38, carbs_g: 58, fat_g: 22,
    kidFriendly: false, tupperFriendly: true, allergens: [],
    ingredients: [
      { name: "Pechuga de pollo", amount: 400, unit: "g" },
      { name: "Arroz", amount: 160, unit: "g" },
      { name: "Tomate maduro", amount: 300, unit: "g" },
      { name: "Cebolla", amount: 150, unit: "g" },
      { name: "Chile fresco", amount: 5, unit: "g" },
      { name: "Ajo", amount: 10, unit: "g" },
      { name: "Aguacate", amount: 1, unit: "ud" },
      { name: "Aceite de oliva", amount: 25, unit: "ml" },
      { name: "Sal", amount: 4, unit: "g" },
    ],
    steps: [
      "Cocer la pechuga en agua con sal 20 minutos y desmenuzarla con dos tenedores.",
      "Cocer el arroz en agua con sal el tiempo que indique el paquete y escurrir.",
      "Pochar la cebolla en juliana con el ajo hasta que empiece a dorarse.",
      "Triturar el tomate con el chile y añadirlo a la sartén. Cocinar 10 minutos.",
      "Incorporar el pollo desmenuzado y dejar que coja la salsa 5 minutos más.",
      "Servir sobre el arroz blanco, con el aguacate en láminas al lado.",
    ],
    description: "Pollo deshebrado en salsa de tomate ahumada sobre arroz blanco. De esos platos que se hacen una vez y se repiten toda la semana.",
  },
  {
    file: "pescados", id: "pescados_129",
    name: "Merluza a la veracruzana con aceitunas y alcaparras",
    category: "pescados", mainProtein: "pescado_blanco", mealRole: ["segundo"],
    type: "principal", time: 30, difficulty: "facil",
    kcal: 380, protein_g: 36, carbs_g: 12, fat_g: 21,
    kidFriendly: false, tupperFriendly: true, allergens: ["pescado"],
    ingredients: [
      { name: "Merluza en lomos", amount: 500, unit: "g" },
      { name: "Tomate maduro", amount: 400, unit: "g" },
      { name: "Cebolla", amount: 100, unit: "g" },
      { name: "Ajo", amount: 10, unit: "g" },
      { name: "Aceitunas", amount: 60, unit: "g" },
      { name: "Alcaparras", amount: 20, unit: "g" },
      { name: "Laurel", amount: 1, unit: "ud" },
      { name: "Aceite de oliva", amount: 30, unit: "ml" },
      { name: "Sal", amount: 3, unit: "g" },
    ],
    steps: [
      "Pochar la cebolla en juliana y el ajo picado en el aceite, sin que cojan color.",
      "Añadir el tomate rallado y el laurel, y cocinar 12 minutos a fuego medio.",
      "Incorporar las aceitunas y las alcaparras escurridas. Salar con cuidado, que ya salan ellas.",
      "Colocar los lomos de merluza sobre la salsa, tapar y cocer 8 minutos a fuego suave.",
      "Servir el pescado con su salsa por encima.",
    ],
    description: "Merluza cocinada en una salsa de tomate con aceitunas y alcaparras. El punto salado de los encurtidos es lo que la hace distinta.",
  },
  {
    file: "carnes", id: "carnes_158",
    name: "Fajitas de ternera con pimientos y guacamole",
    category: "carnes", mainProtein: "ternera", mealRole: ["segundo", "plato_unico", "cena"],
    type: "completo", time: 30, difficulty: "facil",
    kcal: 620, protein_g: 40, carbs_g: 46, fat_g: 30,
    kidFriendly: true, tupperFriendly: false, allergens: ["gluten"],
    ingredients: [
      { name: "Filetes finos de ternera", amount: 400, unit: "g" },
      { name: "Tortillas de trigo", amount: 4, unit: "ud" },
      { name: "Pimiento rojo", amount: 1, unit: "ud" },
      { name: "Pimiento verde", amount: 1, unit: "ud" },
      { name: "Cebolla", amount: 120, unit: "g" },
      { name: "Aguacate", amount: 1, unit: "ud" },
      { name: "Lima", amount: 1, unit: "ud" },
      { name: "Pimentón dulce", amount: 5, unit: "g" },
      { name: "Aceite de oliva", amount: 25, unit: "ml" },
      { name: "Sal", amount: 4, unit: "g" },
    ],
    steps: [
      "Cortar la ternera en tiras finas y salpimentar con el pimentón.",
      "Cortar los pimientos y la cebolla en tiras del mismo grosor.",
      "Saltear la verdura a fuego fuerte 5 minutos, que quede al dente, y reservar.",
      "En la misma sartén, marcar la carne 2-3 minutos sin moverla mucho, y juntarla con la verdura.",
      "Machacar el aguacate con el zumo de lima y una pizca de sal: ese es el guacamole.",
      "Calentar las tortillas y servir todo en el centro de la mesa, para montarlas al momento.",
    ],
    description: "Ternera y pimientos salteados a fuego fuerte para montar en la mesa. Cena de las que gustan a todos y se hace en media hora.",
  },

  // ── Asiáticas ───────────────────────────────────────────────────────────
  {
    file: "sopas_cremas", id: "sopas_cremas_089",
    name: "Sopa miso con tofu y cebolleta",
    category: "sopas_cremas", mainProtein: "none", mealRole: ["primero", "cena"],
    type: "completo", time: 15, difficulty: "facil",
    kcal: 180, protein_g: 12, carbs_g: 10, fat_g: 9,
    kidFriendly: false, tupperFriendly: true, allergens: ["soja"],
    ingredients: [
      { name: "Miso", amount: 40, unit: "g" },
      { name: "Tofu firme", amount: 200, unit: "g" },
      { name: "Cebolleta", amount: 60, unit: "g" },
      { name: "Caldo de verduras", amount: 700, unit: "ml" },
      { name: "Salsa de soja", amount: 10, unit: "ml" },
      { name: "Aceite de sésamo", amount: 5, unit: "ml" },
    ],
    steps: [
      "Calentar el caldo sin que llegue a hervir: el miso no debe cocer o pierde el aroma.",
      "Disolver el miso en un cazo con un poco de ese caldo caliente, hasta que no queden grumos.",
      "Devolverlo a la olla y añadir la salsa de soja.",
      "Cortar el tofu en dados y añadirlo. Dejar 3 minutos para que se caliente.",
      "Servir con la cebolleta en aros finos y unas gotas de aceite de sésamo.",
    ],
    description: "Ligera, salada y reconfortante. Quince minutos y una cena que sienta bien.",
  },
  {
    file: "legumbres", id: "legumbres_075",
    name: "Curry rojo de garbanzos y calabaza con leche de coco",
    category: "legumbres", mainProtein: "legumbre", mealRole: ["primero", "plato_unico"],
    type: "completo", time: 35, difficulty: "facil",
    kcal: 470, protein_g: 16, carbs_g: 46, fat_g: 25,
    kidFriendly: false, tupperFriendly: true, allergens: [],
    ingredients: [
      { name: "Garbanzos cocidos", amount: 400, unit: "g" },
      { name: "Calabaza", amount: 300, unit: "g" },
      { name: "Leche de coco", amount: 250, unit: "ml" },
      { name: "Cebolla", amount: 100, unit: "g" },
      { name: "Ajo", amount: 10, unit: "g" },
      { name: "Jengibre fresco", amount: 10, unit: "g" },
      { name: "Curry en polvo", amount: 12, unit: "g" },
      { name: "Cilantro fresco", amount: 10, unit: "g" },
      { name: "Aceite de oliva", amount: 20, unit: "ml" },
      { name: "Sal", amount: 3, unit: "g" },
    ],
    steps: [
      "Pochar la cebolla, el ajo y el jengibre picados en el aceite, 5 minutos.",
      "Añadir el curry y tostarlo 30 segundos, removiendo, para que suelte el aroma.",
      "Incorporar la calabaza en dados y la leche de coco. Cocer 15 minutos tapado.",
      "Agregar los garbanzos escurridos y cocer 8 minutos más, hasta que espese.",
      "Rectificar de sal y servir con el cilantro picado.",
    ],
    description: "Cremoso por el coco y dulce por la calabaza, con los garbanzos aguantando el tipo. Un plato único que llena de verdad.",
  },
  {
    file: "ensaladas_verduras", id: "ensaladas_verduras_125",
    name: "Ensalada de col y zanahoria con aliño de sésamo y lima",
    category: "ensaladas_verduras", mainProtein: "none", mealRole: ["primero", "cena"],
    type: "completo", time: 15, difficulty: "facil",
    kcal: 210, protein_g: 5, carbs_g: 18, fat_g: 13,
    kidFriendly: true, tupperFriendly: true, allergens: ["sesamo", "soja"],
    ingredients: [
      { name: "Col china", amount: 300, unit: "g" },
      { name: "Zanahoria", amount: 150, unit: "g" },
      { name: "Cebolleta", amount: 50, unit: "g" },
      { name: "Semillas de sésamo", amount: 15, unit: "g" },
      { name: "Aceite de sésamo", amount: 15, unit: "ml" },
      { name: "Salsa de soja", amount: 20, unit: "ml" },
      { name: "Lima", amount: 1, unit: "ud" },
      { name: "Miel", amount: 10, unit: "g" },
    ],
    steps: [
      "Cortar la col en juliana muy fina y rallar la zanahoria en tiras largas.",
      "Batir el aceite de sésamo con la salsa de soja, el zumo de lima y la miel.",
      "Mezclar la verdura con el aliño y dejar reposar 10 minutos, para que ablande un poco.",
      "Servir con las semillas de sésamo tostadas y la cebolleta en aros.",
    ],
    description: "Crujiente y con un aliño que engancha: sésamo, soja y lima. Acompaña cualquier cosa y se hace en un momento.",
  },
  {
    file: "pasta_arroces", id: "pasta_arroces_101",
    name: "Pollo agridulce con arroz jazmín",
    category: "pasta_arroces", mainProtein: "pollo", mealRole: ["plato_unico", "cena"],
    type: "completo", time: 35, difficulty: "facil",
    kcal: 610, protein_g: 40, carbs_g: 68, fat_g: 18,
    kidFriendly: true, tupperFriendly: true, allergens: ["soja", "gluten"],
    ingredients: [
      { name: "Pechuga de pollo", amount: 400, unit: "g" },
      { name: "Arroz", amount: 160, unit: "g" },
      { name: "Pimiento rojo", amount: 1, unit: "ud" },
      { name: "Cebolla", amount: 100, unit: "g" },
      { name: "Tomate triturado", amount: 100, unit: "ml" },
      { name: "Vinagre de vino", amount: 25, unit: "ml" },
      { name: "Azúcar", amount: 25, unit: "g" },
      { name: "Salsa de soja", amount: 20, unit: "ml" },
      { name: "Maicena", amount: 15, unit: "g" },
      { name: "Aceite de girasol", amount: 40, unit: "ml" },
    ],
    steps: [
      "Cocer el arroz en agua con sal y reservarlo tapado.",
      "Cortar el pollo en dados, pasarlos por la maicena y freírlos hasta que estén dorados. Reservar.",
      "Saltear el pimiento y la cebolla en tiras 5 minutos, a fuego fuerte.",
      "Añadir el tomate, el vinagre, el azúcar y la soja. Cocer 5 minutos hasta que la salsa brille y espese.",
      "Devolver el pollo a la sartén y darle un par de vueltas para que se glasee.",
      "Servir sobre el arroz.",
    ],
    description: "El agridulce de toda la vida, hecho en casa y sin colorantes. El pollo crujiente por fuera y la salsa brillante son la mitad del plato.",
  },
  {
    file: "carnes", id: "carnes_159",
    name: "Cerdo a la naranja con sésamo tostado",
    category: "carnes", mainProtein: "cerdo", mealRole: ["segundo", "cena"],
    type: "principal", time: 25, difficulty: "facil",
    kcal: 470, protein_g: 38, carbs_g: 22, fat_g: 25,
    kidFriendly: true, tupperFriendly: true, allergens: ["sesamo", "soja"],
    ingredients: [
      { name: "Lomo de cerdo en filetes", amount: 450, unit: "g" },
      { name: "Naranja", amount: 2, unit: "ud" },
      { name: "Salsa de soja", amount: 30, unit: "ml" },
      { name: "Miel", amount: 20, unit: "g" },
      { name: "Jengibre fresco", amount: 10, unit: "g" },
      { name: "Ajo", amount: 10, unit: "g" },
      { name: "Semillas de sésamo", amount: 15, unit: "g" },
      { name: "Aceite de girasol", amount: 20, unit: "ml" },
    ],
    steps: [
      "Cortar el lomo en tiras y marcarlas a fuego fuerte en el aceite, sin moverlas, hasta que doren.",
      "Retirar la carne y en la misma sartén sofreír el ajo y el jengibre picados 30 segundos.",
      "Añadir el zumo de las naranjas, la soja y la miel. Reducir 5 minutos hasta que la salsa napa.",
      "Devolver la carne y darle vueltas para que se glasee bien.",
      "Tostar el sésamo en una sartén seca y espolvorearlo por encima al servir.",
    ],
    description: "Tiras de lomo glaseadas en una salsa de naranja y soja que brilla. Veinticinco minutos y parece de restaurante.",
  },
  {
    file: "pasta_arroces", id: "pasta_arroces_102",
    name: "Arroz frito tres delicias con huevo y guisantes",
    category: "pasta_arroces", mainProtein: "huevo", extraProteins: ["cerdo"],
    mealRole: ["plato_unico", "cena"],
    type: "completo", time: 25, difficulty: "facil",
    kcal: 540, protein_g: 22, carbs_g: 66, fat_g: 20,
    kidFriendly: true, tupperFriendly: true, allergens: ["huevo", "soja"],
    ingredients: [
      { name: "Arroz", amount: 180, unit: "g" },
      { name: "Huevo", amount: 3, unit: "ud" },
      { name: "Guisantes", amount: 120, unit: "g" },
      { name: "Jamón cocido", amount: 100, unit: "g" },
      { name: "Zanahoria", amount: 100, unit: "g" },
      { name: "Cebolleta", amount: 50, unit: "g" },
      { name: "Salsa de soja", amount: 25, unit: "ml" },
      { name: "Aceite de girasol", amount: 30, unit: "ml" },
    ],
    steps: [
      "Cocer el arroz, escurrirlo y extenderlo en una bandeja para que se enfríe y se suelte.",
      "Batir los huevos y cuajarlos en tortilla fina. Cortarla en tiras y reservar.",
      "Saltear la zanahoria en dados pequeños y los guisantes 5 minutos a fuego fuerte.",
      "Añadir el jamón en dados y dar un par de vueltas.",
      "Incorporar el arroz frío y saltear removiendo, para que se tueste sin apelmazarse.",
      "Agregar la tortilla en tiras y la salsa de soja, mezclar y terminar con la cebolleta.",
    ],
    description: "El arroz tres delicias de casa, con el truco de siempre: el arroz del día anterior, bien frío, es lo que hace que quede suelto.",
  },
  {
    file: "carnes", id: "carnes_160",
    name: "Salteado de ternera con brócoli y jengibre",
    category: "carnes", mainProtein: "ternera", mealRole: ["segundo", "cena"],
    type: "principal", time: 20, difficulty: "facil",
    kcal: 420, protein_g: 40, carbs_g: 14, fat_g: 22,
    kidFriendly: false, tupperFriendly: true, allergens: ["soja", "sesamo"],
    ingredients: [
      { name: "Filetes finos de ternera", amount: 400, unit: "g" },
      { name: "Brócoli", amount: 300, unit: "g" },
      { name: "Jengibre fresco", amount: 15, unit: "g" },
      { name: "Ajo", amount: 10, unit: "g" },
      { name: "Salsa de soja", amount: 30, unit: "ml" },
      { name: "Aceite de sésamo", amount: 10, unit: "ml" },
      { name: "Aceite de girasol", amount: 20, unit: "ml" },
      { name: "Semillas de sésamo", amount: 10, unit: "g" },
    ],
    steps: [
      "Separar el brócoli en ramilletes y escaldarlo 3 minutos en agua hirviendo. Escurrir bien.",
      "Cortar la ternera en tiras muy finas contra la fibra.",
      "Calentar el aceite de girasol hasta que humee y marcar la carne 2 minutos, sin removerla al principio.",
      "Añadir el ajo y el jengibre picados y saltear 30 segundos.",
      "Incorporar el brócoli y la salsa de soja, y saltear 2 minutos más a fuego fuerte.",
      "Terminar fuera del fuego con el aceite de sésamo y las semillas.",
    ],
    description: "Salteado rápido de sartén muy caliente: la ternera jugosa y el brócoli con su punto. Veinte minutos de principio a fin.",
  },
];

// ── Aplicación ────────────────────────────────────────────────────────────
const write = process.argv.includes("--write");
const porFichero = {};
for (const receta of RECETAS) {
  const { file, ...resto } = receta;
  (porFichero[file] = porFichero[file] ?? []).push({ ...base, ...resto });
}

let añadidas = 0;
for (const [file, nuevas] of Object.entries(porFichero)) {
  const path = join(RECIPES_DIR, `${file}.json`);
  const actuales = JSON.parse(readFileSync(path, "utf8"));
  const ids = new Set(actuales.map((r) => r.id));
  const pendientes = nuevas.filter((r) => !ids.has(r.id));
  for (const r of pendientes) {
    console.log(`  ${file.padEnd(20)} ${r.id.padEnd(24)} ${r.name}`);
    añadidas++;
  }
  if (write && pendientes.length > 0) {
    writeFileSync(path, JSON.stringify([...actuales, ...pendientes], null, 2) + "\n", "utf8");
  }
}

console.log(`\n${añadidas} recetas ${write ? "añadidas" : "por añadir"}.`);
console.log(write ? "✅ Escrito." : "(informe: nada escrito — pasa --write para aplicar)");
