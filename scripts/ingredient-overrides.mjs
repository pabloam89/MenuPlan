/**
 * Decisiones humanas sobre la canonicalización de ingredientes.
 *
 * build-ingredient-catalog.mjs deriva el id canónico de un nombre libre con la
 * cascada de alias de ingredientImages.js. Esa cascada existe para elegir un
 * DIBUJO, no para decidir identidad de producto, así que fusiona cosas que no
 * son la misma: un solomillo y un entrecot comparten ilustración pero no son
 * el mismo artículo de la compra, y en los casos peores fusionaba productos de
 * perfil alergénico opuesto ("Morcilla de Burgos" acabó dentro de "Ricotta").
 *
 * Este fichero es la corrección, revisada a mano contra los dos informes que
 * genera el script (output/ingredients-review.csv y
 * output/ingredient-merges-review.csv).
 *
 * Se evalúa ANTES que la cascada de arte y gana la PRIMERA regla que casa, así
 * que el orden importa: lo específico arriba, lo genérico abajo ("Aceite de
 * sésamo" tiene que resolverse antes que "sésamo", "Tinta de calamar" antes
 * que "calamar").
 *
 * `match` se aplica sobre el nombre ya normalizado (minúsculas, sin acentos),
 * o sea el resultado de normalizeName() de ingredientCategories.js.
 */

