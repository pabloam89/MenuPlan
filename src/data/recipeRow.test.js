import { describe, expect, it } from "vitest";

import { rowToRecipe } from "./recipeRow.js";
import { RecipeSchema } from "./recipeSchema.js";

/**
 * EL FUSIBLE DEL ESPEJO.
 *
 * El catálogo vive en dos sitios: el JSON del bundle (fuente) y la tabla
 * `recipes` de Supabase (espejo, para poder cambiarlo sin publicar la app).
 * `rowToRecipe` es el único puente entre los dos, y es la pieza que más veces
 * se ha roto sin que saltara nada.
 *
 * El patrón, cinco veces repetido: alguien añade un campo al JSON y al schema,
 * nadie se acuerda de tocar el puente, y el campo se pierde EN SILENCIO para
 * toda receta servida desde la nube. No hay excepción, ni log, ni test rojo —
 * el campo llega `undefined` y el motor se comporta como si la receta no lo
 * tuviera nunca. Le pasó a `apetecible`, `montaje`, `estrella`, `occasion` y
 * `extraProteins`, y cada uno se descubrió por su cuenta meses después. El de
 * `estrella` dejaba el pool principal del generador a CERO.
 *
 * Esto no arregla el pasado: impide el sexto. Si añades un campo a
 * RecipeSchema y no lo mapeas, este test se pone rojo y te dice cuál.
 */

const shapeOf = (schema) => schema.shape ?? schema._def?.schema?.shape;
const CAMPOS_DEL_SCHEMA = Object.keys(shapeOf(RecipeSchema));

/**
 * Campos que NO viajan a propósito, cada uno con su razón. Añadir algo aquí es
 * una decisión que se toma a mano y se justifica — que es exactamente lo que
 * no pasó las cinco veces anteriores.
 */
const NO_VIAJAN = {
  // Se deriva al cargar, venga de donde venga la receta (lib/healthFlags.js,
  // withHealthFlags en recipeCatalog.js). Mandarlo sería redundante y podría
  // contradecir a lo que la app calcula.
  healthFlags: "se deriva al cargar, no se transporta",
  // Cero recetas del catálogo lo escriben: es un campo de las recetas propias
  // del usuario, que van por otra tabla (user_recipes) y otro mapeador.
  scalesWithEaters: "0 filas en el catálogo; es de user_recipes",
  // `aporte` es el OVERRIDE a mano de lo que `lib/aporte.js` deriva de los
  // ingredientes (mismo patrón que `mainBase` sobre el regex de `getCarbType`).
  // Hoy lo declaran CERO recetas, así que no viajar no pierde nada: una receta
  // servida desde la nube se deriva igual que una del bundle.
  //
  // El día que se cure a mano —que es para lo que existe— hace falta columna
  // `aporte text[]` en `recipes`, su línea en `rowToRecipe`, y quitar esta
  // entrada. Ojo: las cinco columnas de la 0051 llevan aplicadas desde
  // septiembre y siguen VACÍAS porque el catálogo no se ha vuelto a subir;
  // añadir la columna antes de tener el dato repetiría eso.
  aporte: "se deriva en runtime (lib/aporte.js); 0 recetas lo declaran todavía",
  // Todo lo que sigue solo lo llevan las recetas `type: "base"`, y esas NO se
  // sirven nunca desde Supabase: bases.json se importa directamente en
  // recipeCatalog.js, siempre desde el bundle. Serían columnas muertas.
  baseKey: "solo recetas type:base, que van siempre en el bundle",
  rinde: "solo las 7 recetas type:base",
  minutosFijos: "solo las 7 recetas type:base",
  minutosPorRacion: "solo las 7 recetas type:base",
  capacidadMax: "solo las 7 recetas type:base",
  reactivacion: "solo recetas type:base, que van siempre en el bundle",
  conservacion: "solo recetas type:base, que van siempre en el bundle",
};

/**
 * Una fila con TODAS las columnas rellenas. Los valores no importan (nadie los
 * valida aquí); lo que importa es que estén presentes, para que un campo que
 * el mapeador copia con `...(row.x ? {} : {})` no desaparezca por venir vacío
 * y se confunda "no mapeado" con "vino null".
 */
