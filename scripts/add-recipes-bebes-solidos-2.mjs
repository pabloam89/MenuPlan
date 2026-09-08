/**
 * add-recipes-bebes-solidos-2.mjs
 *
 * Segunda tanda: 20 recetas más para la etapa `solidos` (bebes_043 → bebes_062).
 *
 * ── Qué cambia respecto a la primera tanda ────────────────────────────────
 * La primera resolvió el arranque: 6 tortitas, 5 hamburguesas/albóndigas, 5
 * bastones y 4 platos completos. Es el repertorio de los primeros meses, cuando
 * el bebé agarra con el puño y poco más.
 *
 * Esta segunda va un paso por delante, a los 9-12 meses, y por eso entran tres
 * cosas que allí no había sitio:
 *
 *   · FORMATOS DE HORNO EN PORCIONES (frittata, mini quiche, pastel de pescado,
 *     muffins). Se hornean de una vez y se cortan en tantos trozos como haga
 *     falta: es la forma de que la cena del bebé salga de la misma bandeja que
 *     la de sus padres en vez de cocinarse aparte.
 *   · REBOZADOS AL HORNO (nuggets, croquetas, bastones de calabacín). Fritos
 *     no, pero la corteza importa: da agarre a una cosa blanda, que es justo
 *     lo que falla cuando el bebé todavía no tiene pinza fina.
 *   · UNTAR Y MOJAR (hummus con bastones). Es una habilidad nueva, no solo un
 *     plato — mojar exige coordinar las dos manos.
 *
 * Reparto: 5 tortitas/gofres/crepes · 4 al horno en porciones · 4 rebozados y
 * bolitas · 4 bastones y tiras · 3 platos completos.
 *
 * ── Las mismas reglas de seguridad, que no son opinión ────────────────────
 * De la SEORL-CCC y la AEP:
 *   · Sin sal y sin azúcar añadido. Sin miel antes del año.
 *   · Frutos secos SOLO molidos: enteros ni troceados hasta los 5-6 años.
 *   · Nada redondo y duro: uva entera, cherry, aceituna, zanahoria cruda.
 *   · Cortar A LO LARGO, nunca en rodajas — una rodaja tiene justo el diámetro
 *     de la tráquea.
 *   · Pescado que se deshaga solo, revisado de espinas.
 *
 * Y una que aquí pesa más que en la primera tanda: NADA DE QUESO CURADO NI
 * LONCHAS. Son las dos vías por las que la sal se cuela en un plato "sin sal";
 * un queso semicurado lleva más sodio que el que un bebé debería tomar en todo
 * el día. Por eso los lácteos de estas recetas son requesón, ricotta, queso
 * fresco y yogur natural, y nunca queso rallado de bolsa.
 *
 * ── Por qué solo ingredientes del catálogo ────────────────────────────────
 * Todos los ingredientes salen de los 383 de `ingredients.json`. La tentación
 * era meter harina de garbanzo o polenta, que en BLW se usan mucho, pero un
 * ingrediente nuevo obliga a pasar `seed_ingredients.sql` ANTES que las
 * recetas, y saltarse ese orden es lo que reventó la carga la vez pasada con
 * un 23503 a mitad. No merece la pena por un rebozado.
 *
 * Uso:
 *   node scripts/add-recipes-bebes-solidos-2.mjs           (informe)
 *   node scripts/add-recipes-bebes-solidos-2.mjs --write   (aplica)
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BEBES = join(__dirname, "..", "src", "data", "recipes", "bebes.json");
const INGREDIENTES = join(__dirname, "..", "src", "data", "ingredients.json");

const base = (over) => ({
  category: "bebes",
  etapaBebe: "solidos",
  mealRole: ["plato_unico", "cena"],
  type: "completo",
  difficulty: "facil",
  baseServings: 1,
  kidFriendly: true,
  tupperFriendly: true,
  season: "all",
  ...over,
});

const g = (name, amount, unit = "g") => ({ name, amount, unit });

// stepsRich: {{Ingrediente}} marca la línea del ingrediente para que la ficha
// lo resalte. `kind` es de TIEMPO (prep/activo/pasivo/espera/emplatado).
const paso = (text, minutes, kind = "activo") => ({ text, minutes, kind });

export const NUEVAS = [
  // ── Tortitas, gofres y crepes ───────────────────────────────────────────
  base({
    id: "bebes_043",
    name: "Tortitas de calabaza y canela",
    mainProtein: "huevo",
    mainBase: "avena",
    time: 20, kcal: 185, protein_g: 8, carbs_g: 24, fat_g: 7,
    allergens: ["huevo", "gluten"],
    mainIngredients: ["verdura"],
    tecnica: "sarten",
    ingredients: [g("Calabaza", 90), g("Copos de avena", 30), g("Huevo", 1, "ud"), g("Canela molida", 1), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Tortitas naranjas y dulces sin azúcar: la calabaza asada endulza sola",
    steps: [
      "Asar la calabaza hasta que se aplaste sin esfuerzo, o cocerla al vapor.",
      "Triturar los copos de avena hasta dejarlos como harina.",
      "Aplastar la calabaza con un tenedor y dejar que temple.",
      "Mezclar con el huevo batido, la avena molida y una pizca de canela.",
      "Dorar tortitas pequeñas a fuego medio-bajo por los dos lados.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Asar la {{Calabaza}} hasta que se aplaste sin esfuerzo, o cocerla al vapor. Asada sabe mucho más dulce, y aquí el dulce tiene que venir de ahí.", 25, "pasivo"),
      paso("Triturar los {{Copos de avena}} hasta dejarlos como harina.", 1, "prep"),
      paso("Aplastar la calabaza con un tenedor y dejar que temple: si sigue caliente, el huevo cuaja al mezclarlo.", 3, "espera"),
      paso("Mezclar con el {{Huevo}} batido, la avena molida y una pizca de {{Canela molida}}.", 2, "prep"),
      paso("Dorar tortitas pequeñas con {{Aceite de oliva virgen extra}} a fuego medio-bajo por los dos lados.", 6, "activo"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),
  base({
    id: "bebes_044",
    name: "Gofres de espinacas y queso fresco",
    mainProtein: "huevo",
    time: 22, kcal: 215, protein_g: 12, carbs_g: 22, fat_g: 9,
    allergens: ["huevo", "gluten", "lactosa"],
    mainIngredients: ["verdura", "lacteo"],
    tecnica: "sarten",
    ingredients: [g("Espinacas frescas", 50), g("Queso fresco", 40), g("Harina", 40), g("Huevo", 1, "ud"), g("Leche", 40, "ml"), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Gofres verdes muy blandos: los surcos son el mejor agarre que hay",
    steps: [
      "Cocer las espinacas un par de minutos, escurrirlas y picarlas muy fino.",
      "Batir el huevo con la leche y el queso fresco desmenuzado.",
      "Añadir la harina y las espinacas y mezclar hasta que no queden grumos.",
      "Calentar la gofrera engrasada con unas gotas de aceite.",
      "Hacer los gofres hasta que cuajen, sin buscar que queden crujientes.",
      "Cortar en tiras a lo largo y dejar templar.",
    ],
    stepsRich: [
      paso("Cocer las {{Espinacas frescas}} un par de minutos, escurrirlas apretando bien y picarlas muy fino. Si queda hoja entera se le pega al paladar.", 5, "activo"),
      paso("Batir el {{Huevo}} con la {{Leche}} y el {{Queso fresco}} desmenuzado.", 2, "prep"),
      paso("Añadir la {{Harina}} y las espinacas y mezclar hasta que no queden grumos.", 2, "prep"),
      paso("Calentar la gofrera engrasada con unas gotas de {{Aceite de oliva virgen extra}}.", 4, "pasivo"),
      paso("Hacer los gofres hasta que cuajen, sin buscar que queden crujientes: aquí interesan blandos, los surcos ya dan el agarre.", 6, "activo"),
      paso("Cortar en tiras a lo largo y dejar templar.", 3, "espera"),
    ],
  }),
  base({
    id: "bebes_045",
    name: "Crepes de pera en tiras",
    mainProtein: "huevo",
    time: 20, kcal: 200, protein_g: 9, carbs_g: 27, fat_g: 6,
    allergens: ["huevo", "gluten", "lactosa"],
    mainIngredients: ["fruta"],
    tecnica: "sarten",
    ingredients: [g("Pera", 1, "ud"), g("Harina", 35), g("Huevo", 1, "ud"), g("Leche", 70, "ml"), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Crepes finos enrollados con pera pochada, cortados en tiras gruesas",
    steps: [
      "Pelar la pera, quitarle el corazón y cortarla en dados pequeños.",
      "Pochar la pera en una sartén a fuego suave hasta que esté muy blanda.",
      "Batir el huevo con la leche y la harina hasta obtener una masa líquida.",
      "Hacer crepes finos en una sartén engrasada, uno o dos minutos por lado.",
      "Repartir la pera sobre el crepe, enrollarlo y cortarlo en tiras a lo largo.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Pelar la {{Pera}}, quitarle el corazón y cortarla en dados pequeños.", 4, "prep"),
      paso("Pochar la pera en una sartén a fuego suave hasta que esté muy blanda y suelte su jugo. Ese jugo es todo el dulce que lleva.", 8, "pasivo"),
      paso("Batir el {{Huevo}} con la {{Leche}} y la {{Harina}} hasta obtener una masa líquida sin grumos.", 3, "prep"),
      paso("Hacer crepes finos en una sartén engrasada con {{Aceite de oliva virgen extra}}, uno o dos minutos por lado.", 5, "activo"),
      paso("Repartir la pera sobre el crepe, enrollarlo y cortarlo en tiras a lo largo del rollo, nunca en rodajas.", 3, "emplatado"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),
  base({
    id: "bebes_046",
    name: "Tortitas de maíz y pavo",
    mainProtein: "pavo",
    time: 22, kcal: 205, protein_g: 18, carbs_g: 18, fat_g: 7,
    allergens: ["huevo", "gluten"],
    mainIngredients: ["verdura"],
    tecnica: "sarten",
    ingredients: [g("Pechuga de pavo", 70), g("Maíz", 50), g("Huevo", 1, "ud"), g("Copos de avena", 20), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Tortitas de pavo con maíz aplastado, blandas y con hierro",
    steps: [
      "Cocer la pechuga de pavo hasta que esté hecha y dejar que temple.",
      "Picar el pavo muy fino, casi deshilachado.",
      "Aplastar el maíz con un tenedor para que no queden granos enteros.",
      "Mezclar el pavo, el maíz, el huevo batido y los copos de avena molidos.",
      "Formar tortitas y dorarlas a fuego medio-bajo por los dos lados.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Cocer la {{Pechuga de pavo}} hasta que esté hecha y dejar que temple.", 12, "pasivo"),
      paso("Picar el pavo muy fino, casi deshilachado. En trozo se queda seco y no lo traga.", 3, "prep"),
      paso("Aplastar el {{Maíz}} con un tenedor: un grano entero es redondo y duro, y es de los que hay que evitar.", 2, "prep"),
      paso("Mezclar el pavo, el maíz, el {{Huevo}} batido y los {{Copos de avena}} molidos.", 2, "prep"),
      paso("Formar tortitas y dorarlas con {{Aceite de oliva virgen extra}} a fuego medio-bajo por los dos lados.", 6, "activo"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),
  base({
    id: "bebes_047",
    name: "Tortitas de lenteja roja y zanahoria",
    mainProtein: "legumbre",
    mainBase: "lentejas",
    time: 30, kcal: 195, protein_g: 11, carbs_g: 28, fat_g: 5,
    allergens: [],
    mainIngredients: ["verdura"],
    tecnica: "sarten",
    ingredients: [g("Lentejas rojas", 60), g("Zanahoria", 60), g("Comino molido", 1), g("Aceite de oliva virgen extra", 8, "ml")],
    description: "Tortitas sin huevo ni gluten: la lenteja roja liga ella sola",
    steps: [
      "Cocer las lentejas rojas hasta que se deshagan y escurrir el agua sobrante.",
      "Cocer la zanahoria al vapor hasta que se aplaste sin esfuerzo.",
      "Aplastar las dos cosas juntas con un tenedor hasta formar una pasta espesa.",
      "Añadir una pizca de comino y dejar reposar para que la masa asiente.",
      "Formar tortitas y dorarlas a fuego medio-bajo por los dos lados.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Cocer las {{Lentejas rojas}} hasta que se deshagan y escurrir el agua sobrante. Se deshacen solas, por eso ligan sin huevo.", 15, "pasivo"),
      paso("Cocer la {{Zanahoria}} al vapor hasta que se aplaste sin esfuerzo.", 10, "paralelo"),
      paso("Aplastar las dos cosas juntas con un tenedor hasta formar una pasta espesa.", 3, "prep"),
      paso("Añadir una pizca de {{Comino molido}} y dejar reposar cinco minutos para que la masa asiente.", 5, "espera"),
      paso("Formar tortitas y dorarlas con {{Aceite de oliva virgen extra}} a fuego medio-bajo por los dos lados.", 6, "activo"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),

  // ── Al horno, en porciones ──────────────────────────────────────────────
  base({
    id: "bebes_048",
    name: "Frittata al horno de calabacín y patata",
    mainProtein: "huevo",
    mainBase: "patata",
    time: 40, kcal: 230, protein_g: 14, carbs_g: 20, fat_g: 12,
    allergens: ["huevo"],
    mainIngredients: ["verdura"],
    tecnica: "horno",
    ingredients: [g("Calabacín", 100), g("Patata", 100), g("Huevo", 2, "ud"), g("Cebolla", 30), g("Aceite de oliva virgen extra", 10, "ml")],
    description: "Se hornea entera y se corta en las porciones que hagan falta, sin sal",
    steps: [
      "Cortar la patata y el calabacín en dados pequeños y la cebolla muy fina.",
      "Pochar la verdura a fuego suave y tapada hasta que esté muy blanda.",
      "Batir los huevos y mezclarlos con la verdura templada.",
      "Verter en una fuente pequeña engrasada y hornear a 180 °C hasta que cuaje.",
      "Dejar templar, desmoldar y cortar en tiras a lo largo.",
    ],
    stepsRich: [
      paso("Cortar la {{Patata}} y el {{Calabacín}} en dados pequeños y la {{Cebolla}} muy fina.", 8, "prep"),
      paso("Pochar la verdura con {{Aceite de oliva virgen extra}} a fuego suave y tapada hasta que esté muy blanda. El punto de una frittata de adulto no vale: aquí se pasa a propósito.", 15, "pasivo"),
      paso("Batir los {{Huevo}} y mezclarlos con la verdura ya templada.", 3, "prep"),
      paso("Verter en una fuente pequeña engrasada y hornear a 180 °C hasta que cuaje del todo por el centro.", 20, "pasivo"),
      paso("Dejar templar, desmoldar y cortar en tiras a lo largo, del tamaño de un dedo de adulto.", 6, "emplatado"),
    ],
  }),
  base({
    id: "bebes_049",
    name: "Mini quiche sin masa de brócoli",
    mainProtein: "huevo",
    time: 35, kcal: 190, protein_g: 14, carbs_g: 7, fat_g: 12,
    allergens: ["huevo", "lactosa"],
    mainIngredients: ["verdura", "lacteo"],
    tecnica: "horno",
    ingredients: [g("Brócoli", 90), g("Huevo", 2, "ud"), g("Requesón", 50), g("Leche", 40, "ml"), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Quiche sin base, cuajada en moldes de magdalena: una porción por mano",
    steps: [
      "Cocer el brócoli al vapor hasta que se aplaste con un tenedor.",
      "Picarlo en trozos pequeños, sin llegar a triturarlo.",
      "Batir los huevos con el requesón y la leche.",
      "Repartir el brócoli en moldes de magdalena engrasados y cubrir con la mezcla.",
      "Hornear a 180 °C hasta que estén cuajadas y ligeramente doradas.",
      "Dejar templar y desmoldar con cuidado.",
    ],
    stepsRich: [
      paso("Cocer el {{Brócoli}} al vapor hasta que se aplaste con un tenedor sin esfuerzo.", 9, "pasivo"),
      paso("Picarlo en trozos pequeños, sin llegar a triturarlo: el grumo es lo que se agarra.", 3, "prep"),
      paso("Batir los {{Huevo}} con el {{Requesón}} y la {{Leche}}. Sin masa quebrada ni queso curado, que es por donde entra la sal.", 3, "prep"),
      paso("Repartir el brócoli en moldes de magdalena engrasados con {{Aceite de oliva virgen extra}} y cubrir con la mezcla.", 4, "prep"),
      paso("Hornear a 180 °C hasta que estén cuajadas y ligeramente doradas.", 18, "pasivo"),
      paso("Dejar templar y desmoldar con cuidado.", 5, "espera"),
    ],
  }),
  base({
    id: "bebes_050",
    name: "Muffins de plátano y avena",
    mainProtein: "huevo",
    mainBase: "avena",
    time: 32, kcal: 225, protein_g: 9, carbs_g: 34, fat_g: 6,
    allergens: ["huevo", "gluten", "lactosa"],
    mainIngredients: ["fruta"],
    tecnica: "horno",
    ingredients: [g("Plátano", 1, "ud"), g("Copos de avena", 50), g("Huevo", 1, "ud"), g("Yogur natural", 40), g("Levadura química", 2)],
    description: "Magdalenas sin azúcar ni miel: el plátano muy maduro es todo el dulce",
    steps: [
      "Aplastar el plátano con un tenedor hasta dejarlo casi puré.",
      "Triturar los copos de avena hasta dejarlos como harina.",
      "Mezclar el plátano con el huevo batido y el yogur.",
      "Añadir la avena molida y la levadura y remover sin batir de más.",
      "Repartir en moldes de magdalena y hornear a 180 °C.",
      "Dejar enfriar antes de desmoldar.",
    ],
    stepsRich: [
      paso("Aplastar el {{Plátano}} con un tenedor hasta dejarlo casi puré. Cuanto más maduro y con más motas, más dulce sale sin añadir nada.", 2, "prep"),
      paso("Triturar los {{Copos de avena}} hasta dejarlos como harina.", 2, "prep"),
      paso("Mezclar el plátano con el {{Huevo}} batido y el {{Yogur natural}}.", 2, "prep"),
      paso("Añadir la avena molida y la {{Levadura química}} y remover lo justo: batir de más los deja gomosos.", 2, "prep"),
      paso("Repartir en moldes de magdalena y hornear a 180 °C hasta que salgan secos al pincharlos.", 20, "pasivo"),
      paso("Dejar enfriar antes de desmoldar, o se rompen.", 4, "espera"),
    ],
  }),
  base({
    id: "bebes_051",
    name: "Pastel de merluza y patata en porciones",
    mainProtein: "pescado_blanco",
    mainBase: "patata",
    time: 45, kcal: 215, protein_g: 20, carbs_g: 21, fat_g: 6,
    allergens: ["pescado", "huevo"],
    mainIngredients: ["verdura"],
    tecnica: "horno",
    ingredients: [g("Merluza en lomos", 100), g("Patata", 120), g("Huevo", 1, "ud"), g("Zanahoria", 40), g("Aceite de oliva virgen extra", 8, "ml")],
    description: "Pastel blando de pescado y patata que se corta en barritas, sin espinas",
    steps: [
      "Cocer la patata y la zanahoria hasta que se aplasten sin esfuerzo.",
      "Cocer la merluza al vapor y desmenuzarla revisando espina por espina.",
      "Aplastar la patata y la zanahoria con un tenedor y mezclar con el pescado.",
      "Añadir el huevo batido y remover hasta que ligue.",
      "Extender en una fuente pequeña y hornear a 180 °C hasta que cuaje.",
      "Dejar templar y cortar en barritas alargadas.",
    ],
    stepsRich: [
      paso("Cocer la {{Patata}} y la {{Zanahoria}} hasta que se aplasten sin esfuerzo.", 18, "pasivo"),
      paso("Cocer la {{Merluza en lomos}} al vapor y desmenuzarla revisando espina por espina con los dedos. Este paso no se puede hacer deprisa.", 10, "activo"),
      paso("Aplastar la patata y la zanahoria con un tenedor y mezclar con el pescado.", 4, "prep"),
      paso("Añadir el {{Huevo}} batido y un chorrito de {{Aceite de oliva virgen extra}}, y remover hasta que ligue.", 2, "prep"),
      paso("Extender en una fuente pequeña y hornear a 180 °C hasta que cuaje y se dore por encima.", 20, "pasivo"),
      paso("Dejar templar y cortar en barritas alargadas, del largo de un dedo.", 5, "emplatado"),
    ],
  }),

  // ── Rebozados al horno y bolitas ────────────────────────────────────────
  base({
    id: "bebes_052",
    name: "Nuggets de pollo al horno con avena",
    mainProtein: "pollo",
    time: 30, kcal: 230, protein_g: 24, carbs_g: 14, fat_g: 9,
    allergens: ["huevo", "gluten"],
    mainIngredients: [],
    tecnica: "horno",
    ingredients: [g("Pechuga de pollo", 100), g("Copos de avena", 30), g("Huevo", 1, "ud"), g("Aceite de oliva virgen extra", 8, "ml")],
    description: "Nuggets horneados rebozados en avena, sin sal ni pan rallado de bolsa",
    steps: [
      "Cortar la pechuga en tiras del grosor de un dedo, a lo largo.",
      "Triturar los copos de avena hasta dejarlos gruesos, como pan rallado.",
      "Pasar las tiras por huevo batido y después por la avena.",
      "Colocarlas separadas en una bandeja con papel y pincelar con aceite.",
      "Hornear a 200 °C, dándoles la vuelta a mitad, hasta que estén hechas por dentro.",
      "Dejar templar y comprobar que el centro no quema.",
    ],
    stepsRich: [
      paso("Cortar la {{Pechuga de pollo}} en tiras del grosor de un dedo, siempre a lo largo. En taco redondo es justo la forma que hay que evitar.", 5, "prep"),
      paso("Triturar los {{Copos de avena}} hasta dejarlos gruesos, como pan rallado. El pan rallado de bolsa lleva sal.", 2, "prep"),
      paso("Pasar las tiras por {{Huevo}} batido y después por la avena, apretando para que agarre.", 5, "prep"),
      paso("Colocarlas separadas en una bandeja con papel y pincelar con {{Aceite de oliva virgen extra}}.", 3, "prep"),
      paso("Hornear a 200 °C, dándoles la vuelta a mitad, hasta que estén hechas por dentro.", 17, "pasivo"),
      paso("Dejar templar y comprobar que el centro no quema antes de servir.", 4, "espera"),
    ],
  }),
  base({
    id: "bebes_053",
    name: "Croquetas al horno de merluza y calabacín",
    mainProtein: "pescado_blanco",
    mainBase: "patata",
    time: 40, kcal: 200, protein_g: 17, carbs_g: 20, fat_g: 6,
    allergens: ["pescado", "huevo", "gluten"],
    mainIngredients: ["verdura"],
    tecnica: "horno",
    ingredients: [g("Merluza en lomos", 80), g("Calabacín", 60), g("Patata", 90), g("Copos de avena", 25), g("Huevo", 1, "ud"), g("Aceite de oliva virgen extra", 8, "ml")],
    description: "Croquetas sin bechamel ni freidora: patata por dentro y avena por fuera",
    steps: [
      "Cocer la patata hasta que se aplaste sin esfuerzo y aplastarla con un tenedor.",
      "Rallar el calabacín y escurrirlo apretando bien.",
      "Cocer la merluza al vapor y desmenuzarla revisando espinas.",
      "Mezclar la patata, el calabacín y el pescado hasta formar una masa manejable.",
      "Formar croquetas alargadas, pasarlas por huevo y por avena molida gruesa.",
      "Hornear a 200 °C dándoles la vuelta a mitad, y dejar templar.",
    ],
    stepsRich: [
      paso("Cocer la {{Patata}} hasta que se aplaste sin esfuerzo y aplastarla con un tenedor.", 18, "pasivo"),
      paso("Rallar el {{Calabacín}} y escurrirlo apretando bien con las manos. Si suelta agua, la masa no se sostiene.", 4, "prep"),
      paso("Cocer la {{Merluza en lomos}} al vapor y desmenuzarla revisando espina por espina.", 9, "activo"),
      paso("Mezclar la patata, el calabacín y el pescado hasta formar una masa manejable, sin sal.", 3, "prep"),
      paso("Formar croquetas alargadas —alargadas, no bolas—, pasarlas por {{Huevo}} batido y por los {{Copos de avena}} molidos gruesos.", 8, "prep"),
      paso("Pincelar con {{Aceite de oliva virgen extra}}, hornear a 200 °C dándoles la vuelta a mitad, y dejar templar.", 18, "pasivo"),
    ],
  }),
  base({
    id: "bebes_054",
    name: "Bolitas de quinoa, garbanzo y espinaca",
    mainProtein: "legumbre",
    mainBase: "quinoa",
    time: 35, kcal: 215, protein_g: 12, carbs_g: 30, fat_g: 7,
    allergens: [],
    mainIngredients: ["verdura"],
    tecnica: "horno",
    ingredients: [g("Quinoa", 40), g("Garbanzos cocidos", 70), g("Espinacas frescas", 40), g("Aceite de oliva virgen extra", 8, "ml"), g("Comino molido", 1)],
    description: "Bolitas horneadas sin huevo: la quinoa y el garbanzo aplastado ligan solos",
    steps: [
      "Cocer la quinoa hasta que esté muy blanda y escurrirla.",
      "Cocer las espinacas, escurrirlas apretando y picarlas muy fino.",
      "Aplastar los garbanzos con un tenedor hasta hacerlos pasta.",
      "Mezclar todo con una pizca de comino y un chorrito de aceite.",
      "Formar bolitas del tamaño de una nuez y aplastarlas un poco.",
      "Hornear a 190 °C hasta que se doren, y dejar templar.",
    ],
    stepsRich: [
      paso("Cocer la {{Quinoa}} hasta que esté muy blanda y escurrirla. Pasada de punto a propósito: al dente no vale aquí.", 15, "pasivo"),
      paso("Cocer las {{Espinacas frescas}}, escurrirlas apretando y picarlas muy fino.", 5, "paralelo"),
      paso("Aplastar los {{Garbanzos cocidos}} con un tenedor hasta hacerlos pasta. Enteros son redondos y duros.", 3, "prep"),
      paso("Mezclar todo con una pizca de {{Comino molido}} y un chorrito de {{Aceite de oliva virgen extra}}.", 2, "prep"),
      paso("Formar bolitas del tamaño de una nuez y aplastarlas un poco: aplastadas se cogen mejor y no ruedan por la bandeja.", 5, "prep"),
      paso("Hornear a 190 °C hasta que se doren por fuera, y dejar templar.", 18, "pasivo"),
    ],
  }),
  base({
    id: "bebes_055",
    name: "Albóndigas de pavo y manzana al horno",
    mainProtein: "pavo",
    time: 35, kcal: 210, protein_g: 22, carbs_g: 13, fat_g: 8,
    allergens: ["huevo", "gluten"],
    mainIngredients: ["fruta"],
    tecnica: "horno",
    ingredients: [g("Pechuga de pavo", 110), g("Manzana", 50), g("Copos de avena", 20), g("Huevo", 1, "ud"), g("Aceite de oliva virgen extra", 8, "ml")],
    description: "La manzana rallada mantiene el pavo jugoso, que solo se queda seco",
    steps: [
      "Picar la pechuga de pavo muy fina, casi como carne picada.",
      "Rallar la manzana con piel quitada y escurrir el exceso de jugo.",
      "Mezclar el pavo, la manzana, el huevo batido y la avena molida.",
      "Formar albóndigas pequeñas y aplastarlas ligeramente.",
      "Hornear a 190 °C hasta que estén hechas por dentro.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Picar la {{Pechuga de pavo}} muy fina, casi como carne picada.", 6, "prep"),
      paso("Rallar la {{Manzana}} sin piel y escurrir el exceso de jugo. La manzana es la que evita que el pavo salga seco, que es su problema de siempre.", 3, "prep"),
      paso("Mezclar el pavo, la manzana, el {{Huevo}} batido y los {{Copos de avena}} molidos.", 3, "prep"),
      paso("Formar albóndigas pequeñas y aplastarlas ligeramente para que no rueden.", 5, "prep"),
      paso("Pincelar con {{Aceite de oliva virgen extra}} y hornear a 190 °C hasta que estén hechas por dentro.", 18, "pasivo"),
      paso("Dejar templar antes de servir.", 4, "espera"),
    ],
  }),

  // ── Bastones y tiras ────────────────────────────────────────────────────
  base({
    id: "bebes_056",
    name: "Bastones de calabacín rebozado al horno",
    mainProtein: "huevo",
    time: 28, kcal: 175, protein_g: 9, carbs_g: 15, fat_g: 9,
    allergens: ["huevo", "gluten"],
    mainIngredients: ["verdura"],
    tecnica: "horno",
    ingredients: [g("Calabacín", 150), g("Copos de avena", 30), g("Huevo", 1, "ud"), g("Aceite de oliva virgen extra", 8, "ml")],
    description: "El rebozado de avena da agarre a un calabacín que solo resbala",
    steps: [
      "Cortar el calabacín en bastones a lo largo, del grosor de un dedo.",
      "Triturar los copos de avena hasta dejarlos gruesos.",
      "Pasar los bastones por huevo batido y después por la avena.",
      "Colocarlos separados en una bandeja y pincelar con aceite.",
      "Hornear a 200 °C hasta que estén blandos por dentro y dorados por fuera.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Cortar el {{Calabacín}} en bastones a lo largo, del grosor de un dedo de adulto. Nunca en rodajas.", 5, "prep"),
      paso("Triturar los {{Copos de avena}} hasta dejarlos gruesos, tipo pan rallado.", 2, "prep"),
      paso("Pasar los bastones por {{Huevo}} batido y después por la avena. Sin rebozar, el calabacín cocido resbala entre los dedos y no hay quien lo coja.", 5, "prep"),
      paso("Colocarlos separados en una bandeja con papel y pincelar con {{Aceite de oliva virgen extra}}.", 3, "prep"),
      paso("Hornear a 200 °C hasta que estén blandos por dentro y dorados por fuera.", 18, "pasivo"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),
  base({
    id: "bebes_057",
    name: "Tortilla de patata en tiras, sin sal",
    mainProtein: "huevo",
    mainBase: "patata",
    time: 35, kcal: 245, protein_g: 13, carbs_g: 24, fat_g: 12,
    allergens: ["huevo"],
    mainIngredients: ["verdura"],
    tecnica: "sarten",
    ingredients: [g("Patata", 150), g("Huevo", 2, "ud"), g("Cebolla", 40), g("Aceite de oliva virgen extra", 12, "ml")],
    description: "La de siempre, muy cuajada y sin sal, cortada en tiras para la mano",
    steps: [
      "Cortar la patata en láminas finas y la cebolla en juliana.",
      "Pocharlas a fuego suave y tapadas hasta que estén muy blandas.",
      "Escurrir el aceite sobrante y mezclar con los huevos batidos.",
      "Cuajar en la sartén a fuego bajo por los dos lados, bien hecha por dentro.",
      "Dejar templar y cortar en tiras alargadas en vez de en porciones.",
    ],
    stepsRich: [
      paso("Cortar la {{Patata}} en láminas finas y la {{Cebolla}} en juliana.", 8, "prep"),
      paso("Pocharlas con {{Aceite de oliva virgen extra}} a fuego suave y tapadas hasta que estén muy blandas.", 15, "pasivo"),
      paso("Escurrir el aceite sobrante y mezclar con los {{Huevo}} batidos, sin sal.", 3, "prep"),
      paso("Cuajar en la sartén a fuego bajo por los dos lados. Aquí va bien hecha por dentro: el huevo poco cuajado no es para un bebé.", 8, "activo"),
      paso("Dejar templar y cortar en tiras alargadas en vez de en porciones triangulares — una tira se agarra con el puño, un triángulo no.", 5, "emplatado"),
    ],
  }),
  base({
    id: "bebes_058",
    name: "Bastones de pera y manzana al vapor",
    mainProtein: "none",
    time: 15, kcal: 95, protein_g: 1, carbs_g: 22, fat_g: 0,
    allergens: [],
    mainIngredients: ["fruta"],
    tecnica: "olla",
    ingredients: [g("Pera", 1, "ud"), g("Manzana", 1, "ud")],
    description: "Fruta al vapor en bastones: blanda de verdad, no como la fruta cruda",
    steps: [
      "Pelar la pera y la manzana y quitarles el corazón.",
      "Cortarlas en bastones a lo largo, del grosor de un dedo.",
      "Cocerlas al vapor hasta que se aplasten con los dedos.",
      "Dejar templar del todo antes de servir.",
    ],
    stepsRich: [
      paso("Pelar la {{Pera}} y la {{Manzana}} y quitarles el corazón.", 4, "prep"),
      paso("Cortarlas en bastones a lo largo, del grosor de un dedo de adulto.", 3, "prep"),
      paso("Cocerlas al vapor hasta que se aplasten con los dedos. La manzana cruda es de los alimentos con más riesgo a esta edad: dura, y se parte en trozos que no ceden.", 8, "pasivo"),
      paso("Dejar templar del todo antes de servir.", 4, "espera"),
    ],
  }),
  base({
    id: "bebes_059",
    name: "Tiras de bacalao al horno con aceite",
    mainProtein: "pescado_blanco",
    time: 25, kcal: 165, protein_g: 26, carbs_g: 1, fat_g: 7,
    allergens: ["pescado"],
    mainIngredients: [],
    tecnica: "horno",
    ingredients: [g("Bacalao desalado", 110), g("Aceite de oliva virgen extra", 10, "ml"), g("Perejil", 2)],
    description: "Bacalao muy desalado en tiras, que se deshace solo entre los dedos",
    steps: [
      "Dejar el bacalao en agua fría en la nevera, cambiando el agua varias veces.",
      "Escurrirlo y secarlo, y revisarlo espina por espina.",
      "Cortarlo en tiras gruesas siguiendo las lascas.",
      "Regar con aceite y perejil picado y hornear a 180 °C hasta que se abra en lascas.",
      "Dejar templar y volver a revisar antes de servir.",
    ],
    stepsRich: [
      paso("Dejar el {{Bacalao desalado}} en agua fría en la nevera, cambiando el agua varias veces. Aunque venga desalado, para un bebé hay que desalarlo otra vez: es el único pescado del recetario que trae sal de fábrica.", 30, "espera"),
      paso("Escurrirlo y secarlo, y revisarlo espina por espina con los dedos.", 6, "activo"),
      paso("Cortarlo en tiras gruesas siguiendo las lascas: así se deshace solo en la boca.", 3, "prep"),
      paso("Regar con {{Aceite de oliva virgen extra}} y {{Perejil}} picado y hornear a 180 °C hasta que se abra en lascas.", 12, "pasivo"),
      paso("Dejar templar y volver a revisar de espinas antes de servir.", 4, "espera"),
    ],
  }),

  // ── Platos completos ────────────────────────────────────────────────────
  base({
    id: "bebes_060",
    name: "Cuscús con verduras muy blandas",
    mainProtein: "none",
    mainBase: "cuscús",
    time: 25, kcal: 240, protein_g: 8, carbs_g: 42, fat_g: 6,
    allergens: ["gluten"],
    mainIngredients: ["verdura"],
    tecnica: "olla",
    ingredients: [g("Cuscús", 60), g("Calabacín", 60), g("Zanahoria", 50), g("Guisantes", 40), g("Aceite de oliva virgen extra", 8, "ml")],
    description: "Cuscús pasado de punto con verdura en dados, que se coge a puñados",
    steps: [
      "Cortar el calabacín y la zanahoria en dados muy pequeños.",
      "Cocerlos con los guisantes hasta que se aplasten sin esfuerzo.",
      "Hidratar el cuscús con agua caliente y dejarlo reposar tapado.",
      "Soltarlo con un tenedor y mezclarlo con la verdura y el aceite.",
      "Dejar templar y servir en un montoncito compacto.",
    ],
    stepsRich: [
      paso("Cortar el {{Calabacín}} y la {{Zanahoria}} en dados muy pequeños.", 6, "prep"),
      paso("Cocerlos con los {{Guisantes}} hasta que se aplasten sin esfuerzo entre dos dedos.", 12, "pasivo"),
      paso("Hidratar el {{Cuscús}} con agua caliente y dejarlo reposar tapado. Un poco más de agua de la que pone el paquete: seco se desmiga y no hay forma de cogerlo.", 6, "espera"),
      paso("Soltarlo con un tenedor y mezclarlo con la verdura y el {{Aceite de oliva virgen extra}}.", 2, "prep"),
      paso("Dejar templar y servir en un montoncito compacto, que se apelmace un poco: así se coge a puñados.", 4, "emplatado"),
    ],
  }),
  base({
    id: "bebes_061",
    name: "Hummus suave con bastones de zanahoria",
    mainProtein: "legumbre",
    mainBase: "garbanzos",
    time: 20, kcal: 250, protein_g: 11, carbs_g: 28, fat_g: 11,
    allergens: ["sesamo"],
    mainIngredients: ["verdura"],
    tecnica: "olla",
    ingredients: [g("Garbanzos cocidos", 100), g("Tahini", 10), g("Zanahoria", 120), g("Aceite de oliva virgen extra", 8, "ml"), g("Comino molido", 1)],
    description: "Untar y mojar es una habilidad nueva: el bastón es la cuchara",
    steps: [
      "Cocer la zanahoria al vapor hasta que se aplaste sin esfuerzo.",
      "Cortarla en bastones a lo largo, del grosor de un dedo.",
      "Triturar los garbanzos con el tahini, el aceite y un poco de agua.",
      "Ajustar con más agua hasta que quede una crema suave, no espesa.",
      "Servir el hummus en un cuenco bajo con los bastones al lado.",
    ],
    stepsRich: [
      paso("Cocer la {{Zanahoria}} al vapor hasta que se aplaste sin esfuerzo. Cruda no: es el ejemplo de libro de alimento duro y redondo.", 12, "pasivo"),
      paso("Cortarla en bastones a lo largo, del grosor de un dedo de adulto.", 3, "prep"),
      paso("Triturar los {{Garbanzos cocidos}} con el {{Tahini}}, el {{Aceite de oliva virgen extra}} y un poco de agua. Sin sal ni limón: el hummus de adulto lleva las dos cosas.", 3, "activo"),
      paso("Ajustar con más agua y una pizca de {{Comino molido}} hasta que quede una crema suave, no espesa. Espeso se le pega al paladar.", 2, "prep"),
      paso("Servir el hummus en un cuenco bajo con los bastones al lado. Mojar exige coordinar las dos manos, así que al principio acabará untándolo con el puño — es parte del ejercicio.", 2, "emplatado"),
    ],
  }),
  base({
    id: "bebes_062",
    name: "Arroz meloso de calabaza y pollo",
    mainProtein: "pollo",
    mainBase: "arroz",
    time: 35, kcal: 285, protein_g: 20, carbs_g: 40, fat_g: 6,
    allergens: [],
    mainIngredients: ["verdura"],
    tecnica: "olla",
    ingredients: [g("Arroz", 60), g("Calabaza", 80), g("Contramuslo de pollo", 80), g("Cebolla", 30), g("Aceite de oliva virgen extra", 8, "ml")],
    description: "Arroz pasado y meloso que se apelmaza: así se coge con la mano",
    steps: [
      "Picar la cebolla muy fina y pocharla a fuego suave.",
      "Añadir el contramuslo en dados pequeños y dorarlo ligeramente.",
      "Incorporar la calabaza en dados y el arroz, y cubrir con agua.",
      "Cocer a fuego bajo, removiendo, hasta que el arroz esté muy pasado.",
      "Deshilachar el pollo dentro del arroz con dos tenedores.",
      "Dejar templar hasta que espese y se pueda coger a puñados.",
    ],
    stepsRich: [
      paso("Picar la {{Cebolla}} muy fina y pocharla con {{Aceite de oliva virgen extra}} a fuego suave.", 8, "pasivo"),
      paso("Añadir el {{Contramuslo de pollo}} en dados pequeños y dorarlo ligeramente. Contramuslo y no pechuga: tiene más hierro y no se queda seco.", 5, "activo"),
      paso("Incorporar la {{Calabaza}} en dados y el {{Arroz}}, y cubrir con agua. Sin caldo de brik, que es sal casi entera.", 3, "activo"),
      paso("Cocer a fuego bajo, removiendo, hasta que el arroz esté muy pasado y haya soltado todo el almidón.", 20, "pasivo"),
      paso("Deshilachar el pollo dentro del arroz con dos tenedores, para que no queden tacos.", 3, "activo"),
      paso("Dejar templar hasta que espese: el arroz meloso se apelmaza al enfriar, y apelmazado se coge con la mano.", 6, "espera"),
    ],
  }),
];

// ── Comprobaciones antes de escribir ───────────────────────────────────────
// Las tres cosas que se rompieron en tandas anteriores, y que ahora fallan aquí
// y no a mitad de una carga en Supabase:
//   1. Un ingrediente que no está en el catálogo → 23503 al pasar el seed.
//   2. Un {{Marcador}} de stepsRich que no cuadra con ningún ingrediente → la
//      ficha lo pinta como texto plano y nadie se entera hasta verlo.
//   3. Un id repetido.
const catalogo = new Set(JSON.parse(readFileSync(INGREDIENTES, "utf8")).map((i) => i.name));
const problemas = [];

for (const r of NUEVAS) {
  const propios = new Set(r.ingredients.map((i) => i.name));
  for (const i of r.ingredients) {
    if (!catalogo.has(i.name)) problemas.push(`${r.id}  ingrediente fuera del catálogo: «${i.name}»`);
  }
  for (const p of r.stepsRich ?? []) {
    for (const m of p.text.matchAll(/\{\{([^}]+)\}\}/g)) {
      if (!propios.has(m[1])) problemas.push(`${r.id}  {{${m[1]}}} no está entre sus ingredientes`);
    }
  }
  if (r.steps.length === 0 || (r.stepsRich ?? []).length === 0) problemas.push(`${r.id}  sin pasos`);
}

// ── Aplicar ────────────────────────────────────────────────────────────────
const write = process.argv.includes("--write");
const actuales = JSON.parse(readFileSync(BEBES, "utf8"));
const ids = new Set(actuales.map((r) => r.id));
const repes = NUEVAS.filter((r) => ids.has(r.id));
for (const r of repes) problemas.push(`${r.id}  ya existe en bebes.json`);

console.log(`bebes.json: ${actuales.length} recetas`);
console.log(`  cremas:  ${actuales.filter((r) => (r.etapaBebe ?? "cremas") === "cremas").length}`);
console.log(`  solidos: ${actuales.filter((r) => r.etapaBebe === "solidos").length}`);
console.log(`\nNuevas: ${NUEVAS.length}`);
for (const r of NUEVAS) console.log(`  ${r.id}  ${r.name}`);

if (problemas.length > 0) {
  console.log(`\n❌ ${problemas.length} problema/s — no se escribe nada:`);
  for (const p of problemas) console.log(`   ${p}`);
  process.exit(1);
}
console.log("\n✓ Ingredientes, marcadores e ids: correctos.");

if (write) {
  writeFileSync(BEBES, JSON.stringify([...actuales, ...NUEVAS], null, 2) + "\n", "utf8");
  console.log(`\n✅ Escrito. bebes.json → ${actuales.length + NUEVAS.length} recetas.`);
} else {
  console.log("\n(informe: nada escrito — pasa --write para aplicar)");
}
