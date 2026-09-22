/**
 * Lee las dimensiones de variedad del nombre con que BEDCA publica una ficha.
 *
 *   "Atún, en aceite, enlatado, escurrido"
 *    └ núcleo ┘ └ medio ┘  └ estado ┘ └ presentación ┘
 *
 * POR QUÉ ES TABLA Y NO REGEX. Medido antes de escribirlo: en los 346 nombres
 * de BEDCA que el catálogo ya ha tocado hay 181 con fragmento y solo **109
 * fragmentos distintos**. Un vocabulario de 109 entradas es finito, así que se
 * escribe entero y se acabó el adivinar. Esta auditoría ya ha desmontado tres
 * regex sobre texto libre que parecían razonables (`/aceite/` casaba "Anchoas
 * en aceite", SE_COME_CRUDO casaba "Chuletón a la parrilla"); no se añade una
 * cuarta.
 *
 * Y LO QUE NO ESTÁ EN LA TABLA NO SE INVENTA: sale en `desconocidos` para que
 * alguien lo clasifique, y la dimensión se queda a null (deuda visible). Mismo
 * contrato que el pipeline de `part`: sin señal, no se escribe.
 *
 * NO TODO FRAGMENTO ES UNA DIMENSIÓN. Hay tres clases, y confundirlas es lo que
 * hace que una tabla de variedades se llene de filas que no son variedades:
 *
 *   dimension  cambia el eje declarado        "en aceite" → medio
 *   nucleo     cambia QUÉ alimento es         "de cabra" en "Leche, de cabra"
 *   atributo   matiz del producto concreto    "18% de grasa", "baja en calorías"
 *
 * Solo la primera se escribe en `dimensiones`. El núcleo se devuelve aparte
 * porque quien construya el id del alimento lo necesita (leche y leche de cabra
 * no son la misma fila), y el atributo se devuelve para no perderlo.
 */

const DIMENSION = (dim, valor) => ({ tipo: "dimension", dim, valor });
const NUCLEO = { tipo: "nucleo" };
const ATRIBUTO = { tipo: "atributo" };

/**
 * Fragmento literal (en minúsculas, sin tocar los acentos) → qué significa.
 * Un fragmento puede tocar DOS dimensiones a la vez ("crudo y congelado"), y
 * por eso el valor puede ser un array.
 */
