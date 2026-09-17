/**
 * Qué RACIONES entrega un plato, que no es lo mismo que qué plato es.
 *
 * ── El problema que resuelve ──────────────────────────────────────────────
 * Los objetivos semanales (`freqs`) se contaban por `category`, y `category` es
 * una decisión de ARCHIVO: dice dónde buscar la receta en el catálogo, no qué
 * te comes. Medido sobre el recetario estrella, eso dejaba invisible media
 * despensa:
 *
 *   · "Ternera a la jardinera" → 195 g de verdura por ración (zanahoria,
 *     guisantes, judía verde), archivada en `carnes`: contaba CERO verdura.
 *   · 184 platos entregaban 80 g o más de verdura y no contaban ninguna.
 *   · Y al revés: 47 platos archivados en `ensaladas_verduras` llevan menos.
 *
 * Con el tope de verdura en 3 y 127 de los 181 primeros contando como verdura
 * por su categoría, el motor tenía que ESQUIVAR la verdura en la mayoría de los
 * huecos — mientras el prompt le pedía "primero ligero: sopa, crema, ensalada,
 * verdura" todos los días. Dos instrucciones incompatibles.
 *
 * ── Cuenta lo que pinchas, no lo que unta ─────────────────────────────────
 * Una verdura cuenta cuando llega al plato como RACIÓN reconocible. No cuenta
 * cuando llega disuelta, porque entonces es sabor, no ración:
 *
 *   aromático  ajo, cebolla, puerro, perejil → el fondo. Nunca cuenta, aunque
 *              sean 120 g: nadie dice "hoy comí verdura" porque el guiso
 *              llevara sofrito.
 *   medio      tomate triturado, tomate frito, salsa de, concentrado, puré de
 *              → es la salsa del plato. No cuenta.
 *   ración     calabacín asado, judía verde del guiso, el pimiento de unos
 *              chiles rellenos → sí cuenta.
 *
 * Por eso "Arroz con tomate frito" no entrega verdura (0 g en trozo) y unos
 * chiles rellenos sí (dos pimientos enteros por ración), aunque su salsa de
 * tomate no sume nada.
 *
 * ── Unión, nunca resta ────────────────────────────────────────────────────
 * `aporteDe` SUMA a lo que ya decía el catálogo, no lo sustituye. Medido: para
 * las proteínas el umbral por gramos PIERDE platos (un filete de 150 g es carne
 * y se cae del corte de 175), así que la identidad declarada sigue mandando y
 * los gramos solo añaden. La verdura gana los 33 que hoy pierde y la carne no
 * pierde ninguno.
 *
 * ── Derivado, con override declarado ──────────────────────────────────────
 * Mismo patrón que `getCarbType`: si la receta trae `aporte` escrito a mano,
 * manda. Si no, se deriva de los ingredientes. Hace falta que funcione en
 * runtime igualmente, porque una receta creada por el usuario no trae el campo
 * y nadie se lo va a poner.
 */

import { compileKeywordRegex, normalizeText } from "./recipeText.js";

/** Las familias que se pueden entregar. Mismo vocabulario que `freqs`. */
export const FAMILIAS_APORTE = [
  "carne", "pescado", "legumbres", "huevos", "pasta_arroz", "patata", "verdura",
];

/**
 * Gramos por ración a partir de los cuales una familia cuenta como entregada.
 *
 * DERIVADOS del propio catálogo, no puestos a ojo: para cada familia es el
 * percentil 25 de lo que llevan los platos que YA son de esa familia — "al
 * menos tanto como el plato más flojo que todo el mundo acepta como tal".
 * Por eso son distintos entre sí: una ración de verdura son ~150 g y una de
 * pasta 80 g en seco, y un único número clasificaría mal cinco de siete.
 */
export const UMBRAL_RACION = {
  verdura: 100,
  patata: 80,
  pasta_arroz: 80,
  legumbres: 100,
  carne: 175,
  pescado: 138,
  huevos: 160,
};

// Aromáticos: el fondo de sabor. Nunca son ración, da igual el peso.
const AROMATICOS = [
  "ajo", "cebolla", "cebolleta", "puerro", "perejil", "cilantro", "albahaca",
  "laurel", "tomillo", "romero", "chalota", "hierbabuena", "eneldo", "menta",
];

// Marcadores de que el ingrediente llega DISUELTO: es salsa o fondo, no trozo.
const DISUELTO = [
  "triturado", "concentrado", "passata", "pure de", "puré de", "en conserva",
  "caldo", "salsa de", "sofrito", "frito",
];

