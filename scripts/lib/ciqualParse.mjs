/**
 * Lee la tabla CIQUAL (ANSES, Francia) y la deja con la MISMA forma que la
 * nutrición de BEDCA, para que el resto del pipeline no tenga que saber de
 * dónde viene un número.
 *
 * POR QUÉ UNA SEGUNDA FUENTE. BEDCA tiene ~500 alimentos y está agotada: el
 * aplicador ya no coloca ni uno más, la repesca devolvió cero y de los 55
 * huecos revisados a mano la mayoría se rechazaron porque LA FICHA NO EXISTE,
 * no porque fuera dudosa. Medido: 1.061 de 7.586 líneas del catálogo (14 %) se
 * pesan bien y su ingrediente no tiene nutrición. Y eso no es imprecisión sino
 * sesgo: lo que falta suma cero, así que una receta al 79 % de cobertura
 * enseña un 21 % menos de calorías de las que tiene.
 *
 * POR QUÉ CIQUAL Y NO OTRA. Es una tabla de composición nacional, como BEDCA,
 * así que mezclarlas cuesta poco: mismo tipo de dato, mismos métodos de
 * laboratorio, mismo orden de magnitud de incertidumbre. Tiene ~3.200
 * alimentos con los estados crudo/cocido y los cortes que a BEDCA le faltan,
 * que es justo nuestro hueco. Y se descarga sin clave.
 *
 * LO QUE NO ARREGLA: los productos de marca (Sriracha, Gochujang, Mascarpone).
 * Para esos hace falta etiqueta, no tabla de composición.
 *
 * FORMATO. XML en windows-1252, cuatro ficheros relacionados por código. Se
 * parsea con expresiones regulares y no con un parser XML a propósito: la
 * estructura es plana y regular, `compo` pesa 57 MB, y añadir una dependencia
 * para leer cuatro etiquetas no compensa. Si CIQUAL cambiara de forma, el
 * parseo falla ruidosamente (0 alimentos) en vez de devolver basura.
 */
import { readFileSync } from "fs";
import { join } from "path";

/** Constituyente de CIQUAL → nuestro campo. Los códigos salen de const_*.xml. */
export const CONST_CODES = {
  327: "kj100g",            // Energy (kJ/100g) — respaldo cuando falta el kcal
  328: "kcal100g",          // Energy, Regulation EU No 1169/2011 (kcal/100g)
  25000: "protein100g",     // Protein (g/100g)
  31000: "carbs100g",       // Carbohydrate (g/100g)
  40000: "fat100g",         // Fat (g/100g)
  34100: "fiber100g",       // Fibres (g/100g)
  32000: "sugar100g",       // Sugars (g/100g)
  40302: "saturatedFat100g", // FA saturated (g/100g)
  10110: "sodium100g",      // Sodium (mg/100g) — misma unidad que BEDCA
};

/**
 * CIQUAL marca la incertidumbre en el propio valor: "traces", "< 0,5", "-".
 * Se traducen en vez de tirarlos, porque "trazas" es información y no un
 * hueco — pero un "< 0,5" NO se convierte en 0,5: se toma el punto medio del
 * intervalo, que es lo único defendible cuando la fuente dice "menos de".
 */