export const FRAGMENTOS = {
  // ── procesado ────────────────────────────────────────────────────────────
  "crudo": DIMENSION("procesado", "crudo"),
  "cruda": DIMENSION("procesado", "crudo"),
  "crudos": DIMENSION("procesado", "crudo"),
  "crudas": DIMENSION("procesado", "crudo"),
  "hervido": DIMENSION("procesado", "hervido"),
  "hervida": DIMENSION("procesado", "hervido"),
  "hervidos": DIMENSION("procesado", "hervido"),
  "hervidas": DIMENSION("procesado", "hervido"),
  "cocido": DIMENSION("procesado", "cocido"),
  "cocida": DIMENSION("procesado", "cocido"),
  "cocidos": DIMENSION("procesado", "cocido"),
  "cocidas": DIMENSION("procesado", "cocido"),
  "cocida en agua": DIMENSION("procesado", "cocido"),
  "cocido en agua": DIMENSION("procesado", "cocido"),
  "frito": DIMENSION("procesado", "frito"),
  "frita": DIMENSION("procesado", "frito"),
  "fritos": DIMENSION("procesado", "frito"),
  "fritas": DIMENSION("procesado", "frito"),
  "asado": DIMENSION("procesado", "asado"),
  "asada": DIMENSION("procesado", "asado"),
  "plancha": DIMENSION("procesado", "plancha"),
  "a la plancha": DIMENSION("procesado", "plancha"),
  "a la parrilla": DIMENSION("procesado", "parrilla"),
  "estofado": DIMENSION("procesado", "estofado"),
  "estofada": DIMENSION("procesado", "estofado"),
  "ahumado": DIMENSION("procesado", "ahumado"),
  "ahumada": DIMENSION("procesado", "ahumado"),
  "tostado": DIMENSION("procesado", "tostado"),
  "tostada": DIMENSION("procesado", "tostado"),
  "infusión": DIMENSION("procesado", "infusion"),

  // ── estado ───────────────────────────────────────────────────────────────
  "fresco": DIMENSION("estado", "fresco"),
  "fresca": DIMENSION("estado", "fresco"),
  "congelado": DIMENSION("estado", "congelado"),
  "congelada": DIMENSION("estado", "congelado"),
  "crudo y congelado": [DIMENSION("procesado", "crudo"), DIMENSION("estado", "congelado")],
  "seco": DIMENSION("estado", "seco"),
  "seca": DIMENSION("estado", "seco"),
  "remojada": DIMENSION("estado", "remojado"),
  "remojado": DIMENSION("estado", "remojado"),
  "desecado": DIMENSION("estado", "desecado"),
  "desecada": DIMENSION("estado", "desecado"),
  "en conserva": DIMENSION("estado", "conserva"),
  "conserva": DIMENSION("estado", "conserva"),
  "enlatado": DIMENSION("estado", "conserva"),
  "enlatada": DIMENSION("estado", "conserva"),
  "envasado": DIMENSION("estado", "conserva"),
  "envasada": DIMENSION("estado", "conserva"),
  "precocinado": DIMENSION("estado", "precocinado"),
  "precocinada": DIMENSION("estado", "precocinado"),
  "fiambre": DIMENSION("estado", "fiambre"),

  // ── medio ────────────────────────────────────────────────────────────────
  "aceite de oliva": DIMENSION("medio", "aceite_oliva"),
  "en aceite de oliva": DIMENSION("medio", "aceite_oliva"),
  "en aceite de girasol": DIMENSION("medio", "aceite_girasol"),
  "aceite de girasol": DIMENSION("medio", "aceite_girasol"),
  "aceite de soja": DIMENSION("medio", "aceite_soja"),
  "en aceite": DIMENSION("medio", "aceite_vegetal"),
  "en escabeche": DIMENSION("medio", "escabeche"),
  "enlatada en almíbar": [DIMENSION("estado", "conserva"), DIMENSION("medio", "almibar")],
  "en almíbar": DIMENSION("medio", "almibar"),
  "al natural": DIMENSION("medio", "natural"),
  "natural": DIMENSION("medio", "natural"),
  "con leche": DIMENSION("medio", "leche"),
  "de mantequilla": DIMENSION("medio", "mantequilla"),

  // ── corte ────────────────────────────────────────────────────────────────
  "solomillo": DIMENSION("corte", "solomillo"),
  "lomo": DIMENSION("corte", "lomo"),
  "pechuga": DIMENSION("corte", "pechuga"),
  "muslo": DIMENSION("corte", "muslo"),
  "pierna": DIMENSION("corte", "pierna"),
  "costilla": DIMENSION("corte", "costilla"),
  "chuleta": DIMENSION("corte", "chuleta"),
  "jarrete": DIMENSION("corte", "jarrete"),
  "panceta": DIMENSION("corte", "panceta"),
  "carne": DIMENSION("corte", "carne"),
  "hígado": DIMENSION("corte", "higado"),
  "hoja": DIMENSION("corte", "hoja"),
  "raíz": DIMENSION("corte", "raiz"),
  "semilla": DIMENSION("corte", "semilla"),
  "grano": DIMENSION("corte", "grano"),

  // ── presentación ─────────────────────────────────────────────────────────
  // OJO: "entero" es la única palabra ambigua de las 109. En "Huevo, entero"
  // es una pieza; en "Yogur, líquido, entero" es la grasa. Se resuelve por el
  // núcleo (ver LACTEO_RE), no por orden ni por suerte.
  "entero": DIMENSION("presentacion", "entero"),
  "entera": DIMENSION("presentacion", "entero"),
  "fileteado": DIMENSION("presentacion", "fileteado"),
  "en rodajas": DIMENSION("presentacion", "rodajas"),
  "picada": DIMENSION("presentacion", "picado"),
  "picado": DIMENSION("presentacion", "picado"),
  "triturado": DIMENSION("presentacion", "triturado"),
  "triturada": DIMENSION("presentacion", "triturado"),
  "puré": DIMENSION("presentacion", "pure"),
  "en polvo": DIMENSION("presentacion", "polvo"),
  "en copos": DIMENSION("presentacion", "copos"),
  "líquido": DIMENSION("presentacion", "liquido"),
  "líquida": DIMENSION("presentacion", "liquido"),
  "de molde": DIMENSION("presentacion", "molde"),
  "rellena con carne": DIMENSION("presentacion", "relleno"),
  "pelado": DIMENSION("presentacion", "pelado"),
  "peladas": DIMENSION("presentacion", "pelado"),
  "con piel": DIMENSION("presentacion", "con_piel"),
  "sin piel": DIMENSION("presentacion", "sin_piel"),
  "con hueso": DIMENSION("presentacion", "con_hueso"),
  "sin hueso": DIMENSION("presentacion", "con_hueso"),
  "con cáscara": DIMENSION("presentacion", "con_cascara"),
  "con grasa separable": DIMENSION("presentacion", "con_grasa"),
  "sin grasa": DIMENSION("presentacion", "sin_grasa"),

  // ── núcleo: cambia de qué alimento hablamos ──────────────────────────────
  // "Leche" y "Leche, de cabra" no son la misma fila, así que esto NO es una
  // dimensión: es parte de la identidad, y quien construya el id lo necesita.
  "cabra": NUCLEO,
  "oveja": NUCLEO,
  "de cerdo": NUCLEO,
  "de vaca": NUCLEO,
  "avena": NUCLEO,
  "maíz": NUCLEO,
  "maiz y miel": NUCLEO,
  "miel y nueces": NUCLEO,
  "con fresas": NUCLEO,
  "con cereales": NUCLEO,
  "con huevo": NUCLEO,
  "emperador": NUCLEO,
  "integral": NUCLEO,
  "blanca": NUCLEO,
  "blanco": NUCLEO,
  "negra": NUCLEO,
  "negro": NUCLEO,
  "rojo": NUCLEO,
  "roja": NUCLEO,
  "verde": NUCLEO,
  "moreno": NUCLEO,
  'tipo "frankfurt"': NUCLEO,
  "tipo viena": NUCLEO,
  "tipo país": NUCLEO,
  "tipo oporto": NUCLEO,
  "tipo hamburguesa": NUCLEO,

  // ── atributo: matiz del producto, no eje del modelo ──────────────────────
  // Se reconocen para NO contarlos como desconocidos, y se tiran: el modelo no
  // tiene dónde ponerlos y fingir que sí sería inventarse un eje.
  "genérico": ATRIBUTO,
  "genérica": ATRIBUTO,
  "baja en calorías": ATRIBUTO,
  "18% de grasa": ATRIBUTO,
  "30% de grasa": ATRIBUTO,
  "sabor fresa y plátano": ATRIBUTO,
  "azucarado": ATRIBUTO,
  "con azúcar": ATRIBUTO,
  "sin azúcar": ATRIBUTO,
  "con sal": ATRIBUTO,
  "sin sal": ATRIBUTO,
  "salado": ATRIBUTO,
  "salada": ATRIBUTO,
  "desnatado": ATRIBUTO,
  "desnatada": ATRIBUTO,
  "semidesnatada": ATRIBUTO,
  "enriquecido": ATRIBUTO,
  "enriquecida": ATRIBUTO,
  "picante": ATRIBUTO,
  "maduro": ATRIBUTO,
  "para cocinar": ATRIBUTO,
};

