/**
 * Lo que se puede pedir de un plato, en un solo sitio: lo leen el enrutador
 * (la vía rápida) y las herramientas de Lola. Si cada uno tiene su copia, la
 * que se queda atrás contesta rápido y mal: «más carbos para el jueves» entraba
 * por la vía rápida sin el eje y salían tres platos cualquiera.
 *
 * Sin el motor a propósito: el enrutador no debe cargarlo. nutrientes.js y
 * perfiles.js no importan nada pesado.
 */

import { NUTRIENTES } from "../../src/data/nutrientes.js";
import { PERFILES, IDS_PERFILES } from "../../src/lib/derive/perfiles.js";

// El nombre que entiende el modelo para cada nutriente del registro. Los ejes
// salen del registro (src/data/nutrientes.js); esto solo los nombra. Uno nuevo
// sin nombre aquí sale con su campo tal cual, y el test lo caza.
const NOMBRES = {
  kcal: ["calorias", "calorías"],
  protein_g: ["proteina", "proteína"],
  carbs_g: ["carbohidratos", "carbohidratos"],
  fat_g: ["grasa", "grasa"],
  fiber_g: ["fibra", "fibra"],
  sugar_g: ["azucar", "azúcar"],
  saturated_fat_g: ["grasa_saturada", "grasa saturada"],
  sodium_mg: ["sodio", "sodio (sal)"],
  calcium_mg: ["calcio", "calcio"],
  iron_mg: ["hierro", "hierro"],
  magnesium_mg: ["magnesio", "magnesio"],
  phosphorus_mg: ["fosforo", "fósforo"],
  potassium_mg: ["potasio", "potasio"],
  zinc_mg: ["zinc", "zinc"],
  copper_mg: ["cobre", "cobre"],
  manganese_mg: ["manganeso", "manganeso"],
  selenium_ug: ["selenio", "selenio"],
  iodine_ug: ["yodo", "yodo"],
  retinol_ug: ["vitamina_a", "vitamina A"],
  beta_carotene_ug: ["betacaroteno", "betacaroteno"],
  vitamin_d_ug: ["vitamina_d", "vitamina D"],
  vitamin_e_mg: ["vitamina_e", "vitamina E"],
  vitamin_k_ug: ["vitamina_k", "vitamina K"],
  vitamin_c_mg: ["vitamina_c", "vitamina C"],
  thiamin_mg: ["vitamina_b1", "vitamina B1"],
  riboflavin_mg: ["vitamina_b2", "vitamina B2"],
  niacin_mg: ["vitamina_b3", "vitamina B3"],
  pantothenic_acid_mg: ["vitamina_b5", "vitamina B5"],
  vitamin_b6_mg: ["vitamina_b6", "vitamina B6"],
  folate_ug: ["folato", "folato"],
  vitamin_b12_ug: ["vitamina_b12", "vitamina B12"],
  cholesterol_mg: ["colesterol", "colesterol"],
};
export const CAMPOS_SIN_NOMBRE = Object.values(NUTRIENTES).map((n) => n.porRacion).filter((c) => !NOMBRES[c]);

/**
 * Cada eje: `campo` (nombre por ración de nutrientes.js) para los nutrientes;
 * `derivado` para los que se calculan del plato entero (registro: ejes 3 y 10).
 */
export const EJES = Object.fromEntries([
  ...Object.values(NUTRIENTES).map((n) => {
    const [id, etiqueta] = NOMBRES[n.porRacion] ?? [n.porRacion, n.porRacion];
    return [id, { campo: n.porRacion, etiqueta }];
  }),
  ["carga", { derivado: "carga", etiqueta: "lo que sacia", registro: "carga" }],
  ["densidadNutricional", { derivado: "densidad", etiqueta: "calorías por 100 g", registro: "densidadNutricional" }],
]);
export const IDS_EJES = Object.keys(EJES);

export const ESQUEMA_RASGOS = {
  type: "object",
  description: "Opcional: lo que piden del plato, tal cual lo dicen. «Reconfortante», «de cuchara», «que no pique», «barato», «fresquito»… Solo los que digan.",
  properties: {
    connotacion: { type: "string", enum: ["reconfortante", "fresco", "casero", "festivo"] },
    textura: { type: "string", enum: ["cuchara", "tenedor", "mano"], description: "cuchara = sopas, cremas, guisos; mano = para picar o bocadillo." },
    picante: { type: "string", enum: ["sin", "con"], description: "sin = que no pique; con = que pique." },
    sabor: { type: "string", enum: ["suave", "intenso", "especiado", "dulce", "acido", "ahumado"] },
    coste: { type: "string", enum: ["economico", "medio", "caro"], description: "economico = barato (menos de 1 € por ración)." },
    calorias: { type: "string", enum: ["ligero", "medio", "contundente"], description: "Para «algo contundente»; para «ligero» usa estilo." },
  },
  additionalProperties: false,
};

export const ESQUEMA_EJES = {
  type: "array",
  minItems: 1,
  maxItems: 3,
  description: "Opcional: «más» o «menos» de un nutriente, comparado con el plato que ya está en ese hueco; si piden varios, todos a la vez («más proteína y menos grasa»). Cualquier nutriente: «más carbos» → carbohidratos, «menos sal» → sodio, «más hierro» → hierro. carga = lo que sacia («que llene»); densidadNutricional = kcal por 100 g («que pese menos»). «Ligero» sigue siendo estilo. Solo si lo piden.",
  items: {
    type: "object",
    properties: {
      cual: { type: "string", enum: IDS_EJES },
      direccion: { type: "string", enum: ["mas", "menos"] },
    },
    required: ["cual", "direccion"],
    additionalProperties: false,
  },
};

export const ESQUEMA_PERFIL = {
  type: "string",
  enum: IDS_PERFILES,
  description: `Opcional: un perfil del plato entero, varios nutrientes a la vez. ${IDS_PERFILES.map((id) => `${id} = ${PERFILES[id].etiqueta}`).join("; ")}. «Más completo», «que tenga de todo», «un compendio de proteína, grasa e hidratos» → equilibrado. Solo para el plato principal.`,
};
