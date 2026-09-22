/**
 * Derivar `stepsRich[i].part` sin preguntarle a un modelo.
 *
 * `part` dice qué componente del plato trabaja cada paso (principal /
 * guarnicion / salsa / combinado). Lo curado hoy son 176 recetas, etiquetadas
 * por un modelo con el criterio aparte/dentro (scripts/enrich-recipe-steps.mjs
 * --parts). Las demás no lo tienen, y eso bloquea todo lo que necesita saber
 * qué parte de un plato es qué: el vector de masa por componente, las macros
 * por parte, y decidir si el aceite de una receta se sirve o se queda en la
 * sartén.
 *
 * Este operador es la alternativa BARATA y determinista: resuelve por el FK
 * del ingrediente y su pasillo, no por parecido de texto. No sustituye a lo
 * curado — cuando una receta ya trae `part`, se respeta y no se toca. Sirve
 * para las que no lo tienen y, sobre todo, para MEDIRSE: se corre sobre las
 * curadas y la concordancia dice si el derivado vale para algo. Si no
 * concuerda, no se promociona a fuente y punto.
 *
 * ── Cómo decide ───────────────────────────────────────────────────────────
 * El paso hereda la parte de los ingredientes que nombra con {{marcadores}}.
 * Cada ingrediente vota según su pasillo y el eje de proteína de la receta:
 *
 *   · el ingrediente que ES la proteína principal del plato → principal
 *   · fécula y verdura de guarnición                        → guarnicion
 *   · lácteo graso, emulsión, vinagre, caldo reducido        → salsa
 *
 * y los pasos sin marcador heredan del paso anterior, porque una receta se
 * escribe en bloques: "pochar la cebolla / añadir el tomate / dejar reducir"
 * son tres pasos de la misma parte y solo el primero nombra ingredientes.
 *
 * ── Lo que NO hace ────────────────────────────────────────────────────────
 * No inventa partes en recetas monocomponente. Si todos los pasos votarían lo
 * mismo, devuelve null: una tortilla no tiene "principal y guarnición", tiene
 * una sola cosa, y marcar partes ahí es ruido que además rompe la UI (pinta
 * cabeceras de sección para un solo bloque).
 */

import { STEP_PARTS, markerIngredientNames, findIngredientForMarker } from "../recipeSteps.js";
import { resolveIngredient } from "../ingredients.js";

/**
 * Lo que NO vota, porque está en todas partes: el sofrito y los condimentos
 * aparecen igual en el principal, en la guarnición y en la salsa, así que su
 * voto solo hace ruido. Medido: sin este filtro, la cebolla y el ajo de un
 * sofrito arrastraban a `guarnicion` 548 pasos que son del principal.
 */
const NO_VOTA = /^(cebolla|ajo|tomate|pimiento|aceite|sal|pimienta|perejil|laurel|vino|caldo|agua|azucar|harina|cebolleta|puerro|zanahoria)/;

/** Pasillos que casi siempre son el eje del plato cuando hay proteína animal. */
const PASILLO_PRINCIPAL = new Set(["Carne", "Pescado", "Huevos"]);
/** Pasillos que casi siempre acompañan. */
const PASILLO_GUARNICION = new Set(["Verduras", "Legumbres", "Pasta y arroz", "Panadería"]);

/**
 * Ingredientes que hacen salsa, por id. Van por FK y no por nombre a
 * propósito: "Nata para montar" y "Nata líquida" son el mismo id y el mismo
 * papel, y un regex sobre "nata" se llevaría también la "Nata de coco" de un
 * curry, que ahí es el plato.
 */
const ID_SALSA = new Set([
  "mayonesa", "nata-para-montar", "nata-cocinar", "mantequilla", "queso-crema",
  "vinagre", "vinagre-balsamico", "mostaza", "salsa-soja", "salsa-worcestershire",
  "tomate-frito", "pesto", "salsa-cesar", "sriracha", "harissa", "gochujang",
  "bechamel", "yogur-griego", "tahini", "miel",
]);

