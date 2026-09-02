/**
 * Sustituciones de ingrediente, revisadas a mano — Fase 3.
 *
 * Convierte en datos lo que hoy hace src/lib/substitutions.js concatenando
 * strings (`"Nata" + " sin lactosa"`) sobre una lista de palabras clave.
 *
 * LA REGLA QUE MANDA, heredada de substitutions.js: una sustitución solo vale
 * si es INVISIBLE para el resto de la mesa. El plato tiene que saber y verse
 * igual, porque el objetivo es adaptar el menú familiar sin bifurcarlo. Si el
 * cambio se nota, no es una sustitución: es otro plato.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DISTINCIÓN CRÍTICA, no tocar sin pensarlo dos veces:
 *
 *   "sin lactosa" NO es "sin leche".
 *
 * Un producto sin lactosa conserva la proteína láctea. Sirve para la
 * INTOLERANCIA (`lactosa_fina`) y no sirve —ni de lejos— para el ALÉRGENO
 * (`leche`), que tiene que seguir excluyendo el plato de forma dura. Por eso
 * `restriction` apunta siempre a un id de INTOLERANCE_RULES, nunca a un
 * alérgeno de EU_ALLERGENS.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Por qué curado y no derivado de las keywords de substitutions.js: derivarlo
 * heredaría sus falsos positivos. Medido contra el catálogo real, esas reglas
 * hoy producen adaptaciones que no existen o no hacen falta:
 *   · "Leche de coco sin lactosa"  — la leche de coco no lleva lactosa
 *   · "Vinagre sin alcohol"        — su alcohol ya fermentó en ácido acético,
 *                                    como dice el propio comentario de
 *                                    intolerances.js sobre el vinagre de Jerez
 *   · "Ron/Vodka/Whisky/Brandy sin alcohol" — no son productos de súper, a
 *                                    diferencia de la cerveza sin
 *
 * Los destilados quedan deliberadamente FUERA: sin sustituto real, la receta
 * debe seguir excluyéndose para embarazo/lactancia en vez de fingir que se
 * adapta.
 */

export const INGREDIENT_SUBSTITUTIONS = [
  // ── Intolerancia a la lactosa ────────────────────────────────────────────
  // Todos son productos normales de supermercado en España, y el nombre se lee
  // natural con el sufijo ("Nata para cocinar sin lactosa").
  { ingredientId: "leche", restriction: "lactosa_fina", replacementLabel: "Leche sin lactosa" },
  { ingredientId: "nata", restriction: "lactosa_fina", replacementLabel: "Nata para cocinar sin lactosa" },
  {
    ingredientId: "bechamel",
    restriction: "lactosa_fina",
    replacementLabel: "Bechamel sin lactosa",
    // Único caso que no es "compra otro producto" sino "prepárala igual con
    // otro ingrediente". Por eso se mantiene aunque no exista una bechamel sin
    // lactosa embotellada: la que lleva el plato se hace en casa.
    note: "Se hace igual, con leche sin lactosa.",
  },
  {
    ingredientId: "queso-fresco",
    restriction: "lactosa_fina",
    replacementLabel: "Queso fresco sin lactosa",
  },
  { ingredientId: "yogur", restriction: "lactosa_fina", replacementLabel: "Yogur natural sin lactosa" },
  { ingredientId: "nata-para-montar", restriction: "lactosa_fina", replacementLabel: "Nata para montar sin lactosa" },
  { ingredientId: "leche-condensada", restriction: "lactosa_fina", replacementLabel: "Leche condensada sin lactosa" },

  // ── Alcohol de cocina (embarazo / lactancia) ─────────────────────────────
  // Solo los fermentados. No es una afirmación de que sean estrictamente 0,0%:
  // es un producto real y nombrado, mismo criterio que ya aplicaba
  // substitutions.js.
  //
  // Dato de contraste, no criterio: en el catálogo de Mercadona solo la CERVEZA
  // aparece sin alcohol (18 referencias); vino (59 productos), cava (8) y sidra
  // (4) no tienen ninguna. Se mantienen igualmente por lo mismo que los lácteos
  // de abajo — la pregunta es si el producto existe en España, no si lo tiene
  // una cadena concreta, y el usuario elige súper en el onboarding.
  { ingredientId: "vino-blanco", restriction: "alcohol_cocina", replacementLabel: "Vino blanco sin alcohol" },
  { ingredientId: "vino-tinto", restriction: "alcohol_cocina", replacementLabel: "Vino tinto sin alcohol" },
  { ingredientId: "cerveza", restriction: "alcohol_cocina", replacementLabel: "Cerveza sin alcohol" },
  { ingredientId: "cava", restriction: "alcohol_cocina", replacementLabel: "Cava sin alcohol" },
  { ingredientId: "sidra", restriction: "alcohol_cocina", replacementLabel: "Sidra sin alcohol" },
];

/**
 * Ingredientes que las reglas de keywords de substitutions.js SÍ adaptan y que
 * aquí se dejan fuera a propósito. Documentado como datos —y no solo en un
 * comentario— para que un test pueda comprobar que la omisión es deliberada y
 * no un despiste al curar la lista.
 */
export const DELIBERATELY_NOT_SUBSTITUTABLE = {
  "leche-coco": "La leche de coco no lleva lactosa: no hay nada que sustituir.",
  vinagre: "El alcohol del vinagre ya fermentó en ácido acético; no es una bebida alcohólica.",
  "vinagre-balsamico": "Igual que el vinagre.",
  "vinagre-de-jerez": "Igual que el vinagre.",
  "vinagre-de-manzana": "Igual que el vinagre.",
  brandy: "No existe brandy sin alcohol de súper; sin sustituto real la receta debe excluirse.",
  ron: "Ídem brandy.",
  vodka: "Ídem brandy.",
  whisky: "Ídem brandy.",
  "licor-de-cafe": "Ídem brandy.",
  cointreau: "Ídem brandy.",
  "pedro-ximenez": "Vino generoso; su versión sin alcohol no es un producto equivalente.",
  "jerez-seco": "Ídem Pedro Ximénez.",
  // Lácteos cuya versión sin lactosa es RARA en España. No están fuera por no
  // salir en el catálogo de Mercadona: ese catálogo es de UNA cadena, y el
  // onboarding deja elegir súper ("¿En qué supermercado compras?"), así que
  // usarlo como regla global sería decidir por Día o Carrefour con datos de
  // Mercadona. Es evidencia, no norma.
  //
  // La pregunta que decide esta lista es "¿existe el producto en España?", no
  // "¿lo tiene mi súper?". Lo segundo es cosa de la lista de la compra, que ya
  // sabe casar ingredientes con productos de tienda (productMatcher.js) y puede
  // avisar de que algo no está sin negar la adaptación a todo el mundo.
  mozzarella: "La mozzarella sin lactosa existe pero es rara; no es un producto de compra habitual.",
  ricotta: "Ídem mozzarella.",
  burrata: "Ídem mozzarella.",
  mascarpone: "Ídem mozzarella.",
  requeson: "Ídem mozzarella.",
};