/**
 * Alimentos donde "entero" habla de la GRASA y no de la pieza. Medido: los
 * cinco conflictos que salieron al pasar el parser por los 346 nombres reales
 * incluían "Yogur, líquido, entero", que no es un yogur sin trocear.
 */
const LACTEO_RE = /^(leche|yogur|nata|queso|cuajada|k[eé]fir|cuajo)/i;

/**
 * @param {string} foodName nombre tal cual lo publica BEDCA
 * @returns {{
 *   nucleo: string,
 *   dimensiones: Record<string, string>,
 *   nucleoExtra: string[],
 *   atributos: string[],
 *   desconocidos: string[],
 *   cadenas: string[],
 * }}
 */
export function parseDimensiones(foodName) {
  const partes = String(foodName).split(",").map((s) => s.trim()).filter(Boolean);
  const nucleo = partes[0] ?? "";

  const esLacteo = LACTEO_RE.test(nucleo);

  const dimensiones = {};
  const nucleoExtra = [];
  const atributos = [];
  const desconocidos = [];
  const cadenas = [];

  for (const parte of partes.slice(1)) {
    const clave = parte.toLowerCase();
    const encontrado = FRAGMENTOS[clave];
    if (encontrado === undefined) {
      desconocidos.push(parte);
      continue;
    }
    for (const item of Array.isArray(encontrado) ? encontrado : [encontrado]) {
      // Dos palabras cambian de significado en un lácteo, y las dos salieron
      // de pasar el parser por nombres reales:
      //   "Yogur, entero"  → la grasa, no la pieza
      //   "Yogur, natural" → sin azucarar ni aromatizar, no "conservado al
      //                      natural" como el atún en su jugo
      if (item.tipo === "dimension" && esLacteo
          && (item.valor === "entero" || item.valor === "natural")) {
        atributos.push(parte);
        continue;
      }
      if (item.tipo === "nucleo") { nucleoExtra.push(parte); continue; }
      if (item.tipo === "atributo") { atributos.push(parte); continue; }

      // Dos fragmentos en la misma dimensión NO son una contradicción: BEDCA
      // nombra la preparación en orden ("Alubia, seca, remojada, hervida"), así
      // que gana el ÚLTIMO — es el estado en el que analizó la ficha, y una
      // alubia remojada ya no está seca. Los anteriores se devuelven en
      // `cadenas` para que nada se pierda en silencio.
      const previo = dimensiones[item.dim];
      if (previo !== undefined && previo !== item.valor) {
        cadenas.push(`${item.dim}: ${previo} → ${item.valor}`);
      }
      dimensiones[item.dim] = item.valor;
    }
  }

  return { nucleo, dimensiones, nucleoExtra, atributos, desconocidos, cadenas };
}
