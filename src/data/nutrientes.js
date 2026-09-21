/**
 * LOS NUTRIENTES, DECLARADOS UNA SOLA VEZ.
 *
 * POR QUÉ ESTE FICHERO EXISTE. Hasta hoy los ocho campos de nutrición estaban
 * escritos a mano en seis sitios: los dos esquemas de zod, los dos parsers de
 * tabla, la lista de reparación del aplicador y el acumulador de recetas. Al
 * añadir el hierro y el colesterol se actualizaron cuatro de los seis, y los
 * otros dos fallaron EN SILENCIO:
 *
 *   - el sync solo buscaba ficha a quien no tenía nutrición, así que 173 filas
 *     que ya citaban una ficha ampliada no se rellenaron y el aplicador
 *     informó de «0 aplicados» sin que nada estuviera roto;
 *   - la lista de la reparación «cita una ficha y la contradice» tenía ocho
 *     nombres a mano, así que no vio que a esas filas les faltaban dos campos.
 *
 * Una lista repetida seis veces se desincroniza; lo raro habría sido que no.
 *
 * LA UNIDAD ES PARTE DEL CAMPO, y esto no es pedantería. El sodio de este
 * catálogo estuvo en gramos en 30 filas y en miligramos en las otras 292
 * —cebolla 0,004 junto a cebolla roja 2,5, el mismo alimento con mil veces de
 * diferencia— porque la unidad vivía en la cabeza de quien escribía el número
 * y en ningún sitio más. Declararla aquí la hace comprobable.
 *
 * Y NO, NO HACE FALTA QUE CADA CAMPO TENGA UN CONSUMIDOR HOY. La regla de «ningún
 * campo sin lector» protege contra inventarse estructura, y aquí no se inventa
 * nada: son medidas de laboratorio que las dos tablas ya publican y que salen
 * gratis en la misma pasada. Lo caro de este pipeline es decidir QUÉ FICHA es
 * cada alimento, y eso ya está pagado: 371 decisiones escritas con su motivo.
 * Extraer una columna más ahora cuesta cero; dentro de seis meses cuesta
 * repetir la cadena entera.
 */

/**
 * @typedef {Object} Nutriente
 * @property {"kcal"|"g"|"mg"|"ug"} unidad  por 100 g de alimento
 * @property {string} porRacion             cómo se llama al sumarlo en una receta
 * @property {number} decimales             al redondear por ración
 * @property {boolean} [duro]               sin él no se puede calcular ni comprobar nada
 * @property {string} [nota]
 */

/** @type {Record<string, Nutriente>} */
export const NUTRIENTES = {
  // ── Los cinco duros. Una ficha sin ellos no entra en el catálogo ──────────
  kcal100g:         { unidad: "kcal", porRacion: "kcal",            decimales: 0, duro: true },
  protein100g:      { unidad: "g",    porRacion: "protein_g",       decimales: 1, duro: true },
  carbs100g:        { unidad: "g",    porRacion: "carbs_g",         decimales: 1, duro: true },
  fat100g:          { unidad: "g",    porRacion: "fat_g",           decimales: 1, duro: true },

  // ── Macros secundarios ───────────────────────────────────────────────────
  fiber100g:        { unidad: "g",    porRacion: "fiber_g",         decimales: 1 },
  sugar100g:        { unidad: "g",    porRacion: "sugar_g",         decimales: 1,
                      nota: "BEDCA lo publica en 42 de sus 198 fichas; CIQUAL en el 94 % y USDA en el 77 %." },
  saturatedFat100g: { unidad: "g",    porRacion: "saturated_fat_g", decimales: 1 },

  // ── Minerales ────────────────────────────────────────────────────────────
  sodium100g:       { unidad: "mg",   porRacion: "sodium_mg",       decimales: 0,
                      nota: "Estuvo en gramos en 30 filas hasta el 21 sep 2026. Ver alimentos.test.js." },
  calcium100g:      { unidad: "mg",   porRacion: "calcium_mg",      decimales: 0 },
  iron100g:         { unidad: "mg",   porRacion: "iron_mg",         decimales: 1,
                      nota: "Lo lee deriveHealthFlags para `rico_hierro`, umbral 3,5 mg/ración." },
  magnesium100g:    { unidad: "mg",   porRacion: "magnesium_mg",    decimales: 0 },
  phosphorus100g:   { unidad: "mg",   porRacion: "phosphorus_mg",   decimales: 0 },
  potassium100g:    { unidad: "mg",   porRacion: "potassium_mg",    decimales: 0 },
  zinc100g:         { unidad: "mg",   porRacion: "zinc_mg",         decimales: 1 },
  copper100g:       { unidad: "mg",   porRacion: "copper_mg",       decimales: 2 },
  manganese100g:    { unidad: "mg",   porRacion: "manganese_mg",    decimales: 2 },
  selenium100g:     { unidad: "ug",   porRacion: "selenium_ug",     decimales: 1 },
  iodine100g:       { unidad: "ug",   porRacion: "iodine_ug",       decimales: 1,
                      nota: "CIQUAL lo publica; en USDA SR Legacy la cobertura es casi nula." },

  // ── Vitaminas ────────────────────────────────────────────────────────────
  retinol100g:      { unidad: "ug",   porRacion: "retinol_ug",      decimales: 1 },
  betaCarotene100g: { unidad: "ug",   porRacion: "beta_carotene_ug", decimales: 1 },
  vitaminD100g:     { unidad: "ug",   porRacion: "vitamin_d_ug",    decimales: 2 },
  vitaminE100g:     { unidad: "mg",   porRacion: "vitamin_e_mg",    decimales: 2 },
  vitaminK100g:     { unidad: "ug",   porRacion: "vitamin_k_ug",    decimales: 1 },
  vitaminC100g:     { unidad: "mg",   porRacion: "vitamin_c_mg",    decimales: 1 },
  thiamin100g:      { unidad: "mg",   porRacion: "thiamin_mg",      decimales: 2 },
  riboflavin100g:   { unidad: "mg",   porRacion: "riboflavin_mg",   decimales: 2 },
  niacin100g:       { unidad: "mg",   porRacion: "niacin_mg",       decimales: 2 },
  pantothenicAcid100g: { unidad: "mg", porRacion: "pantothenic_acid_mg", decimales: 2 },
  vitaminB6100g:    { unidad: "mg",   porRacion: "vitamin_b6_mg",   decimales: 2 },
  folate100g:       { unidad: "ug",   porRacion: "folate_ug",       decimales: 1 },
  vitaminB12100g:   { unidad: "ug",   porRacion: "vitamin_b12_ug",  decimales: 2 },

  // ── Lípidos ──────────────────────────────────────────────────────────────
  cholesterol100g:  { unidad: "mg",   porRacion: "cholesterol_mg",  decimales: 0,
                      nota: "Lo nombra el perfil `corazon` de healthProfileMatch.js." },
};

/** Los campos, en orden de declaración. */
export const CAMPOS_NUTRICION = Object.keys(NUTRIENTES);

/** Los que una ficha DEBE traer para poder entrar. */
export const CAMPOS_DUROS = CAMPOS_NUTRICION.filter((c) => NUTRIENTES[c].duro);

/** Los demás: pueden faltar, y su ausencia se cuenta con `coberturaPorCampo`. */
export const CAMPOS_SECUNDARIOS = CAMPOS_NUTRICION.filter((c) => !NUTRIENTES[c].duro);

/** campo por 100 g → nombre del total por ración. */
export const POR_RACION = Object.fromEntries(
  CAMPOS_NUTRICION.map((c) => [c, NUTRIENTES[c].porRacion]),
);
