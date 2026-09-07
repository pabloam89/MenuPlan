/**
 * add-recipes-bebes-solidos.mjs
 *
 * Las 20 recetas de la etapa `solidos`, que estaba vacía.
 *
 * ── Por qué el formato manda sobre el ingrediente ─────────────────────────
 * Lo que hace que una receta sirva a esta edad no es qué lleva, es QUÉ FORMA
 * tiene. Un bebé de ocho meses agarra con el puño entero: coge bien una tortita,
 * una mini hamburguesa o un bastón, y no coge nada que se le desmigue. La pinza
 * —y con ella los trozos sueltos— llega sobre los nueve meses. Por eso el
 * reparto es 6 tortitas + 5 hamburguesas/albóndigas + 5 bastones + 4 platos
 * completos, y no "verduras, carnes, pescados".
 *
 * ── Las reglas de seguridad, que no son opinión ───────────────────────────
 * De la SEORL-CCC y la AEP:
 *   · Sin sal y sin azúcar añadido. Sin miel antes del año.
 *   · Frutos secos SOLO molidos: enteros ni troceados hasta los 5-6 años, por
 *     riesgo de broncoaspiración. Por eso el rebozado del aguacate es avena y
 *     no almendra.
 *   · Nada redondo y duro: uva entera, cherry, aceituna, zanahoria cruda.
 *   · Cortar A LO LARGO, nunca en rodajas — una rodaja tiene justo el diámetro
 *     de la tráquea.
 *   · Pescado que se deshaga solo, revisado de espinas.
 *
 * Uso:
 *   node scripts/add-recipes-bebes-solidos.mjs           (informe)
 *   node scripts/add-recipes-bebes-solidos.mjs --write   (aplica)
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BEBES = join(__dirname, "..", "src", "data", "recipes", "bebes.json");

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
  // ── Tortitas y bocaditos ────────────────────────────────────────────────
  base({
    id: "bebes_023",
    name: "Tortitas de brócoli y requesón",
    mainProtein: "huevo",
    time: 20, kcal: 165, protein_g: 11, carbs_g: 9, fat_g: 9,
    allergens: ["huevo", "lactosa", "gluten"],
    mainIngredients: ["verdura", "lacteo"],
    tecnica: "sarten",
    ingredients: [g("Brócoli", 70), g("Requesón", 40), g("Huevo", 1, "ud"), g("Copos de avena", 20), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Tortitas blanditas de brócoli que el bebé agarra con la mano, sin sal",
    steps: [
      "Cocer el brócoli al vapor hasta que se aplaste con un tenedor sin esfuerzo.",
      "Triturar los copos de avena hasta dejarlos como harina.",
      "Aplastar el brócoli con un tenedor en un bol, sin llegar a puré.",
      "Añadir el requesón, el huevo batido y la avena molida, y mezclar.",
      "Calentar una sartén antiadherente con unas gotas de aceite a fuego medio-bajo.",
      "Formar tortitas de un dedo de grosor con una cuchara.",
      "Dorar dos o tres minutos por cada lado, hasta que cuajen por dentro.",
      "Dejar templar y comprobar que el centro no quema antes de servir.",
    ],
    stepsRich: [
      paso("Cocer el {{Brócoli}} al vapor hasta que se aplaste con un tenedor sin esfuerzo.", 8, "pasivo"),
      paso("Triturar los {{Copos de avena}} hasta dejarlos como harina.", 1, "prep"),
      paso("Aplastar el brócoli con un tenedor en un bol, sin llegar a puré: quedan grumos y eso es lo que hace que se pueda coger.", 2, "prep"),
      paso("Añadir el {{Requesón}}, el {{Huevo}} batido y la avena molida, y mezclar.", 2, "prep"),
      paso("Calentar una sartén antiadherente con unas gotas de {{Aceite de oliva virgen extra}} a fuego medio-bajo.", 2, "activo"),
      paso("Formar tortitas de un dedo de grosor con una cuchara.", 1, "activo"),
      paso("Dorar dos o tres minutos por cada lado, hasta que cuajen por dentro.", 5, "activo"),
      paso("Dejar templar y comprobar que el centro no quema antes de servir.", 3, "espera"),
    ],
  }),
  base({
    id: "bebes_024",
    name: "Tortitas de guisantes y aguacate",
    mainProtein: "huevo",
    time: 18, kcal: 190, protein_g: 9, carbs_g: 14, fat_g: 11,
    allergens: ["huevo", "gluten"],
    mainIngredients: ["verdura"],
    tecnica: "sarten",
    ingredients: [g("Guisantes", 70), g("Aguacate", 40), g("Huevo", 1, "ud"), g("Copos de avena", 20), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Tortitas verdes muy tiernas de guisante y aguacate, sin sal",
    steps: [
      "Cocer los guisantes hasta que estén muy tiernos y escurrir.",
      "Triturar los copos de avena hasta dejarlos como harina.",
      "Aplastar los guisantes y el aguacate con un tenedor.",
      "Añadir el huevo batido y la avena molida, y mezclar hasta que ligue.",
      "Formar tortitas pequeñas y dorarlas a fuego medio-bajo por los dos lados.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Cocer los {{Guisantes}} hasta que estén muy tiernos y escurrir.", 7, "pasivo"),
      paso("Triturar los {{Copos de avena}} hasta dejarlos como harina.", 1, "prep"),
      paso("Aplastar los guisantes y el {{Aguacate}} con un tenedor.", 2, "prep"),
      paso("Añadir el {{Huevo}} batido y la avena molida, y mezclar hasta que ligue.", 2, "prep"),
      paso("Formar tortitas pequeñas y dorarlas con {{Aceite de oliva virgen extra}} a fuego medio-bajo por los dos lados.", 5, "activo"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),
  base({
    id: "bebes_025",
    name: "Tortitas de avena y plátano",
    mainProtein: "huevo",
    time: 15, kcal: 210, protein_g: 8, carbs_g: 31, fat_g: 6,
    allergens: ["huevo", "gluten"],
    mainIngredients: ["fruta"],
    mainBase: "avena",
    tecnica: "sarten",
    ingredients: [g("Plátano", 1, "ud"), g("Copos de avena", 40), g("Huevo", 1, "ud"), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Tortitas dulces sin azúcar: el plátano maduro endulza solo",
    steps: [
      "Aplastar el plátano con un tenedor hasta que quede casi puré.",
      "Añadir el huevo batido y los copos de avena y mezclar.",
      "Dejar reposar cinco minutos para que la avena se hidrate y la masa espese.",
      "Dorar tortitas pequeñas a fuego medio-bajo por los dos lados.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Aplastar el {{Plátano}} con un tenedor hasta que quede casi puré. Cuanto más maduro, más dulce sale sin añadir nada.", 2, "prep"),
      paso("Añadir el {{Huevo}} batido y los {{Copos de avena}} y mezclar.", 2, "prep"),
      paso("Dejar reposar cinco minutos para que la avena se hidrate y la masa espese.", 5, "espera"),
      paso("Dorar tortitas pequeñas con {{Aceite de oliva virgen extra}} a fuego medio-bajo por los dos lados.", 5, "activo"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),
  base({
    id: "bebes_026",
    name: "Bocaditos de lentejas y arroz",
    mainProtein: "legumbre",
    time: 30, kcal: 205, protein_g: 10, carbs_g: 32, fat_g: 5,
    allergens: [],
    mainBase: "legumbre",
    tecnica: "horno",
    ingredients: [g("Lentejas", 50), g("Arroz", 30), g("Zanahoria", 40), g("Aceite de oliva virgen extra", 5, "ml"), g("Comino molido", 1)],
    description: "Bocaditos al horno de lenteja y arroz, blandos y fáciles de agarrar",
    steps: [
      "Cocer las lentejas y el arroz por separado hasta que estén muy tiernos.",
      "Cocer la zanahoria hasta que se aplaste sin esfuerzo.",
      "Aplastar todo junto con un tenedor y añadir el aceite y el comino.",
      "Formar bolitas achatadas del tamaño de una nuez y ponerlas en una bandeja.",
      "Hornear a 180 grados unos quince minutos, hasta que se sostengan solas.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Cocer las {{Lentejas}} y el {{Arroz}} por separado hasta que estén muy tiernos.", 20, "pasivo"),
      paso("Cocer la {{Zanahoria}} hasta que se aplaste sin esfuerzo.", 10, "paralelo", 0),
      paso("Aplastar todo junto con un tenedor y añadir el {{Aceite de oliva virgen extra}} y el {{Comino molido}}.", 3, "prep"),
      paso("Formar bolitas achatadas del tamaño de una nuez y ponerlas en una bandeja.", 3, "activo"),
      paso("Hornear a 180 grados unos quince minutos, hasta que se sostengan solas.", 15, "pasivo"),
      paso("Dejar templar antes de servir.", 4, "espera"),
    ],
  }),
  base({
    id: "bebes_027",
    name: "Falafel al horno de lentejas",
    mainProtein: "legumbre",
    time: 32, kcal: 195, protein_g: 10, carbs_g: 24, fat_g: 7,
    allergens: [],
    mainBase: "legumbre",
    cocina: "arabe",
    tecnica: "horno",
    ingredients: [g("Lentejas", 60), g("Cebolla", 25), g("Perejil", 3), g("Comino molido", 1), g("Aceite de oliva virgen extra", 6, "ml")],
    description: "Falafel al horno, nunca frito, sin sal ni picante",
    steps: [
      "Cocer las lentejas hasta que estén muy tiernas y escurrir bien.",
      "Pochar la cebolla muy picada a fuego suave hasta que esté transparente.",
      "Triturar las lentejas con la cebolla, el perejil y el comino, dejando algo de grano.",
      "Formar discos aplastados, no bolas: se agarran mejor y se cuecen antes.",
      "Hornear a 190 grados unos dieciocho minutos, dándoles la vuelta a mitad.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Cocer las {{Lentejas}} hasta que estén muy tiernas y escurrir bien.", 20, "pasivo"),
      paso("Pochar la {{Cebolla}} muy picada a fuego suave hasta que esté transparente.", 6, "paralelo", 0),
      paso("Triturar las lentejas con la cebolla, el {{Perejil}} y el {{Comino molido}}, dejando algo de grano.", 2, "prep"),
      paso("Formar discos aplastados, no bolas: se agarran mejor y se cuecen antes.", 3, "activo"),
      paso("Pintar con {{Aceite de oliva virgen extra}} y hornear a 190 grados unos dieciocho minutos, dándoles la vuelta a mitad.", 18, "pasivo"),
      paso("Dejar templar antes de servir.", 4, "espera"),
    ],
  }),
  base({
    id: "bebes_028",
    name: "Tortitas de calabacín y queso fresco",
    mainProtein: "huevo",
    time: 18, kcal: 170, protein_g: 11, carbs_g: 10, fat_g: 9,
    allergens: ["huevo", "lactosa", "gluten"],
    mainIngredients: ["verdura", "lacteo"],
    tecnica: "sarten",
    ingredients: [g("Calabacín", 80), g("Queso fresco", 40), g("Huevo", 1, "ud"), g("Copos de avena", 20), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Tortitas jugosas de calabacín rallado y queso fresco, sin sal",
    steps: [
      "Rallar el calabacín y escurrirlo apretando con las manos.",
      "Triturar los copos de avena hasta dejarlos como harina.",
      "Mezclar el calabacín con el queso fresco desmenuzado, el huevo y la avena.",
      "Dorar tortitas pequeñas a fuego medio-bajo por los dos lados.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Rallar el {{Calabacín}} y escurrirlo apretando con las manos: si suelta agua en la sartén, la tortita no cuaja.", 3, "prep"),
      paso("Triturar los {{Copos de avena}} hasta dejarlos como harina.", 1, "prep"),
      paso("Mezclar el calabacín con el {{Queso fresco}} desmenuzado, el {{Huevo}} y la avena.", 2, "prep"),
      paso("Dorar tortitas pequeñas con {{Aceite de oliva virgen extra}} a fuego medio-bajo por los dos lados.", 6, "activo"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),

  // ── Mini hamburguesas y albóndigas ──────────────────────────────────────
  base({
    id: "bebes_029",
    name: "Mini hamburguesa de merluza y guisantes",
    mainProtein: "pescado_blanco",
    time: 22, kcal: 180, protein_g: 17, carbs_g: 12, fat_g: 7,
    allergens: ["pescado", "huevo", "gluten"],
    tecnica: "sarten",
    ingredients: [g("Merluza en lomos", 70), g("Guisantes", 40), g("Huevo", 1, "ud"), g("Pan rallado", 15), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Hamburguesa pequeña de merluza que se deshace en la boca, sin sal",
    steps: [
      "Revisar la merluza de espinas dos veces, pasando los dedos por todo el lomo.",
      "Cocer la merluza al vapor y desmigarla con los dedos.",
      "Cocer los guisantes hasta que estén muy tiernos y aplastarlos.",
      "Mezclar la merluza con los guisantes, el huevo y el pan rallado.",
      "Formar hamburguesas pequeñas y dorarlas a fuego medio por los dos lados.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Revisar la {{Merluza en lomos}} de espinas dos veces, pasando los dedos por todo el lomo. Es el paso que no se puede saltar.", 3, "prep"),
      paso("Cocer la merluza al vapor y desmigarla con los dedos.", 8, "pasivo"),
      paso("Cocer los {{Guisantes}} hasta que estén muy tiernos y aplastarlos.", 7, "paralelo", 1),
      paso("Mezclar la merluza con los guisantes, el {{Huevo}} y el {{Pan rallado}}.", 2, "prep"),
      paso("Formar hamburguesas pequeñas y dorarlas con {{Aceite de oliva virgen extra}} a fuego medio por los dos lados.", 6, "activo"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),
  base({
    id: "bebes_030",
    name: "Albóndigas de ternera al horno con tomate",
    mainProtein: "ternera",
    time: 35, kcal: 215, protein_g: 18, carbs_g: 13, fat_g: 11,
    allergens: ["huevo", "gluten"],
    tecnica: "horno",
    ingredients: [g("Carne picada de ternera", 70), g("Huevo", 1, "ud"), g("Pan rallado", 15), g("Tomate triturado", 80), g("Aceite de oliva virgen extra", 6, "ml")],
    description: "Albóndigas tiernas al horno con salsa de tomate suave, sin sal",
    steps: [
      "Mezclar la carne picada con el huevo y el pan rallado.",
      "Formar albóndigas pequeñas y aplastarlas un poco por arriba.",
      "Hornear a 180 grados unos veinte minutos.",
      "Reducir el tomate triturado con el aceite a fuego suave, sin sal.",
      "Juntar las albóndigas con el tomate y dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Mezclar la {{Carne picada de ternera}} con el {{Huevo}} y el {{Pan rallado}}.", 3, "prep"),
      paso("Formar albóndigas pequeñas y aplastarlas un poco por arriba: una bola redonda rueda y cuesta más agarrarla.", 3, "activo"),
      paso("Hornear a 180 grados unos veinte minutos.", 20, "pasivo"),
      paso("Reducir el {{Tomate triturado}} con el {{Aceite de oliva virgen extra}} a fuego suave, sin sal.", 8, "paralelo", 2),
      paso("Juntar las albóndigas con el tomate y dejar templar antes de servir.", 4, "emplatado"),
    ],
  }),
  base({
    id: "bebes_031",
    name: "Mini hamburguesa de pollo y calabacín",
    mainProtein: "pollo",
    time: 22, kcal: 185, protein_g: 18, carbs_g: 11, fat_g: 8,
    allergens: ["huevo", "gluten"],
    mainIngredients: ["verdura"],
    tecnica: "sarten",
    ingredients: [g("Pechuga de pollo", 70), g("Calabacín", 50), g("Huevo", 1, "ud"), g("Pan rallado", 15), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Hamburguesa jugosa de pollo con calabacín rallado dentro, sin sal",
    steps: [
      "Picar la pechuga de pollo muy fina con cuchillo o picadora.",
      "Rallar el calabacín y escurrirlo bien.",
      "Mezclar el pollo con el calabacín, el huevo y el pan rallado.",
      "Formar hamburguesas pequeñas y hacerlas a fuego medio-bajo, tapadas, hasta que estén hechas por dentro.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Picar la {{Pechuga de pollo}} muy fina con cuchillo o picadora.", 4, "prep"),
      paso("Rallar el {{Calabacín}} y escurrirlo bien. Es lo que mantiene jugosa la hamburguesa sin añadir grasa.", 3, "prep"),
      paso("Mezclar el pollo con el calabacín, el {{Huevo}} y el {{Pan rallado}}.", 2, "prep"),
      paso("Formar hamburguesas pequeñas y hacerlas con {{Aceite de oliva virgen extra}} a fuego medio-bajo, tapadas, hasta que estén hechas por dentro.", 8, "activo"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),
  base({
    id: "bebes_032",
    name: "Hamburguesa de garbanzos y zanahoria",
    mainProtein: "legumbre",
    time: 25, kcal: 200, protein_g: 9, carbs_g: 27, fat_g: 7,
    allergens: ["huevo", "gluten"],
    mainBase: "legumbre",
    tecnica: "horno",
    ingredients: [g("Garbanzos cocidos", 80), g("Zanahoria", 50), g("Huevo", 1, "ud"), g("Copos de avena", 20), g("Aceite de oliva virgen extra", 6, "ml")],
    description: "Hamburguesa vegetal de garbanzo y zanahoria al horno, sin sal",
    steps: [
      "Cocer la zanahoria hasta que se aplaste sin esfuerzo y rallarla o aplastarla.",
      "Aplastar los garbanzos con un tenedor, dejando trocitos.",
      "Mezclar con el huevo y los copos de avena y dejar reposar cinco minutos.",
      "Formar hamburguesas y hornear a 190 grados unos quince minutos, dándoles la vuelta.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Cocer la {{Zanahoria}} hasta que se aplaste sin esfuerzo y rallarla o aplastarla.", 10, "pasivo"),
      paso("Aplastar los {{Garbanzos cocidos}} con un tenedor, dejando trocitos.", 3, "prep"),
      paso("Mezclar con el {{Huevo}} y los {{Copos de avena}} y dejar reposar cinco minutos.", 5, "espera"),
      paso("Formar hamburguesas, pintar con {{Aceite de oliva virgen extra}} y hornear a 190 grados unos quince minutos, dándoles la vuelta.", 15, "pasivo"),
      paso("Dejar templar antes de servir.", 4, "espera"),
    ],
  }),
  base({
    id: "bebes_033",
    name: "Albóndigas de salmón y patata",
    mainProtein: "pescado_azul",
    time: 30, kcal: 220, protein_g: 16, carbs_g: 17, fat_g: 10,
    allergens: ["pescado", "huevo"],
    mainBase: "patatas",
    tecnica: "horno",
    ingredients: [g("Lomos de salmón", 70), g("Patata", 70), g("Huevo", 1, "ud"), g("Perejil", 2), g("Aceite de oliva virgen extra", 6, "ml")],
    description: "Albóndigas suaves de salmón y patata cocida, al horno y sin sal",
    steps: [
      "Revisar el salmón de espinas dos veces y cocerlo al vapor.",
      "Cocer la patata hasta que se deshaga y aplastarla.",
      "Desmigar el salmón y mezclarlo con la patata, el huevo y el perejil.",
      "Formar albóndigas achatadas y hornear a 190 grados unos quince minutos.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Revisar los {{Lomos de salmón}} de espinas dos veces y cocerlos al vapor.", 10, "pasivo"),
      paso("Cocer la {{Patata}} hasta que se deshaga y aplastarla.", 15, "paralelo", 0),
      paso("Desmigar el salmón y mezclarlo con la patata, el {{Huevo}} y el {{Perejil}}.", 3, "prep"),
      paso("Formar albóndigas achatadas, pintar con {{Aceite de oliva virgen extra}} y hornear a 190 grados unos quince minutos.", 15, "pasivo"),
      paso("Dejar templar antes de servir.", 4, "espera"),
    ],
  }),

  // ── Bastones y tiras ────────────────────────────────────────────────────
  base({
    id: "bebes_034",
    name: "Bastones de boniato al horno",
    mainProtein: "none",
    time: 30, kcal: 150, protein_g: 2, carbs_g: 28, fat_g: 5,
    allergens: [],
    mainBase: "patatas",
    mainIngredients: ["verdura"],
    tecnica: "horno",
    ingredients: [g("Boniato", 140), g("Aceite de oliva virgen extra", 6, "ml")],
    description: "Bastones blandos de boniato, del grosor de un dedo, sin sal",
    steps: [
      "Pelar el boniato y cortarlo en bastones del grosor de un dedo adulto.",
      "Aliñar con el aceite y extender en una bandeja sin amontonar.",
      "Hornear a 200 grados unos veinticinco minutos, hasta que se aplasten con los dedos.",
      "Comprobar que ceden a la presión y dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Pelar el {{Boniato}} y cortarlo en bastones del grosor de un dedo adulto. A lo largo, nunca en rodajas: una rodaja tiene el diámetro de la tráquea.", 5, "prep"),
      paso("Aliñar con el {{Aceite de oliva virgen extra}} y extender en una bandeja sin amontonar.", 2, "prep"),
      paso("Hornear a 200 grados unos veinticinco minutos, hasta que se aplasten con los dedos.", 25, "pasivo"),
      paso("Comprobar que ceden a la presión y dejar templar antes de servir.", 4, "espera"),
    ],
  }),
  base({
    id: "bebes_035",
    name: "Zanahoria cocida en bastón con aceite",
    mainProtein: "none",
    time: 18, kcal: 95, protein_g: 1, carbs_g: 12, fat_g: 5,
    allergens: [],
    mainIngredients: ["verdura"],
    tecnica: "olla",
    ingredients: [g("Zanahoria", 120), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Zanahoria bien cocida en bastones, la forma segura de darla",
    steps: [
      "Pelar la zanahoria y cortarla en bastones a lo largo.",
      "Cocerla hasta que un bastón se aplaste con los dedos sin resistencia.",
      "Escurrir, aliñar con el aceite y dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Pelar la {{Zanahoria}} y cortarla en bastones a lo largo. Cruda es de los alimentos con más riesgo de atragantamiento: siempre cocida.", 4, "prep"),
      paso("Cocerla hasta que un bastón se aplaste con los dedos sin resistencia. Si aún cruje, le faltan minutos.", 12, "pasivo"),
      paso("Escurrir, aliñar con el {{Aceite de oliva virgen extra}} y dejar templar antes de servir.", 3, "emplatado"),
    ],
  }),
  base({
    id: "bebes_036",
    name: "Tortilla francesa en tiras",
    mainProtein: "huevo",
    time: 10, kcal: 165, protein_g: 13, carbs_g: 1, fat_g: 12,
    allergens: ["huevo"],
    tecnica: "sarten",
    ingredients: [g("Huevo", 2, "ud"), g("Aceite de oliva virgen extra", 6, "ml")],
    description: "Tortilla fina cortada en tiras, el primer sólido de casi todos",
    steps: [
      "Batir los huevos sin sal.",
      "Cuajar una tortilla fina a fuego medio-bajo, sin dejarla jugosa por dentro.",
      "Dejar templar y cortarla en tiras del ancho de un dedo.",
    ],
    stepsRich: [
      paso("Batir los {{Huevo}} sin sal.", 1, "prep"),
      paso("Cuajar una tortilla fina con {{Aceite de oliva virgen extra}} a fuego medio-bajo, sin dejarla jugosa por dentro: a esta edad el huevo va bien hecho.", 5, "activo"),
      paso("Dejar templar y cortarla en tiras del ancho de un dedo.", 3, "emplatado"),
    ],
  }),
  base({
    id: "bebes_037",
    name: "Brócoli al vapor en árbol",
    mainProtein: "none",
    time: 14, kcal: 90, protein_g: 4, carbs_g: 7, fat_g: 5,
    allergens: [],
    mainIngredients: ["verdura"],
    tecnica: "olla",
    ingredients: [g("Brócoli", 110), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Ramilletes de brócoli al vapor con el tallo largo, para agarrar",
    steps: [
      "Separar el brócoli en ramilletes dejando el tallo largo.",
      "Cocer al vapor hasta que el tallo se atraviese con un tenedor sin esfuerzo.",
      "Aliñar con el aceite y dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Separar el {{Brócoli}} en ramilletes dejando el tallo largo: ese tallo es el asa, y es lo que convierte una verdura en algo que el bebé puede coger.", 4, "prep"),
      paso("Cocer al vapor hasta que el tallo se atraviese con un tenedor sin esfuerzo.", 8, "pasivo"),
      paso("Aliñar con el {{Aceite de oliva virgen extra}} y dejar templar antes de servir.", 3, "emplatado"),
    ],
  }),
  base({
    id: "bebes_038",
    name: "Tiras de aguacate rebozado en avena",
    mainProtein: "none",
    time: 12, kcal: 205, protein_g: 4, carbs_g: 16, fat_g: 14,
    allergens: ["gluten"],
    mainIngredients: ["fruta"],
    tecnica: "horno",
    ingredients: [g("Aguacate", 90), g("Copos de avena", 25), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Aguacate en gajos rebozado en avena para que no resbale",
    steps: [
      "Triturar los copos de avena hasta dejarlos gruesos, como pan rallado.",
      "Cortar el aguacate en gajos a lo largo.",
      "Rebozar cada gajo en la avena, presionando para que se pegue.",
      "Dorar en el horno a 200 grados unos ocho minutos.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Triturar los {{Copos de avena}} hasta dejarlos gruesos, como pan rallado. Aquí NO se usa almendra molida ni ningún fruto seco.", 2, "prep"),
      paso("Cortar el {{Aguacate}} en gajos a lo largo.", 2, "prep"),
      paso("Rebozar cada gajo en la avena, presionando para que se pegue. El rebozado está para que no resbale entre los dedos, que es el problema del aguacate solo.", 3, "prep"),
      paso("Pintar con {{Aceite de oliva virgen extra}} y dorar en el horno a 200 grados unos ocho minutos.", 8, "pasivo"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),

  // ── Platos completos en trozo ───────────────────────────────────────────
  base({
    id: "bebes_039",
    name: "Pasta pequeña con boloñesa de verduras",
    mainProtein: "ternera",
    time: 32, kcal: 245, protein_g: 15, carbs_g: 30, fat_g: 8,
    allergens: ["gluten"],
    mainBase: "pasta",
    cocina: "italiana",
    tecnica: "sarten",
    ingredients: [g("Pasta pequeña", 40), g("Carne picada de ternera", 50), g("Zanahoria", 40), g("Calabacín", 40), g("Tomate triturado", 70), g("Aceite de oliva virgen extra", 6, "ml")],
    description: "Pasta pequeña con boloñesa muy blanda de carne y verdura, sin sal",
    steps: [
      "Rallar la zanahoria y el calabacín muy finos.",
      "Sofreír la carne picada a fuego suave, deshaciéndola con la cuchara.",
      "Añadir la verdura rallada y el tomate y cocer a fuego lento hasta que todo esté muy blando.",
      "Cocer la pasta pequeña dos minutos más de lo que diga el paquete.",
      "Mezclar y dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Rallar la {{Zanahoria}} y el {{Calabacín}} muy finos.", 4, "prep"),
      paso("Sofreír la {{Carne picada de ternera}} con {{Aceite de oliva virgen extra}} a fuego suave, deshaciéndola con la cuchara para que no queden trozos grandes.", 6, "activo"),
      paso("Añadir la verdura rallada y el {{Tomate triturado}} y cocer a fuego lento hasta que todo esté muy blando.", 15, "pasivo"),
      paso("Cocer la {{Pasta pequeña}} dos minutos más de lo que diga el paquete: al dente no vale a esta edad.", 12, "paralelo", 2),
      paso("Mezclar y dejar templar antes de servir.", 4, "emplatado"),
    ],
  }),
  base({
    id: "bebes_040",
    name: "Bolitas de arroz con brócoli y sésamo",
    mainProtein: "none",
    time: 28, kcal: 190, protein_g: 6, carbs_g: 30, fat_g: 6,
    allergens: ["sesamo"],
    mainBase: "arroz",
    mainIngredients: ["verdura"],
    cocina: "asiatica",
    tecnica: "olla",
    ingredients: [g("Arroz", 50), g("Brócoli", 50), g("Semillas de sésamo", 4), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Bolitas de arroz apelmazado con brócoli, se cogen sin deshacerse",
    steps: [
      "Cocer el arroz con más agua de lo normal para que quede pasado y pegajoso.",
      "Cocer el brócoli al vapor y picarlo muy fino.",
      "Triturar las semillas de sésamo hasta dejarlas en polvo.",
      "Mezclar todo y apretar con las manos húmedas formando bolitas.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Cocer el {{Arroz}} con más agua de lo normal para que quede pasado y pegajoso. Aquí el arroz suelto es el enemigo: lo que liga la bolita es el almidón.", 18, "pasivo"),
      paso("Cocer el {{Brócoli}} al vapor y picarlo muy fino.", 8, "paralelo", 0),
      paso("Triturar las {{Semillas de sésamo}} hasta dejarlas en polvo. Enteras no.", 1, "prep"),
      paso("Mezclar todo con el {{Aceite de oliva virgen extra}} y apretar con las manos húmedas formando bolitas.", 4, "activo"),
      paso("Dejar templar antes de servir.", 3, "espera"),
    ],
  }),
  base({
    id: "bebes_041",
    name: "Muffins de patata y champiñón",
    mainProtein: "huevo",
    time: 35, kcal: 195, protein_g: 11, carbs_g: 19, fat_g: 9,
    allergens: ["huevo", "lactosa"],
    mainBase: "patatas",
    tecnica: "horno",
    ingredients: [g("Patata", 90), g("Champiñones", 40), g("Huevo", 1, "ud"), g("Queso rallado", 15), g("Aceite de oliva virgen extra", 5, "ml")],
    description: "Muffins salados sin sal, de patata y champiñón, que se cogen con la mano",
    steps: [
      "Cocer la patata hasta que se deshaga y aplastarla.",
      "Saltear los champiñones muy picados a fuego suave hasta que suelten el agua.",
      "Mezclar la patata con el champiñón, el huevo y el queso rallado.",
      "Repartir en moldes pequeños y hornear a 180 grados unos veinte minutos.",
      "Desmoldar y dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Cocer la {{Patata}} hasta que se deshaga y aplastarla.", 15, "pasivo"),
      paso("Saltear los {{Champiñones}} muy picados con {{Aceite de oliva virgen extra}} a fuego suave hasta que suelten el agua.", 6, "paralelo", 0),
      paso("Mezclar la patata con el champiñón, el {{Huevo}} y el {{Queso rallado}}.", 3, "prep"),
      paso("Repartir en moldes pequeños y hornear a 180 grados unos veinte minutos.", 20, "pasivo"),
      paso("Desmoldar y dejar templar antes de servir.", 5, "espera"),
    ],
  }),
  base({
    id: "bebes_042",
    name: "Pisto muy blando con huevo revuelto",
    mainProtein: "huevo",
    time: 30, kcal: 205, protein_g: 12, carbs_g: 12, fat_g: 13,
    allergens: ["huevo"],
    mainIngredients: ["verdura"],
    tecnica: "sarten",
    ingredients: [g("Calabacín", 60), g("Berenjena", 50), g("Pimiento rojo", 40), g("Tomate triturado", 60), g("Huevo", 1, "ud"), g("Aceite de oliva virgen extra", 7, "ml")],
    description: "Pisto cocinado de más para que se aplaste, con huevo revuelto",
    steps: [
      "Cortar el calabacín, la berenjena y el pimiento en dados pequeños.",
      "Pochar la verdura a fuego suave y tapada hasta que esté muy blanda.",
      "Añadir el tomate triturado y cocer diez minutos más, sin sal.",
      "Cuajar el huevo batido dentro del pisto, removiendo.",
      "Dejar templar antes de servir.",
    ],
    stepsRich: [
      paso("Cortar el {{Calabacín}}, la {{Berenjena}} y el {{Pimiento rojo}} en dados pequeños.", 6, "prep"),
      paso("Pochar la verdura con {{Aceite de oliva virgen extra}} a fuego suave y tapada hasta que esté muy blanda. Aquí se cocina de más a propósito: el punto de un pisto de adulto no vale.", 15, "pasivo"),
      paso("Añadir el {{Tomate triturado}} y cocer diez minutos más, sin sal.", 10, "pasivo"),
      paso("Cuajar el {{Huevo}} batido dentro del pisto, removiendo.", 3, "activo"),
      paso("Dejar templar antes de servir.", 4, "espera"),
    ],
  }),
];

// ── Aplicar ────────────────────────────────────────────────────────────────
const write = process.argv.includes("--write");
const actuales = JSON.parse(readFileSync(BEBES, "utf8"));
const ids = new Set(actuales.map((r) => r.id));
const aAñadir = NUEVAS.filter((r) => !ids.has(r.id));

console.log(`bebes.json: ${actuales.length} recetas`);
console.log(`  cremas:  ${actuales.filter((r) => (r.etapaBebe ?? "cremas") === "cremas").length}`);
console.log(`  solidos: ${actuales.filter((r) => r.etapaBebe === "solidos").length}`);
console.log(`\nNuevas a añadir: ${aAñadir.length} de ${NUEVAS.length}`);
for (const r of aAñadir) console.log(`  ${r.id}  ${r.name}`);

if (write) {
  writeFileSync(BEBES, JSON.stringify([...actuales, ...aAñadir], null, 2) + "\n", "utf8");
  console.log(`\n✅ Escrito. bebes.json → ${actuales.length + aAñadir.length} recetas.`);
} else {
  console.log("\n(informe: nada escrito — pasa --write para aplicar)");
}
