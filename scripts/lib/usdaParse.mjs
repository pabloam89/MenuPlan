/**
 * USDA FoodData Central, subconjunto SR Legacy: la tercera tabla.
 *
 * POR QUÉ SR LEGACY Y NO EL VOLCADO ENTERO. FoodData Central publica varios
 * conjuntos y solo uno es una tabla de composición como BEDCA o CIQUAL: SR
 * Legacy, 7.793 alimentos analizados en laboratorio. Los otros —sobre todo
 * `Branded Foods`, con más de 300.000 filas— son etiquetas de producto
 * declaradas por el fabricante. Mezclarlos sería meter dato colaborativo de
 * marca en un catálogo que hoy es todo tablas oficiales, y eso es una decisión
 * de calidad, no un detalle de descarga.
 *
 * PARA QUÉ HACÍA FALTA UNA TERCERA. Dos huecos que las otras dos no cierran:
 *
 *   1. El DESPIECE. CIQUAL es francesa y no corta donde corta una carnicería
 *      española: no tiene morcillo, ni jarrete, ni entraña, ni oreja. USDA sí
 *      —`Beef, shank crosscuts`, `Beef, plate, skirt steak`, `Pork, ears`—
 *      porque el despiece americano coincide más de lo que parece.
 *   2. El AZÚCAR. BEDCA lo publica en 42 de sus 198 fichas (21 %), y esa es
 *      la razón de que el azúcar de las recetas se sostenga hoy sobre la mitad
 *      del plato. Ver `cobertura_media_por_campo` en derived/_meta.json.
 *
 * EL ATWATER, QUE AQUÍ SE HACE BIEN. USDA no calcula la energía con el 4/4/9
 * general: usa factores ESPECÍFICOS por alimento, y los publica. De sus 7.793
 * fichas, 4.693 traen los suyos y solo 276 usan el general. Los más repetidos
 * son 4,27/9,02/3,87 en carnes y 2,44/8,37/3,57 en verduras.
 *
 * Con CIQUAL hubo que EXENTAR la comprobación porque su convención de energía
 * era otra —suma la fibra a 2 kcal/g, Reglamento UE 1169/2011— y aplicarle la
 * fórmula de BEDCA rechazaba ocho fichas buenas. Aquí no hace falta exentar
 * nada: se comprueba con los factores que la propia ficha declara, que es más
 * estricto que el 4/4/9 y no menos.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mayContainAlcohol } from "./bedcaAtwater.mjs";
import { CAMPOS_NUTRICION } from "../../src/data/nutrientes.js";

/** nutrient_id de FDC para los ocho campos. El sodio viene en MG, que es la
 *  unidad del catálogo: no hay conversión y por tanto no hay dónde perderla. */
export const NUTRIENT_IDS = {
  1008: "kcal100g",
  1003: "protein100g",
  1005: "carbs100g",
  1004: "fat100g",
  1079: "fiber100g",
  2000: "sugar100g",
  1258: "saturatedFat100g",
  // Los 24 minerales y vitaminas, con los MISMOS id y las MISMAS unidades que
  // declara CIQUAL: comprobado uno a uno contra nutrient.csv, que publica la
  // unidad de cada uno. Ni aquí ni en el parser de CIQUAL se convierte nada.
  1093: "sodium100g",
  1087: "calcium100g",
  1089: "iron100g",
  1090: "magnesium100g",
  1091: "phosphorus100g",
  1092: "potassium100g",
  1095: "zinc100g",
  1098: "copper100g",
  1101: "manganese100g",
  1103: "selenium100g",     // UG
  1100: "iodine100g",       // UG — SR Legacy casi no lo trae; CIQUAL sí
  1105: "retinol100g",      // UG
  1107: "betaCarotene100g", // UG
  1114: "vitaminD100g",     // UG
  1109: "vitaminE100g",
  1185: "vitaminK100g",     // UG
  1162: "vitaminC100g",
  1165: "thiamin100g",
  1166: "riboflavin100g",
  1167: "niacin100g",
  1170: "pantothenicAcid100g",
  1175: "vitaminB6100g",
  1177: "folate100g",       // UG
  1178: "vitaminB12100g",   // UG
  1253: "cholesterol100g",
};

/** Lee un CSV de FDC quedándose con los primeros campos, que son los numéricos
 *  y por tanto no llevan comas dentro. */
function filas(texto, regex) {
  const out = [];
  for (const linea of texto.split("\n")) {
    const m = linea.match(regex);
    if (m) out.push(m);
  }
  return out;
}

