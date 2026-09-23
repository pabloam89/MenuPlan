/**
 * LA TABLA DE RETENCIÓN POR TÉCNICA, desde USDA R6 y sin inventar un número.
 *
 * `axisRegistry.js` lo pedía desde que se escribió el eje 4: «Falta además la
 * TABLA DE RETENCIÓN POR TÉCNICA: un hervido pierde folato y el crudo no».
 *
 * Fuente: USDA Table of Nutrient Retention Factors, Release 6 (2007), dominio
 * público. CSV oficial en Ag Data Commons (el mismo que publica data.gov):
 * https://ndownloader.figshare.com/files/44488754
 * PDF con la metodología: https://www.ars.usda.gov/arsuserfiles/80400530/pdf/retn06.pdf
 *
 * Uso:  node scripts/build-retencion.mjs <ruta al CSV>
 *
 * ── Las dos decisiones que hacen el mapeo, y por qué ───────────────────────
 *
 * 1. EL AGUA SE COME. R6 distingue «BOILED, WATER USED» de «BOILED, DRAINED»,
 *    y la diferencia es grande: lo que se va en un hervido no se destruye, se
 *    disuelve. Un cocido, un guiso de legumbres o una crema se comen su caldo,
 *    así que para `olla` se toma la variante WATER USED en todo menos en pasta
 *    —que se escurre— y en nada más. Elegir DRAINED por defecto habría metido
 *    una pérdida que en esta cocina no ocurre.
 *
 * 2. EL JUGO TAMBIÉN. Igual con W/DRIPPINGS y WO/DRIPPINGS en carnes y
 *    pescados: el jugo de un asado se sirve y el de una plancha se queda en la
 *    sartén. `horno` y `olla` van con jugo, `plancha` sin él.
 *
 * ── Lo que esta tabla NO cubre ─────────────────────────────────────────────
 *
 * R6 publica 26 nutrientes y el repo maneja 32. No hay factor para selenio,
 * yodo, manganeso, ácido pantoténico, vitamina D, vitamina E ni vitamina K:
 * seis campos que se quedan sin corregir y que el operador declara en vez de
 * asumirles un 100 %.
 */

import { readFileSync, writeFileSync } from "node:fs";

const CSV = process.argv[2];
if (!CSV) {
  console.error("uso: node scripts/build-retencion.mjs <retn06.csv>");
  process.exit(1);
}

/** Nutriente de R6 → el nombre por ración del repo (ver data/nutrientes.js). */
const NUTRIENTES = {
  301: "calcium_mg", 303: "iron_mg", 304: "magnesium_mg", 305: "phosphorus_mg",
  306: "potassium_mg", 307: "sodium_mg", 309: "zinc_mg", 312: "copper_mg",
  401: "vitamin_c_mg", 404: "thiamin_mg", 405: "riboflavin_mg", 406: "niacin_mg",
  415: "vitamin_b6_mg", 417: "folate_ug", 418: "vitamin_b12_ug",
  321: "beta_carotene_ug", 392: "retinol_ug",
};

/**
 * (familia del repo × técnica de la receta) → descripción de R6.
 *
 * `crudo` no está: un alimento crudo no pierde nada y no necesita fila.
 * Las familias que no aparecen —especia, compuesto, pan, embutido, alga,
 * mineral— no reciben corrección: o llegan ya hechas, o entran en cantidades
 * donde la retención no mueve el resultado.
 */