export function parseTeneur(texto) {
  if (texto == null) return null;
  const t = String(texto).trim().replace(",", ".");
  if (t === "" || t === "-") return null;
  if (/^traces$/i.test(t)) return 0;
  const menorQue = t.match(/^<\s*([\d.]+)$/);
  if (menorQue) return Number(menorQue[1]) / 2;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const texto = (bloque, etiqueta) => {
  const m = bloque.match(new RegExp(`<${etiqueta}>\\s*([\\s\\S]*?)\\s*</${etiqueta}>`));
  return m ? m[1].trim() : null;
};

/**
 * @param {string} dir carpeta con los XML descomprimidos de CIQUAL
 * @returns {Map<string, {code:string, nombre:string, grupo:string, nutricion:object, confianza:object}>}
 */
export function cargarCiqual(dir) {
  const leer = (f) => readFileSync(join(dir, f), "latin1");

  // 1. Los alimentos. Nombre en inglés, que es con el que se empareja.
  const alimentos = new Map();
  for (const bloque of leer("alim_2020_07_07.xml").split("<ALIM>").slice(1)) {
    const code = texto(bloque, "alim_code");
    if (!code) continue;
    alimentos.set(code, {
      code,
      nombre: texto(bloque, "alim_nom_eng") ?? texto(bloque, "alim_nom_fr") ?? "",
      nombreFr: texto(bloque, "alim_nom_fr") ?? "",
      grupo: texto(bloque, "alim_grp_code") ?? "",
      nutricion: {},
      confianza: {},
    });
  }
  if (alimentos.size === 0) {
    throw new Error("CIQUAL: 0 alimentos leídos — el formato ha cambiado, revisa alim_*.xml");
  }

  // 2. La composición. Es el fichero grande (57 MB); se recorre una vez y solo
  //    se guardan los ocho constituyentes que usamos.
  for (const bloque of leer("compo_2020_07_07.xml").split("<COMPO>").slice(1)) {
    const constCode = texto(bloque, "const_code");
    const campo = CONST_CODES[constCode];
    if (!campo) continue;
    const alim = alimentos.get(texto(bloque, "alim_code"));
    if (!alim) continue;
    const valor = parseTeneur(texto(bloque, "teneur"));
    if (valor == null) continue;
    alim.nutricion[campo] = valor;
    // A, B, C, D de mayor a menor confianza. Se guarda porque una ficha con
    // varios constituyentes en D merece mirarse antes de aceptarla.
    const conf = texto(bloque, "code_confiance");
    if (conf) alim.confianza[campo] = conf;
  }

  return alimentos;
}

/**
 * La energía que cabe esperar de los macros, SEGÚN EL REGLAMENTO UE 1169/2011
 * — que es el que CIQUAL dice usar, y lo dice en el nombre del constituyente:
 * «Energy, Regulation EU No 1169/2011 (kcal/100g)».
 *
 * La diferencia con el 4/4/9 de toda la vida es la FIBRA, que ese reglamento
 * cuenta a 2 kcal/g. En un alimento normal da igual; en uno de poca energía es
 * casi todo, y ahí el 4/4/9 se queda corto y descarta fichas buenas:
 *
 *   Basil, fresh       declara 34,8   4/4/9 da 27,8   con fibra da 34,8
 *   Coriander, fresh   declara 22,3   4/4/9 da 16,7   con fibra da 22,3
 *
 * Las dos son correctas y las dos se estaban tirando. La fórmula completa no
 * afloja el filtro: lo afina.
 */
export function energiaEsperada(n) {
  return 4 * n.protein100g + 4 * n.carbs100g + 9 * n.fat100g + 2 * (n.fiber100g ?? 0);
}

/**
 * Solo las fichas que sirven: las que traen los CUATRO macros duros. Sin ellos
 * no se puede ni calcular ni comprobar nada, y una ficha a medias es la que
 * mete un cero donde debería haber un hueco.
 *
 * Cuando falta el kcal pero está el kJ, se convierte. No es estimar: son la
 * misma magnitud en otra unidad, y CIQUAL publica muchas fichas con uno y sin
 * el otro (los espárragos crudos, la levadura de panadería).
 *
 * Y cuando faltan LOS DOS pero los macros están completos, se calcula con la
 * fórmula del propio reglamento que CIQUAL dice usar. Pasa en los frutos
 * secos: «Walnut, dried, husked» publica proteína, carbohidratos, grasa y
 * fibra, y deja los cuatro códigos de energía a «-».
 *
 * ESTO NO ES LO MISMO QUE LO QUE SE RECHAZÓ CON EL GARBANZO DE BEDCA, y la
 * diferencia es el motivo de que aquí sí y allí no:
 *
 *   garbanzo   la fuente PUBLICA un kcal y es demostrablemente falso (le
 *              pegaron el del garbanzo seco). Un error probado en un campo
 *              es motivo para desconfiar de toda la fila, así que no se
 *              recalcula: se descarta entera.
 *   fruto seco la fuente OMITE el kcal y no hay nada que contradiga a sus
 *              macros. Rellenar una omisión con la aritmética que la propia
 *              fuente declara no es corregirla, es terminarla.
 *
 * Aun así queda marcado con `kcalCalculado`, porque un número calculado y uno
 * medido no valen lo mismo y quien lo lea tiene derecho a saberlo.
 */
export function fichasUtiles(alimentos) {
  const duros = ["protein100g", "carbs100g", "fat100g"];
  const out = [];
  for (const a of alimentos.values()) {
    if (!duros.every((k) => a.nutricion[k] != null)) continue;
    if (a.nutricion.kcal100g == null && a.nutricion.kj100g != null) {
      a.nutricion.kcal100g = Math.round((a.nutricion.kj100g / 4.184) * 10) / 10;
      a.confianza.kcal100g = a.confianza.kj100g;
      a.kcalDesdeKj = true;
    } else if (a.nutricion.kcal100g == null) {
      // Sin fibra no se calcula: la fórmula la necesita y suponerla cero
      // subestimaría la energía justo en los alimentos donde más pesa.
      if (a.nutricion.fiber100g == null) continue;
      a.nutricion.kcal100g = Math.round(energiaEsperada(a.nutricion) * 10) / 10;
      a.kcalCalculado = true;
    }
    out.push(a);
  }
  return out;
}

/** La misma forma exacta que `nutrition` en ingredients.json. */
export function aNutricion(alim) {
  const n = alim.nutricion;
  return {
    kcal100g: n.kcal100g,
    protein100g: n.protein100g,
    carbs100g: n.carbs100g,
    fat100g: n.fat100g,
    fiber100g: n.fiber100g ?? null,
    sugar100g: n.sugar100g ?? null,
    saturatedFat100g: n.saturatedFat100g ?? null,
    sodium100g: n.sodium100g ?? null,
  };
}