/** El ingrediente que encarna la proteína declarada del plato. */
const IDS_POR_PROTEINA = {
  pollo: /pollo|pechuga|contramuslo|muslo|alitas/,
  pavo: /pavo/,
  pato: /pato|magret/,
  cordero: /cordero|paletilla|chuletilla/,
  caza: /jabali|conejo|codorniz|perdiz|venado|corzo/,
  cerdo: /cerdo|lomo|panceta|bacon|chorizo|secreto|presa|costilla|jamon|salchich|guanciale/,
  ternera: /ternera|vacuno|solomillo|entrecot|chuleton|morcillo|carrill|rabo|entrania|jarrete/,
  pescado_blanco: /merluza|bacalao|lenguado|rape|dorada|lubina|rodaballo|corvina|gallo|sepia|calamar/,
  pescado_azul: /salmon|atun|caballa|sardina|boqueron|bonito|emperador|trucha|salmonete|ventresca/,
  marisco: /gamba|langostino|cigala|almeja|mejillon|berberecho|navaja|vieira|zamburina|txangurro|pulpo|surimi/,
  legumbre: /lenteja|garbanzo|alubia|judia|frijol|fabe|soja|tofu/,
  huevo: /huevo/,
};

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** El voto de un ingrediente, o null si no opina. */
function votoDe(ingrediente, receta) {
  if (!ingrediente) return null;
  if (ID_SALSA.has(ingrediente.id)) return "salsa";
  if (NO_VOTA.test(norm(ingrediente.name))) return null;

  const re = IDS_POR_PROTEINA[receta.mainProtein];
  if (re && re.test(norm(ingrediente.name))) return "principal";

  if (PASILLO_PRINCIPAL.has(ingrediente.aisle)) {
    // Carne o pescado que NO es la proteína declarada: es tropiezo de un
    // sofrito o de una guarnición (el jamón de unas judías verdes), no el eje.
    return receta.mainProtein === "none" ? "principal" : "guarnicion";
  }
  if (PASILLO_GUARNICION.has(ingrediente.aisle)) return "guarnicion";
  if (ingrediente.aisle === "Lácteos") return "salsa";
  return null;
}

/**
 * Las partes derivadas de una receta, índice a índice.
 * @param {object} receta  con `stepsRich`, `ingredients` y `mainProtein`
 * @returns {{parts: (string|null)[], votos: number} | null}
 *   null cuando la receta es monocomponente (nada que separar) o no tiene
 *   pasos ricos. `votos` es cuántos pasos se decidieron por marcador y no por
 *   herencia: es la confianza de la derivación.
 */
export function deriveStepParts(receta) {
  const pasos = receta?.stepsRich ?? [];
  if (!pasos.length) return null;

  const directos = pasos.map((paso) => {
    const cuenta = {};
    for (const marcador of markerIngredientNames(paso?.text)) {
      const linea = findIngredientForMarker(marcador, receta.ingredients ?? []);
      const ing = linea?.ingredientId
        ? resolveIngredient(linea.name) ?? null
        : resolveIngredient(marcador);
      const voto = votoDe(ing, receta);
      if (voto) cuenta[voto] = (cuenta[voto] ?? 0) + 1;
    }
    // La proteína del plato gana aunque la nombre un solo marcador: un paso
    // que toca la merluza es del principal aunque cite tres verduras.
    if (cuenta.principal) return "principal";
    const ganador = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
    return ganador ? ganador[0] : null;
  });

  // Herencia hacia adelante: un paso sin marcadores sigue en la parte del
  // anterior. El primero, si no vota, arranca en "principal".
  const parts = [];
  let actual = null;
  for (const directo of directos) {
    actual = directo ?? actual;
    parts.push(actual ?? "principal");
  }

  // `combinado` es el emplatado: el 84 % de los curados están en los dos
  // últimos pasos, y son los que juntan lo que se cocinó por separado.
  const ultimo = parts.length - 1;
  for (let i = Math.max(0, ultimo - 1); i <= ultimo; i++) {
    const texto = norm(pasos[i]?.text);
    if (/serv|emplat|acompan|al lado|junto|encima|napar|salsear|repartir sobre|montar/.test(texto)) {
      parts[i] = "combinado";
    }
  }

  const distintas = new Set(parts);
  if (distintas.size < 2) return null; // monocomponente: no hay nada que separar
  for (const p of distintas) if (!STEP_PARTS.includes(p)) return null;

  return { parts, votos: directos.filter(Boolean).length };
}

/**
 * Concordancia del operador contra las recetas YA curadas: de los pasos que
 * el modelo etiquetó, cuántos coinciden con lo que este código deduce.
 * Es el número que decide si el derivado se puede usar para algo.
 * @param {object[]} recetas
 */
export function medirConcordancia(recetas) {
  let pasos = 0;
  let aciertos = 0;
  let recetasMedidas = 0;
  const porParte = {};
  for (const r of recetas) {
    const curadas = (r.stepsRich ?? []).map((s) => s?.part ?? null);
    if (!curadas.some(Boolean)) continue;
    const derivado = deriveStepParts(r);
    if (!derivado) continue;
    recetasMedidas += 1;
    curadas.forEach((curada, i) => {
      if (!curada) return;
      pasos += 1;
      porParte[curada] ??= { n: 0, ok: 0 };
      porParte[curada].n += 1;
      if (derivado.parts[i] === curada) {
        aciertos += 1;
        porParte[curada].ok += 1;
      }
    });
  }
  return { recetas: recetasMedidas, pasos, aciertos, ratio: pasos ? aciertos / pasos : 0, porParte };
}