export const INGREDIENT_OVERRIDES = [
  // ── Caldos y fondos ────────────────────────────────────────────────────
  // El caso más grave del informe de fusiones: 22 líneas de "Caldo de pescado"
  // vivían dentro de "Caldo de carne", perdiendo a la vez el alérgeno pescado
  // y el flag de vegetariano. Se separan por origen porque es exactamente lo
  // que cambia entre ellos.
  // CUALQUIER caldo que mencione marisco va aquí, no solo "caldo de marisco":
  // con la regla literal anterior, "Caldo de pescado y marisco" caía en
  // caldo-de-pescado, y como los alérgenos de un ingrediente son la unión de
  // sus variantes, el caldo de pescado normal heredaba `crustaceos` y se lo
  // contagiaba a las 7 recetas que lo usan. Lo detectó el test de coherencia
  // de ingredients.test.js.
  { match: /(caldo|fumet).*marisco/, id: "caldo-de-marisco", name: "Caldo de marisco" },
  { match: /fumet|caldo de pescado/, id: "caldo-de-pescado", name: "Caldo de pescado" },
  { match: /caldo de (carne|cocido|ternera|jamon)/, id: "caldo-de-carne", name: "Caldo de carne" },
  { match: /caldo de (pollo|ave)/, id: "caldo-de-pollo", name: "Caldo de pollo" },
  { match: /caldo (de verduras|vegetal)|caldo casero sin sal/, id: "caldo-de-verduras", name: "Caldo de verduras" },
  { match: /\bcaldo\b/, id: "caldo", name: "Caldo" },

  // ── Aves que la cascada de arte mezcló entre sí ────────────────────────
  // "Pechuga de pato" y "Muslos de pato" caían en pollo (la regla de arte
  // /pechuga/ y /muslo/ no mira de qué animal), y la codorniz dentro del pato.
  // El informe de fusiones NO los detecta: comparten pasillo, dieta y
  // alérgenos, que son las tres señales que mira. Los encontró el test de
  // ida y vuelta de ingredients.test.js.
  { match: /codorniz/, id: "codorniz", name: "Codorniz" },
  { match: /\bpato\b|magret/, id: "pato", name: "Magret de pato" },
  { match: /\bperdiz\b/, id: "perdiz", name: "Perdiz" },

  // ── Fusiones peligrosas: productos de perfil opuesto ───────────────────
  { match: /morcilla/, id: "morcilla", name: "Morcilla" },
  { match: /cabracho/, id: "cabracho", name: "Cabracho" },
  { match: /manitas de cerdo/, id: "manitas-de-cerdo", name: "Manitas de cerdo" },
  { match: /mantequilla de cacahuete/, id: "mantequilla-de-cacahuete", name: "Mantequilla de cacahuete" },
  // "Guindilla en copos" caía dentro de "Copos de avena" y se llevaba un
  // gluten inventado a un picante.
  { match: /guindilla|cayena/, id: "guindilla", name: "Guindilla" },
  { match: /copos de avena|\bavena\b/, id: "avena", name: "Copos de avena" },

  // ── Quesos frescos que la cascada de arte metió en el mismo saco ───────
  // `queso-fresco` había absorbido "Queso brie", "Ricotta", "Ricotta salada" y
  // "Quesito en porciones", y `mozzarella` se llamaba "Burrata".
  //
  // El brie es el que obliga a separarlos: es un queso de corteza enmohecida y
  // intolerances.js lo excluye explícitamente en embarazo (junto a camembert,
  // azul, roquefort…). Escondido dentro de "queso fresco" quedaba invisible
  // para cualquier consumidor que en el futuro filtre por el catálogo de
  // ingredientes en vez de por el nombre del plato.
  { match: /\bbrie\b|camembert/, id: "queso-brie", name: "Queso brie" },
  { match: /burrata/, id: "burrata", name: "Burrata" },
  { match: /mozzarella/, id: "mozzarella", name: "Mozzarella fresca" },
  { match: /ricotta/, id: "ricotta", name: "Ricotta" },
  { match: /quesito/, id: "quesito", name: "Quesito en porciones" },
  { match: /queso fresco/, id: "queso-fresco", name: "Queso fresco" },

  // ── Derivados que no son su materia prima ──────────────────────────────
  { match: /aceite de sesamo/, id: "aceite-de-sesamo", name: "Aceite de sésamo" },
  { match: /sesamo|gomasio/, id: "sesamo", name: "Semillas de sésamo" },
  // Los pepinillos van antes que el vinagre: "Pepinillos en vinagre" es un
  // encurtido, no un vinagre, y la regla genérica se los llevaba.
  { match: /pepinillo/, id: "pepinillos", name: "Pepinillos" },
  { match: /vinagre (balsamico|de modena)/, id: "vinagre-balsamico", name: "Vinagre balsámico" },
  { match: /vinagre de manzana/, id: "vinagre-de-manzana", name: "Vinagre de manzana" },
  { match: /vinagre de jerez/, id: "vinagre-de-jerez", name: "Vinagre de Jerez" },
  { match: /vinagre/, id: "vinagre", name: "Vinagre" },
  // Ciruela pasa y uva pasa son dos productos: van separados, y la ciruela
  // tiene que resolverse antes de que `\bpasas\b` se la lleve.
  { match: /ciruelas? pasas?/, id: "ciruelas-pasas", name: "Ciruelas pasas" },
  { match: /uvas pasas|\bpasas\b/, id: "pasas", name: "Pasas" },
  { match: /\bpesto\b/, id: "pesto", name: "Pesto" },
  { match: /albahaca/, id: "albahaca", name: "Albahaca fresca" },
  { match: /tinta de calamar/, id: "tinta-de-calamar", name: "Tinta de calamar" },
  { match: /calamar|chipiron|chopito/, id: "calamar", name: "Calamar" },
  { match: /corazones de alcachofa|alcachofas? (en conserva|confitada)/, id: "alcachofa-conserva", name: "Corazones de alcachofa" },
  { match: /alcachofa/, id: "alcachofa", name: "Alcachofas" },
  // Las tortillas van antes que `maiz`/`trigo`, o "Tortilla de maíz" acabaría
  // dentro del maíz en grano.
  { match: /tortillas? de trigo/, id: "tortilla-de-trigo", name: "Tortillas de trigo" },
  { match: /tortillas? de maiz/, id: "tortilla-de-maiz", name: "Tortillas de maíz" },
  { match: /nachos/, id: "nachos", name: "Nachos de maíz" },
  { match: /maiz/, id: "maiz", name: "Maíz" },

  // ── Conservas de tomate: tres productos distintos, un solo id antes ────
  { match: /tomates? secos?/, id: "tomate-seco", name: "Tomate seco en aceite" },
  { match: /tomate frito/, id: "tomate-frito", name: "Tomate frito" },
  { match: /tomate concentrado|concentrado de tomate|pasta de tomate/, id: "tomate-concentrado", name: "Tomate concentrado" },
  { match: /tomate (triturado|en conserva)/, id: "tomate-triturado", name: "Tomate triturado" },

  // ── Duplicados casi idénticos: mismo producto, nombre distinto ─────────
  // Todo esto salía como ingredientes separados en ingredients-review.csv.
  { match: /salsa (worcestershire|perrins)|worcester|salsa de pescado|nam pla/, id: "salsa-worcestershire", name: "Salsa Worcestershire" },
  { match: /\bfoie\b/, id: "foie", name: "Foie mi-cuit" },
  { match: /filete de ternera para milanesa|filetes? de ternera/, id: "filete-de-ternera", name: "Filetes de ternera" },
  { match: /chuleton/, id: "chuleton-de-ternera", name: "Chuletón de ternera" },
  { match: /carrillada/, id: "carrillada", name: "Carrillada" },
  { match: /jarrete|oss?obuco/, id: "jarrete-de-ternera", name: "Jarrete de ternera" },
  { match: /carne de cocido/, id: "carne-de-cocido", name: "Carne de cocido" },
  { match: /rodaballo/, id: "rodaballo", name: "Rodaballo" },
  { match: /lenguado/, id: "lenguado", name: "Lenguado" },
  // Lubina y corvina comparten ilustración pero son dos pescados y dos precios.
  { match: /corvina/, id: "corvina", name: "Corvina" },
  { match: /edamame/, id: "edamame", name: "Edamame" },
  { match: /frutos rojos/, id: "frutos-rojos", name: "Frutos rojos" },
  { match: /\bagua\b/, id: "agua", name: "Agua" },
  { match: /cerveza/, id: "cerveza", name: "Cerveza" },
  { match: /boletus/, id: "boletus", name: "Boletus" },
  { match: /mezclum|mezcla de hojas verdes|hojas verdes/, id: "hojas-verdes", name: "Hojas verdes variadas" },
  { match: /vol-?au-?vent/, id: "vol-au-vent", name: "Vol-au-vent de hojaldre" },
  { match: /hojaldre/, id: "hojaldre", name: "Hojaldre" },
  { match: /\boblea/, id: "obleas", name: "Obleas" },
  { match: /salvia/, id: "salvia", name: "Salvia fresca" },
  { match: /almendra/, id: "almendras", name: "Almendras" },
  { match: /avellana/, id: "avellanas", name: "Avellanas" },
  { match: /judias? verdes?/, id: "judia-verde", name: "Judías verdes" },
  { match: /pimiento choricero|\bnora\b/, id: "pimiento-choricero", name: "Pimiento choricero" },
  { match: /linguine/, id: "linguine", name: "Linguine" },
  { match: /lasan/, id: "lasana", name: "Láminas de lasaña" },
];

/**
 * Primer override que casa con un nombre normalizado, o null.
 * @param {string} normalized - nombre ya pasado por normalizeName()
 */
export function overrideFor(normalized) {
  for (const rule of INGREDIENT_OVERRIDES) {
    if (rule.match.test(normalized)) return rule;
  }
  return null;
}