const MAPA = {
  verdura_hoja: {
    olla: "VEG,GREENS,BOILED,WATER USED",
    horno: "VEG,GREENS,BAKED",
    sarten: "VEG,GREENS,STIR FRY",
    plancha: "VEG,GREENS,STIR FRY",
  },
  verdura_raiz: {
    olla: "VEG,ROOTS,ETC,BOILED,WATER USED",
    horno: "VEG,ROOTS,ETC,BAKED",
    sarten: "VEG,ROOTS,ETC,SAUTEED",
    plancha: "VEG,ROOTS,ETC,STIR FRY",
  },
  verdura_bulbo: {
    olla: "VEG,ROOTS,ETC,BOILED,WATER USED",
    horno: "VEG,ROOTS,ETC,BAKED",
    sarten: "VEG,ROOTS,ETC,SAUTEED",
    plancha: "VEG,ROOTS,ETC,STIR FRY",
  },
  verdura_fruto: {
    olla: "VEG,OTHER,BLD,WATER USED",
    horno: "VEG,OTHER,BAKED",
    sarten: "VEG,OTHER,STIR FRY",
    plancha: "VEG,OTHER,STIR FRY",
  },
  verdura_col: {
    olla: "VEG,OTHER,BLD,WATER USED",
    horno: "VEG,OTHER,BAKED",
    sarten: "VEG,OTHER,STIR FRY",
    plancha: "VEG,OTHER,STIR FRY",
  },
  seta: {
    olla: "VEG,OTHER,BLD,WATER USED",
    horno: "VEG,OTHER,BAKED",
    sarten: "VEG,OTHER,STIR FRY",
    plancha: "VEG,OTHER,STIR FRY",
  },
  // 45/75 min es el tramo de la lenteja y el garbanzo remojado, que es lo que
  // cuece esta cocina. Las otras dos bandas de R6 son el guisante partido
  // (15/20) y la alubia sin remojar (2/2,5 h).
  legumbre: {
    olla: "LEGUMES,CKD 45/75MIN,BLD,WATER USED",
    horno: "LEGUMES,CKD 45/75MIN,BOILED+BAKED",
    sarten: "LEGUMES,CKD 45/75MIN,BOILED+FRIED",
  },
  // La pasta es la excepción al agua que se come: se escurre.
  pasta: {
    olla: "PASTA,BOILED,DRAINED",
    horno: "PASTA,BOILED,DRAINED,BAKED",
  },
  arroz: {
    olla: "RICE,WHITE/BROWN,COOKED,WATER USED",
    horno: "RICE,WHITE/BROWN,COOKED,WATER USED",
    sarten: "RICE,WHITE/BROWN,SAUTEED+SIMMERED",
  },
  cereal: { olla: "CEREAL,REG/QUICK,COOKED" },
  carne_roja: {
    olla: "BEEF,ROAST,SIMMERED,W/DRIP",
    horno: "BEEF,ROASTED",
    sarten: "BEEF,FRIED,W/O COATING",
    plancha: "BEEF,BROILED CUT",
  },
  // La caza y la casquería no tienen grupo propio en R6. Se les aplica el de
  // la ternera, que es el músculo rojo más cercano, y se deja dicho.
  carne_caza: {
    olla: "BEEF,ROAST,SIMMERED,W/DRIP",
    horno: "BEEF,ROASTED",
    sarten: "BEEF,FRIED,W/O COATING",
    plancha: "BEEF,BROILED CUT",
  },
  casqueria: {
    olla: "BEEF,ROAST,SIMMERED,W/DRIP",
    horno: "BEEF,ROASTED",
    sarten: "BEEF,FRIED,W/O COATING",
    plancha: "BEEF,BROILED CUT",
  },
  carne_cerdo: {
    olla: "PORK,FRESH,ROAST,SIMMERED W/DRIPPNG",
    horno: "PORK,FRESH,ROASTED",
    sarten: "PORK,FRESH,FRIED,WO/COATING",
    plancha: "PORK,FRESH,BROILED",
  },
  carne_ave: {
    olla: "CHICKEN,SIMMERED,W/DRIPPINGS",
    horno: "CHICKEN,ROASTED",
    sarten: "CHICKEN,FRIED,WO/COATING",
    plancha: "CHICKEN,BROILED",
  },
  pescado_blanco: {
    olla: "FINFISH,<5%FAT,SIMMERED,W/DRIPPINGS",
    horno: "FINFISH,<5%FAT,BAKED W/DRIPPINGS",
    sarten: "FINFISH,<5%FAT,FRIED,WO/COATING",
    plancha: "FINFISH,<5%FAT,BROILED,WO/DRIPPINGS",
  },
  pescado_azul: {
    olla: "FINFISH,>5%FAT,SIMMERED,WO/DRIP",
    horno: "FINFISH,>5%FAT,BAKED,W/DRIPPINGS",
    sarten: "FINFISH,>5%FAT,FRIED,WO/COATING",
    plancha: "FINFISH,>5%FAT,BROILED,WO/DRIPPNG",
  },
  marisco: {
    olla: "SHELLFISH,W/SHELL,BOILED",
    horno: "SHELLFISH,WO/SHELL,BAKED,W/DRIPPNGS",
    sarten: "SHELLFISH,WO/SHELL,FRIED,WO/COATING",
    plancha: "SHELLFISH,WO/SHELL,BROILED",
  },
  cefalopodo: {
    olla: "SHELLFISH,W/SHELL,BOILED",
    horno: "SHELLFISH,WO/SHELL,BAKED,W/DRIPPNGS",
    sarten: "SHELLFISH,WO/SHELL,FRIED,WO/COATING",
    plancha: "SHELLFISH,WO/SHELL,BROILED",
  },
  huevo: {
    olla: "EGGS,HARD COOKED",
    horno: "EGGS,BAKED",
    sarten: "EGGS,FRIED,SCRAMBLED",
    plancha: "EGGS,FRIED,SCRAMBLED",
  },
  leche: { olla: "MILK,HEATED APPROX 10MIN", horno: "MILK,HEATED APPROX 30MIN" },
  queso: { olla: "CHEESE,COOKED W/LIQUID", horno: "CHEESE,BAKED", plancha: "CHEESE,BROILED" },
  fruta: {
    olla: "FRUITS,FRESH(NOT CITRUS),STEWED",
    horno: "FRUITS,FRESH(NOT CITRUS),BAKED",
    sarten: "FRUITS,FRESH(NOT CITRUS),SAUTEED",
  },
  fruto_seco: { horno: "NUTS,ROASTED", sarten: "NUTS,BROILED", olla: "NUTS,BOILED,W/DRIPPINGS" },
};