const FILA_COMPLETA = {
  id: "carnes_001",
  name: "Receta de prueba",
  category: "carnes",
  main_protein: "pollo",
  main_base: "arroz",
  base_mode: "aparte",
  bases_aparte: ["sofrito"],
  montaje: false,
  apetecible: true,
  estrella: true,
  occasion: "diario",
  kid_favourite: false,
  tecnica: "sarten",
  cocina: "italiana",
  lleva_salsa: true,
  etapa_bebe: "cremas",
  can_be_garnish: false,
  main_ingredients: ["verdura"],
  extra_proteins: ["cerdo"],
  sauce_id: "salsas_001",
  sauce_compat: ["carne_blanca"],
  meal_roles: ["segundo"],
  type: "completo",
  base_dish_id: "carnes_002",
  required_appliance: "horno",
  time_minutes: 30,
  difficulty: "facil",
  season: "all",
  kcal: 500,
  protein_g: 30,
  carbs_g: 40,
  fat_g: 20,
  fiber_g: 5,
  sugar_g: 3,
  saturated_fat_g: 4,
  sodium_mg: 600,
  base_servings: 4,
  kid_friendly: true,
  tupper_friendly: true,
  allergens: ["gluten"],
  ingredients: [{ name: "Pollo", amount: 400, unit: "g", ingredientId: "pollo" }],
  steps: ["Cocinar."],
  steps_rich: [{ text: "Cocinar.", minutes: 30, kind: "activo", part: "principal" }],
  freezable: false,
  thaw_steps: [{ text: "Descongelar.", minutes: 10, kind: "espera" }],
  description: "Una receta de prueba.",
  methods: [{ appliance: "horno", time: 40, difficulty: "facil", prepSummary: "Al horno." }],
  product_aliases: ["pollo entero"],
  effort: "cazo",
  dessert_kind: "fruta",
};

describe("rowToRecipe · el fusible del espejo", () => {
  it("no pierde ningún campo del schema que no esté declarado como que no viaja", () => {
    const recipe = rowToRecipe(FILA_COMPLETA);
    const perdidos = CAMPOS_DEL_SCHEMA
      .filter((campo) => recipe[campo] === undefined)
      .filter((campo) => !(campo in NO_VIAJAN));

    // El mensaje es el test: si esto salta, alguien añadió un campo y el
    // espejo no lo sabe. O se mapea en recipeRow.js (y se añade su columna en
    // una migración), o se declara en NO_VIAJAN con su razón.
    expect(
      perdidos,
      `Estos campos existen en RecipeSchema y NO llegan desde Supabase: ${perdidos.join(", ")}.\n`
      + "Se pierden en silencio para toda receta servida desde la nube.\n"
      + "Arréglalo en src/data/recipeRow.js (+ su columna), o declara por qué no viaja en NO_VIAJAN.",
    ).toEqual([]);
  });

  it("la lista de excepciones no se pudre: todo lo que declara sigue existiendo en el schema", () => {
    const fantasmas = Object.keys(NO_VIAJAN).filter((campo) => !CAMPOS_DEL_SCHEMA.includes(campo));
    expect(
      fantasmas,
      `NO_VIAJAN nombra campos que ya no están en RecipeSchema: ${fantasmas.join(", ")}. Bórralos.`,
    ).toEqual([]);
  });

  it("no inventa campos que el schema no conoce", () => {
    const recipe = rowToRecipe(FILA_COMPLETA);
    const inventados = Object.keys(recipe).filter((k) => !CAMPOS_DEL_SCHEMA.includes(k));
    expect(inventados, `rowToRecipe devuelve campos fuera del schema: ${inventados.join(", ")}`).toEqual([]);
  });

  // Los booleanos son el caso que más se equivoca: `freezable: false` y
  // `montaje: false` son JUICIOS YA TOMADOS, no ausencia de dato, y tienen que
  // sobrevivir el viaje. Copiarlos con `...(row.x ? …)` los convertiría en
  // undefined, que el motor lee como "sin decidir".
  it("un booleano en false sobrevive: no es lo mismo que ausente", () => {
    const recipe = rowToRecipe(FILA_COMPLETA);
    for (const campo of ["montaje", "freezable", "kidFavourite", "canBeGarnish"]) {
      expect(recipe[campo], `${campo}: false se ha perdido por el camino`).toBe(false);
    }
  });

  // Y el simétrico: una BD sin migrar no trae la columna, y ahí `undefined` SÍ
  // es la respuesta correcta — el campo no debe aparecer como `false`.
  it("una columna que no existe todavía deja el campo ausente, no en false", () => {
    const { montaje: _m, freezable: _f, estrella: _e, ...sinColumnas } = FILA_COMPLETA;
    const recipe = rowToRecipe(sinColumnas);
    expect("montaje" in recipe).toBe(false);
    expect("freezable" in recipe).toBe(false);
    expect("estrella" in recipe).toBe(false);
  });
});