const PALABRAS = {
  verdura: [
    "lechuga", "tomate", "pimiento", "calabacin", "berenjena", "zanahoria",
    "brocoli", "coliflor", "espinaca", "acelga", "calabaza", "apio", "champinon",
    "seta", "pepino", "rabano", "remolacha", "alcachofa", "esparrago", "guisante",
    "repollo", "endibia", "endivia", "escarola", "rucula", "canonigo", "brotes",
    "maiz", "nabo", "verdura", "calcot", "escalivada", "judia verde",
    "judias verdes", "berza", "grelo", "cardo", "hinojo", "aguacate", "lombarda",
  ],
  patata: ["patata", "boniato", "batata"],
  pasta_arroz: [
    "arroz", "pasta", "espagueti", "macarron", "fideo", "tallarin", "penne",
    "lasa", "canelon", "ravioli", "risotto", "quinoa", "cuscus", "couscous",
    "bulgur", "orecchiette", "linguine", "trofie", "fusilli", "tagliatelle",
    "pappardelle", "noodle", "ñoqui", "noqui",
  ],
  legumbres: [
    "lenteja", "garbanzo", "alubi", "judion", "fabe", "frijol", "haba", "soja",
    "tofu", "tempeh", "seitan",
  ],
  carne: [
    "pollo", "pavo", "ternera", "cerdo", "carne", "lomo", "chorizo", "salchich",
    "jamon", "bacon", "beicon", "panceta", "tocino", "cordero", "solomillo",
    "chuleta", "morcilla", "costilla", "entrecot", "hamburgues", "albondig",
    "conejo", "pato", "secreto", "presa", "pluma", "carrillera", "rabo",
    "codorniz", "higado", "fiambre", "mortadela", "fuet", "butifarra", "picada",
  ],
  pescado: [
    "merluza", "salmon", "bacalao", "atun", "gamba", "langostino", "cigala",
    "sardina", "anchoa", "calamar", "sepia", "mejillon", "pescado", "rape",
    "lubina", "rodaballo", "dorada", "boqueron", "besugo", "lenguado",
    "emperador", "caballa", "trucha", "almeja", "pulpo", "bonito", "navaja",
    "marisco", "bogavante", "chipiron", "vieira", "zamburi", "berberecho",
    "chirla", "langosta", "centollo", "necora", "percebe", "txangurro",
  ],
  huevos: ["huevo"],
};

// Todo se compara con LÍMITE DE PALABRA por delante y sin límite por detrás
// (`compileKeywordRegex`), y las dos mitades importan:
//
//   · con límite delante, "repollo" deja de ser pollo y "espárrago" deja de
//     ser arroz. Sin él, un `includes` metía media verdura en `carne`.
//   · sin límite detrás, los plurales y las flexiones siguen casando:
//     "zanahorias", "garbanzos", "pimientos".
//
// Es el mismo helper que usa `dominantComponent.js`, cuya cabecera cuenta que
// una versión temprana llevaba el límite por detrás y fallaba en todos los
// plurales.
const RE_AROMATICOS = compileKeywordRegex(AROMATICOS);
const RE_FAMILIA = Object.fromEntries(
  Object.entries(PALABRAS).map(([familia, palabras]) => [familia, compileKeywordRegex(palabras)]),
);

// Una unidad suelta pesa esto, para poder comparar "4 ud de pimiento" con
// "200 g de calabacín". La precisión no importa: lo que importa es que una
// pieza entera no cuente como si no pesara nada.
const GRAMOS_POR_UNIDAD = 80;

function gramos(ingrediente) {
  const { amount, unit } = ingrediente ?? {};
  if (typeof amount !== "number" || !Number.isFinite(amount)) return 0;
  if (unit === "g" || unit === "ml") return amount;
  if (unit === "ud") return amount * GRAMOS_POR_UNIDAD;
  return 0; // "al gusto", "una pizca": no pesan
}

/**
 * La familia que aporta un ingrediente como RACIÓN, o null si es aromático,
 * llega disuelto, o no pertenece a ninguna.
 *
 * El orden importa: se mira primero lo más específico ("judía verde" es
 * verdura; "judía" a secas es legumbre) y las proteínas antes que los hidratos,
 * para que "panceta" no caiga en `pasta_arroz` por contener "pan".
 */
export function familiaDeIngrediente(nombre) {
  const n = normalizeText(nombre);
  if (RE_AROMATICOS.test(n)) return null;
  if (DISUELTO.some((m) => n.includes(m))) return null;
  // Antes que nada: "judía verde" es verdura y "judía" a secas es legumbre, así
  // que la frase entera tiene que ganarle a la palabra suelta.
  if (/\bjudias? verdes?/.test(n)) return "verdura";
  for (const familia of ["legumbres", "pescado", "carne", "huevos", "pasta_arroz", "patata", "verdura"]) {
    if (RE_FAMILIA[familia].test(n)) return familia;
  }
  return null;
}

/** Gramos por ración de cada familia, ya descontados aromáticos y disueltos. */
export function gramosPorFamilia(receta) {
  const total = {};
  for (const ing of receta?.ingredients ?? []) {
    const familia = familiaDeIngrediente(ing?.name);
    if (familia) total[familia] = (total[familia] ?? 0) + gramos(ing);
  }
  const raciones = receta?.baseServings > 0 ? receta.baseServings : 4;
  for (const k of Object.keys(total)) total[k] = total[k] / raciones;
  return total;
}

/**
 * Las familias que este plato entrega, como Set.
 *
 * Un `aporte` declarado en la receta manda entero (igual que `mainBase` manda
 * sobre el regex en `getCarbType`); si no lo hay, se deriva de los gramos.
 */
export function aporteDe(receta) {
  if (Array.isArray(receta?.aporte) && receta.aporte.length > 0) {
    return new Set(receta.aporte.filter((f) => FAMILIAS_APORTE.includes(f)));
  }
  const porFamilia = gramosPorFamilia(receta);
  const salida = new Set();
  for (const [familia, g] of Object.entries(porFamilia)) {
    if (g >= UMBRAL_RACION[familia]) salida.add(familia);
  }
  return salida;
}