// ── Leer el CSV ─────────────────────────────────────────────────────────────
const parseLinea = (l) => {
  const campos = [];
  let actual = "";
  let entreComillas = false;
  for (const ch of l) {
    if (ch === '"') { entreComillas = !entreComillas; continue; }
    if (ch === "," && !entreComillas) { campos.push(actual); actual = ""; continue; }
    actual += ch;
  }
  campos.push(actual);
  return campos;
};

const filas = readFileSync(CSV, "utf8").split(/\r?\n/).slice(1).filter(Boolean).map(parseLinea);

// RetnDesc → { campo: factor }
const porDescripcion = new Map();
for (const [, , desc, nutrNo, , factor] of filas) {
  const campo = NUTRIENTES[Number(nutrNo)];
  if (!campo) continue;
  if (!porDescripcion.has(desc)) porDescripcion.set(desc, {});
  // R6 publica una fila por (código, nutriente). Cuando un mismo RetnDesc
  // aparece bajo varios códigos de grupo, los factores coinciden; si alguna
  // vez no coincidieran, se queda el menor, que es el que no promete de más.
  const previo = porDescripcion.get(desc)[campo];
  const valor = Number(factor);
  porDescripcion.get(desc)[campo] = previo == null ? valor : Math.min(previo, valor);
}

// ── Construir la tabla del repo, verificando cada descripción ───────────────
const salida = {};
const noEncontradas = [];
for (const [familia, porTecnica] of Object.entries(MAPA)) {
  salida[familia] = {};
  for (const [tecnica, desc] of Object.entries(porTecnica)) {
    const factores = porDescripcion.get(desc);
    if (!factores) { noEncontradas.push(`${familia}.${tecnica} → «${desc}»`); continue; }
    // De porcentaje a factor, y sin guardar los 100 % que no hacen nada.
    const utiles = {};
    for (const [campo, pct] of Object.entries(factores)) {
      if (pct === 100) continue;
      utiles[campo] = Math.round((pct / 100) * 1000) / 1000;
    }
    salida[familia][tecnica] = { usda: desc, factores: utiles };
  }
}

if (noEncontradas.length) {
  console.error("DESCRIPCIONES QUE NO EXISTEN EN EL CSV:");
  for (const n of noEncontradas) console.error(`  ${n}`);
  process.exit(1);
}

const destino = "src/data/retencion.json";
writeFileSync(destino, `${JSON.stringify({
  _meta: {
    fuente: "USDA Table of Nutrient Retention Factors, Release 6 (2007)",
    url: "https://www.ars.usda.gov/arsuserfiles/80400530/pdf/retn06.pdf",
    csv: "https://ndownloader.figshare.com/files/44488754",
    licencia: "dominio público (obra del Gobierno de EE. UU.)",
    generado: new Date().toISOString().slice(0, 10),
    nutrientesSinFactor: [
      "selenium_ug", "iodine_ug", "manganese_mg", "pantothenic_acid_mg",
      "vitamin_d_ug", "vitamin_e_mg", "vitamin_k_ug",
    ],
  },
  ...salida,
}, null, 2)}\n`, "utf8");

const pares = Object.values(salida).reduce((a, v) => a + Object.keys(v).length, 0);
console.log(`${destino}: ${Object.keys(salida).length} familias, ${pares} pares familia×técnica`);
for (const [fam, porTec] of Object.entries(salida)) {
  for (const [tec, v] of Object.entries(porTec)) {
    const n = Object.keys(v.factores).length;
    console.log(`  ${fam.padEnd(16)} ${tec.padEnd(8)} ${String(n).padStart(2)} factores < 100 %  · ${v.usda}`);
  }
}
