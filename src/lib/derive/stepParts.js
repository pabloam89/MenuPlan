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
 * ── El nombre en texto plano, antes de heredar ────────────────────────────
 * La herencia arrastra la parte equivocada en cuanto la receta INTERCALA. En
 * «Magret de pato con salsa de frutos rojos», cuatro pasos seguidos dicen
 * «Colocar el magret…», «Voltear el magret…», «Retirar el magret…» sin un
 * solo {{marcador}}, así que heredaban de la chalota de la salsa y salían
 * `guarnicion` siendo el principal. Era el fallo dominante: 384 pasos de
 * principal marcados guarnicion, más 229 marcados salsa.
 *
 * Y el dato está ahí: de los 1220 pasos curados sin marcador, 750 (61,5 %)
 * nombran en texto plano un ingrediente de la propia receta. Así que antes de
 * heredar se busca ese nombre, y el voto sale por el MISMO camino que el del
 * marcador —`votoDe`, con su NO_VOTA y su pasillo—, no por una regla paralela.
 *
 * Solo actúa cuando los marcadores no han votado: un marcador es una
 * declaración y el texto plano una lectura, y la declaración manda.
 *
 * ── Lo que se probó y NO entró ────────────────────────────────────────────
 * Dos cosas, y las dos se midieron antes de descartarse, que es la única
 * manera de que un «no» valga algo:
 *
 *   · HEREDAR HACIA ATRÁS. La idea era que «Calentar la plancha» o «Batir el
 *     huevo» anuncian lo que viene en vez de continuar lo anterior. Medido:
 *     53,7 % frente a 59,1 %. La receta se escribe hacia delante.
 *
 *   · UN LÉXICO DE SALSAS (mojo, chimichurri, vinagreta, reducción…), porque
 *     `salsa` es la parte peor derivada, con 44 %. En su versión agresiva
 *     subía salsa a 50 % pero hundía principal de 59 a 56 —«Devolver el
 *     ossobuco a la cazuela CON LA SALSA» es un paso del principal— y el neto
 *     bajaba. En su versión prudente, corrigiendo solo el voto de guarnición,
 *     ganaba 3 pasos de 2478. Veinte palabras de regex por tres pasos no se
 *     pagan, y el código que no se paga es el que luego nadie sabe por qué
 *     está.
 *
 * ── Y por qué esto SIGUE sin promocionarse a fuente ───────────────────────
 * 59,1 % de concordancia. Ha subido desde el 52,6 % y cada punto está medido,
 * pero cuatro de cada diez pasos siguen mal y `salsa` no llega ni a la mitad.
 * El operador vale para MEDIRSE y para explorar; no vale para escribir `part`
 * en 853 recetas. El día que alguien quiera usarlo, el número está aquí y es
 * el que manda, no la sensación de que «ya casi».
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
 *
 * TERMINA EN `\b`, y no es cosmética: sin la frontera, `^sal` casaba «Salmón»
 * y «Salsifí», `^ajo` casaba «Ajonjolí» y `^apio` se habría llevado por
 * delante el «Apionabo» que en varias recetas ES la guarnición. Es el mismo
 * error que ya se pagó en los regex de alimento, y aquí estaba cobrándose
 * pescados enteros en silencio.
 *
 * ── El rebozado y el ligante ──────────────────────────────────────────────
 * El huevo de una milanesa de ternera, el pan rallado, la maicena: no son una
 * parte del plato, son CÓMO se trata el principal. Sin ellos aquí, «Batir
 * {{Huevo}}» y «Mezclar {{Pan rallado}}» votaban `guarnicion` —el huevo es
 * pasillo Huevos y la proteína declarada era ternera— y arrastraban por
 * herencia todos los pasos que venían detrás.
 *
 * Callarlos es seguro porque la proteína declarada se pregunta ANTES: en una
 * tortilla, `mainProtein: huevo` hace que el huevo vote principal y no llegue
 * hasta aquí. La lista calla el rol, no el alimento.
 */
const NO_VOTA = /^(cebolla|ajo|tomate|pimiento|aceite|sal|pimienta|perejil|laurel|vino|caldo|agua|azucar|harina|cebolleta|puerro|zanahoria|apio|huevo|pan rallado|maicena|almidon|comino|pimenton|oregano|tomillo|romero|curry|canela|nuez moscada|azafran|cilantro|albahaca|menta|eneldo|cebollino|clavo|jengibre)\b/;

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

const escapa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * La raíz del nombre de una línea, para buscarla en el texto de un paso.
 *
 * Se corta por « de » y « con » porque un nombre de ingrediente enumera igual
 * que uno de receta: «Carrilleras DE ternera» se nombra en el paso como
 * «las carrilleras», y «Muslos DE pollo» como «los muslos».
 *
 * CON FRONTERA DE PALABRA, siempre. Sin ella, `sal` casa «salsa» y `ajo`
 * casa «cangrejo»: es el mismo error que ya se pagó en los regex de alimento.
 * La `s?` final cubre el plural, que es como el paso lo escribe casi siempre.
 */
function raizDeLinea(nombre) {
  const raiz = norm(nombre).split(/ de | con /)[0].trim().replace(/s$/, "");
  return raiz.length > 3 ? new RegExp(`\\b${escapa(raiz)}s?\\b`) : null;
}

/** El voto de un ingrediente, o null si no opina. */
function votoDe(ingrediente, receta) {
  if (!ingrediente) return null;
  if (ID_SALSA.has(ingrediente.id)) return "salsa";

  // LA PROTEÍNA DECLARADA SE PREGUNTA ANTES QUE NADA, porque es lo único que
  // la receta afirma de sí misma. Estaba debajo de NO_VOTA, y eso hacía que
  // `huevo` no pudiera entrar nunca en la lista de los que no votan: habría
  // callado también a la tortilla, donde el huevo ES el plato.
  const re = IDS_POR_PROTEINA[receta.mainProtein];
  if (re && re.test(norm(ingrediente.name))) return "principal";

  if (NO_VOTA.test(norm(ingrediente.name))) return null;

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

  // Las líneas de la receta, con su raíz buscable y su voto ya resuelto. Se
  // calcula una vez por receta y no una vez por paso: son los mismos
  // ingredientes en los quince pasos.
  const porTexto = (receta.ingredients ?? [])
    .map((linea) => ({
      re: raizDeLinea(linea?.name),
      voto: votoDe(resolveIngredient(linea?.name) ?? null, receta),
    }))
    .filter((x) => x.re && x.voto);

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
    // Ningún marcador ha opinado: se lee el texto plano antes de heredar.
    if (!Object.keys(cuenta).length) {
      const texto = norm(paso?.text);
      for (const { re, voto } of porTexto) {
        if (re.test(texto)) cuenta[voto] = (cuenta[voto] ?? 0) + 1;
      }
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