/**
 * @param {string} dir  carpeta con los CSV de SR Legacy
 * @returns {Map<string, {code:string, nombre:string, nutricion:object, factores:{P:number,G:number,C:number}|null}>}
 */
export function cargarUsda(dir) {
  const leer = (f) => readFileSync(join(dir, f), "utf8");

  // 1. Los alimentos. La descripción lleva comas, así que se ancla por los
  //    campos de alrededor en vez de partir por comas.
  const alimentos = new Map();
  for (const m of filas(leer("food.csv"), /^"(\d+)","[^"]*","(.*)","\d*","/)) {
    alimentos.set(m[1], {
      code: m[1],
      nombre: m[2].replace(/""/g, '"'),
      nutricion: {},
      factores: null,
    });
  }

  // 2. Los valores. 36 MB y ~700.000 filas: solo se leen los cuatro primeros
  //    campos y solo se guardan los ocho nutrientes que interesan.
  for (const m of filas(leer("food_nutrient.csv"), /^"(\d+)","(\d+)","(\d+)","([^"]*)"/)) {
    const campo = NUTRIENT_IDS[m[3]];
    if (!campo) continue;
    const alim = alimentos.get(m[2]);
    if (!alim) continue;
    const v = m[4] === "" ? null : Number(m[4]);
    if (v == null || !Number.isFinite(v)) continue;
    alim.nutricion[campo] = v;
  }

  // 3. Los factores de Atwater propios, en dos saltos:
  //    food_nutrient_conversion_factor (id → fdc_id) y luego
  //    food_calorie_conversion_factor (ese id → P/G/C).
  const fdcPorFactor = new Map();
  for (const m of filas(leer("food_nutrient_conversion_factor.csv"), /^"(\d+)","(\d+)"/)) {
    fdcPorFactor.set(m[1], m[2]);
  }
  for (const m of filas(
    leer("food_calorie_conversion_factor.csv"),
    /^"(\d+)","([\d.]*)","([\d.]*)","([\d.]*)"/,
  )) {
    const fdc = fdcPorFactor.get(m[1]);
    const alim = fdc && alimentos.get(fdc);
    if (!alim) continue;
    const P = Number(m[2]);
    const G = Number(m[3]);
    const C = Number(m[4]);
    if ([P, G, C].every(Number.isFinite)) alim.factores = { P, G, C };
  }

  return alimentos;
}

/** Energía que cabe esperar de los macros, con los factores de ESTA ficha. */
export function energiaEsperadaUsda(n, factores) {
  const f = factores ?? { P: 4, G: 9, C: 4 };
  return f.P * (n.protein100g ?? 0) + f.G * (n.fat100g ?? 0) + f.C * (n.carbs100g ?? 0);
}

/**
 * Las que sirven: con los cuatro macros duros y con la energía coherente con
 * sus propios factores.
 *
 * El ALCOHOL sigue exento, y no es una excepción nueva: es la misma que ya
 * tienen el triaje de BEDCA y el sync de CIQUAL, porque el etanol aporta
 * 7 kcal/g y no entra en ninguna fórmula de macros, tenga los factores que
 * tenga. Sin esto, el ron, la cerveza, la sidra, el mirin y el jerez se caían
 * antes de que nadie los viera —comprobado: los cinco salían sin candidato o
 * con «Malt beverage, non-alcoholic»—. Los factores propios de USDA arreglan
 * el problema de la CONVENCIÓN de energía, no el de un nutriente que la
 * fórmula no contempla.
 */
export function fichasUtilesUsda(alimentos) {
  const duros = ["kcal100g", "protein100g", "carbs100g", "fat100g"];
  const out = [];
  for (const a of alimentos.values()) {
    if (!duros.every((k) => a.nutricion[k] != null)) continue;
    if (mayContainAlcohol(a.nombre)) { out.push(a); continue; }
    const esperada = energiaEsperadaUsda(a.nutricion, a.factores);
    // Margen del 20 % o 5 kcal, el mismo que usa el sync de CIQUAL. El suelo
    // de 5 kcal es para los alimentos casi sin energía, donde un porcentaje no
    // significa nada: un caldo de 5 kcal no puede cuadrar al 20 %.
    if (esperada <= 0 && a.nutricion.kcal100g > 5) continue;
    if (Math.abs(a.nutricion.kcal100g - esperada) > Math.max(esperada * 0.2, 5)) continue;
    out.push(a);
  }
  return out;
}

/** La misma forma exacta que `nutrition` en ingredients.json. */
export function aNutricionUsda(alim) {
  const n = alim.nutricion;
  return Object.fromEntries(CAMPOS_NUTRICION.map((c) => [c, n[c] ?? null]));
}

