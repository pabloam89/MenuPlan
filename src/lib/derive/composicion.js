/**
 * El VECTOR DE COMPOSICIÓN: de qué está hecho un plato, por parte y por plano.
 *
 * Deriva de los ingredientes lo que hoy se cura a mano — `mainProtein` y el
 * tipo de hidrato — repartiendo la masa SERVIDA del plato entre los nodos del
 * árbol de alimentos. Es la Prueba 1 del documento de normalización, y sus
 * tres reglas no se inventan aquí:
 *
 *   · el vector se calcula por PARTE (principal / guarnición / salsa), porque
 *     la patata de una guarnición nunca compitió con el pescado del principal;
 *   · la dominancia compite solo DENTRO de su plano: una proteína con otra
 *     proteína, y la verdura no compite con nadie;
 *   · el caldo cuenta como masa servida pero NO compite — excluirlo quitó de
 *     golpe ocho errores en sopas y arroces caldosos.
 *
 * ── QUÉ ES ESTO Y QUÉ NO ──────────────────────────────────────────────────
 *
 * Hoy es un AUDITOR, no una autoridad, y el número que lo dice está medido:
 * sobre las 529 recetas que nunca se usaron para afinarlo acierta el 97,3 %
 * de `mainProtein` y el 99,1 % del hidrato. Suena a mucho y engaña, porque
 * la mitad de las decisiones de proteína no tienen rival —el plato lleva un
 * solo nodo proteico y no hay nada que decidir—. Donde de verdad compiten dos
 * nodos baja al 97,5 %, y en las 69 decisiones apretadas (menos del 25 % de
 * margen) al 82 %.
 *
 * Por eso NO escribe `mainProtein`. Lo que hace bien es encontrar líneas mal:
 * en dos tardes destapó unos cuarenta errores de datos reales, once de ellos
 * calorías que el usuario ve. `medirAcuerdo` es lo que sostiene esa promesa.
 *
 * Lo que le falta para ser autoridad está medido y escrito: `part` solo existe
 * en 504 de 1033 recetas, así que la pieza «por parte» está probada en el 17 %
 * del catálogo; y hay una familia irreducible —el cerdo curado que en poca masa
 * define el plato, la carbonara y la tarta de puerros y bacon— que el propio
 * documento ya daba por no derivable de la composición.
 */
import alimentos from "../../data/alimentos.json";
import alimentoPorIngrediente from "../../data/alimentoPorIngrediente.json";
import { availablePartsOf, ingredientsByPart } from "../recipeSteps.js";
import { gramsForRecipeQuantity } from "../kitchenUnits.js";
// Importar `ingredients.js` no es decorativo aunque no se use nada suyo: al
// cargarse REGISTRA en kitchenUnits el catálogo de piezas y el de densidades
// (registerPieceCatalog / registerDensityCatalog, inyectados así para no
// cerrar un ciclo de imports). Sin esta línea `4 ud` de huevo valen null, el
// huevo desaparece del vector y con él todas las tortillas y los revueltos.
import "../ingredients.js";
import { ES_ACEITE_DE_FREIR, factorAceite, fraccionServida, factorHidratacion, seFrie, hayCostra, esCostra } from "./masaServida.js";

const porId = new Map(alimentos.map((a) => [a.id, a]));
const alimentoDe = (ingredientId) => porId.get(alimentoPorIngrediente[ingredientId] ?? ingredientId);
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ── Plano A → los dos ejes que la curación declara ──────────────────────────
// Un nodo solo compite en SU eje. Lo que no aparece en ninguno de los dos
// mapas no compite: ni la verdura, ni la fruta, ni el condimento.

/** clase/subclase/especie → el vocabulario de `mainProtein`. */
export function ejeProteina(t) {
  if (!t) return null;
  const { clase, subclase, especie } = t;
  if (clase === "ave") {
    if (subclase === "huevo") return "huevo";
    if (especie === "pavo") return "pavo";
    if (especie === "pato") return "pato";
    if (especie === "codorniz" || especie === "perdiz") return "caza";
    return "pollo";
  }
  if (clase === "pez") return subclase;                  // pescado_blanco | pescado_azul
  if (clase === "marisco" || clase === "cefalopodo") return "marisco";
  if (clase === "mamifero") {
    if (subclase === "carne_cerdo") return "cerdo";
    if (subclase === "carne_roja") return especie === "cordero" ? "cordero" : "ternera";
    if (subclase === "carne_caza") return "caza";
    // El pastrami es ternera: la transformación es atributo, no posición.
    if (subclase === "embutido") return especie === "pastrami" ? "ternera" : "cerdo";
  }
  // Una víscera compite como su animal: unos callos son ternera. La especie la
  // resuelve el árbol (HEREDA_ESPECIE_DE en scripts/lib/taxonomia.mjs).
  if (clase === "viscera") return especie === "cerdo" || especie === "ternera" ? especie : null;
  if (clase === "legumbre") return "legumbre";
  if (clase === "lacteo") return "lacteo";               // clase CONDICIONAL, ver dominante()
  return null;
}

/** clase/subclase/especie → el vocabulario de `carbType` (validateMenu.js). */
export function ejeHidrato(t) {
  if (!t) return null;
  const { clase, subclase, especie } = t;
  if (clase === "cereal") {
    if (subclase === "arroz") return "arroz";
    if (subclase === "pasta") return "pasta";
    if (subclase === "pan") return "pan";
    if (especie === "avena") return "avena";
    if (especie === "quinoa") return "quinoa";
    if (especie === "cuscu") return "cuscus";
    return null;                                          // harina, levadura, maicena
  }
  if (clase === "hortaliza" && subclase === "tuberculo") return "patatas";
  return null;
}

/**
 * El tercer plano: la VERDURA.
 *
 * No existía, y su ausencia es la que obligaba a que la familia «verdura»
 * saliera de `category` —o sea, del formato: `ensaladas_verduras` y
 * `sopas_cremas`—. Con él, las seis familias salen del mismo sitio y la
 * categoría deja de decidir de qué está hecho un plato.
 *
 * ── Un solo nodo, y a propósito ───────────────────────────────────────────
 * Los otros dos planos existen para que sus nodos COMPITAN: una proteína con
 * otra proteína. La verdura no compite con nadie —lo dice la cabecera de este
 * fichero— así que aquí no hay dominancia que resolver: hay una cuota de masa.
 * Por eso todas las hortalizas suman al mismo nodo en vez de pelearse entre
 * ellas: lo que se pregunta no es «¿calabacín o berenjena?», es «¿cuánta
 * verdura lleva esto?».
 *
 * ── El tubérculo NO ───────────────────────────────────────────────────────
 * La patata ya compite en el plano del hidrato (`ejeHidrato` la manda a
 * `patatas`). Contarla también aquí la metería dos veces y, peor, convertiría
 * cualquier guiso con patatas en un plato de verdura. La patata gasta
 * presupuesto de guarnición y no convierte el plato en nada — es exactamente
 * lo que dice el eje 45 del registro.
 *
 * La seta entra: un salteado de setas es un plato de verdura para cualquiera
 * que se lo coma, aunque un micólogo diría que no es una planta.
 */
export function ejeVerdura(t) {
  if (!t) return null;
  if (t.clase === "hortaliza") return t.subclase === "tuberculo" ? null : "verdura";
  if (t.clase === "hongo") return "verdura";
  if (t.clase === "alga") return "verdura";
  return null;
}

/** La harina no es una base servida hasta que alguien la amasa: lo dice la línea. */
const MASA_A_EJE = { masa_pasta: "pasta", masa_pan: "pan" };

/**
 * Lo que es aroma y no comida. El ajo por debajo de 20 g perfuma; por encima,
 * es un ajo asado y se come.
 */
function esAroma(linea, alimento, gramos) {
  const n = norm(linea?.name);
  if (alimento?.taxonomia?.clase === "aromatica") return true;
  if (alimento?.rol === "condimento") return true;
  // Una SALSA tampoco compite, y no era obvio: la salsa de soja, el miso y el
  // gochujang cuelgan de `legumbre` en el árbol —lo son— y 34 g de soja de
  // aliñar llegaron a ganarle el eje de la proteína a 200 g de salmón.
  if (alimento?.rol === "salsa") return true;
  // Con frontera de palabra a propósito: sin ella `^sal` se come «salchicha»,
  // «salmón» y «salsa», y el vector pierde la proteína del plato entero.
  if (/^(sal|pimienta|perejil|laurel|azafran|cilantro)\b/.test(n)) return true;
  return /^ajo\b/.test(n) && gramos < 20;
}

/** El caldo y el agua cuentan como masa servida pero no compiten. */
const cuentaPeroNoCompite = (a) => a?.rol === "caldo" || a?.id === "agua";

// El aceite de freír se absorbe, no se come entero. La regla vive en
// masaServida.js: aquí había una segunda copia del 0,06 que lo aplicaba como
// multiplicación en vez de como tope, y el vector se comía el aceite de aliñar
// 16 veces por debajo.

/**
 * El vector de una receta.
 *
 * @returns {{
 *   partes: Record<string, Record<string, number>>,
 *   proteina: Map<string, number>, hidrato: Map<string, number>,
 *   verdura: Map<string, number>,
 *   proteinaG: Map<string, number>, masaTotal: number, dudas: string[]
 * }}
 */
export function composicionDe(receta) {
  const disponibles = availablePartsOf(receta?.stepsRich);
  const porParte = disponibles.length
    ? ingredientsByPart(receta.stepsRich, receta.ingredients ?? [])
    : { unico: receta?.ingredients ?? [] };

  const partes = {};
  const proteina = new Map();
  const hidrato = new Map();
  const verdura = new Map();
  const proteinaG = new Map();
  const dudas = [];
  let masaTotal = 0;

  // El aceite se topa contra el sólido de TODA la receta, así que hay que
  // conocerlo antes de recorrer las partes. Sólido = lo comprado menos lo que
  // se tira, SIN hidratar: el 6 % se midió contra el peso de la patata cruda,
  // y hidratar aquí le daría a un plato de pasta el doble de aceite.
  let solidoGramos = 0;
  let aceiteBruto = 0;
  // LA COSTRA SE DECIDE MIRANDO TODAS LAS LÍNEAS, antes de contar nada: el
  // azúcar de un gravlax solo se tira si hay sal con él. Y se decide AQUÍ
  // porque este carril no la conocía —la regla vivía dentro de ingredients.js—
  // y por eso la «Lubina entera a la sal» daba 1.084 g por ración: sus 1.500 g
  // de sal gruesa contaban como comida en el vector y no en las kcal.
  const lineasParaCostra = Object.values(porParte).flat().map((l) => ({
    name: l.name,
    gramos: gramsForRecipeQuantity(l.name, l.amount, l.unit) ?? 0,
  }));
  const conCostra = hayCostra(lineasParaCostra);
  for (const linea of Object.values(porParte).flat()) {
    const id = linea.ingredientId ?? null;
    const cruda = gramsForRecipeQuantity(linea.name, linea.amount, linea.unit);
    if (cruda == null || cruda <= 0) continue;
    if (esCostra(linea.name, cruda, conCostra)) continue;
    const g = cruda * fraccionServida(linea.name, id, alimentoDe(id)).factor;
    if (id && ES_ACEITE_DE_FREIR.test(id)) aceiteBruto += g;
    else solidoGramos += g;
  }
  // El MISMO `seFrie` que usa computeRecipeNutrition: si los dos carriles
  // decidieran por su cuenta cuándo se fríe, el vector y las kcal acabarían
  // contando aceites distintos para el mismo plato.
  const tajadaDeAceite = factorAceite(aceiteBruto, solidoGramos, seFrie(receta));

  for (const [parte, lineas] of Object.entries(porParte)) {
    partes[parte] = {};
    for (const linea of lineas) {
      const id = linea.ingredientId ?? null;
      const al = id ? alimentoDe(id) : null;
      const t = al?.taxonomia;
      let cruda = gramsForRecipeQuantity(linea.name, linea.amount, linea.unit);
      if (cruda == null || cruda <= 0) continue;
      // Ni su masa ni su composición llegan al plato.
      if (esCostra(linea.name, cruda, conCostra)) continue;
      if (id && ES_ACEITE_DE_FREIR.test(id)) cruda *= tajadaDeAceite;

      const h = factorHidratacion(linea.name, al);
      const c = fraccionServida(linea.name, id, al);
      if (h.duda) dudas.push(h.duda);
      if (c.duda) dudas.push(c.duda);
      const servida = cruda * h.factor * c.factor;
      if (servida <= 0) continue;

      masaTotal += servida;
      const nodo = t ? [t.clase, t.subclase, t.especie].filter(Boolean).join(".") : `?${id ?? linea.name}`;
      partes[parte][nodo] = (partes[parte][nodo] ?? 0) + servida;

      if (esAroma(linea, al, cruda) || cuentaPeroNoCompite(al)) continue;

      const p = ejeProteina(t);
      if (p) {
        proteina.set(p, (proteina.get(p) ?? 0) + servida);
        proteinaG.set(p, (proteinaG.get(p) ?? 0) + (al?.nutricion?.protein100g ?? 0) * cruda / 100);
      }
      const hid = MASA_A_EJE[linea.preparacion] ?? ejeHidrato(t);
      if (hid) hidrato.set(hid, (hidrato.get(hid) ?? 0) + servida);
      const ver = ejeVerdura(t);
      if (ver) verdura.set(ver, (verdura.get(ver) ?? 0) + servida);
    }
  }
  return { partes, proteina, hidrato, verdura, proteinaG, masaTotal, dudas };
}

/**
 * El lácteo es una clase CONDICIONAL: cuenta entero para nutrición, pero no
 * compite por dominante si hay otra proteína por encima del umbral. Se probó a
 * partirlo —dejar competir al queso sólido— y arregla 0 casos y rompe 5: el
 * queso pesa más que el jamón en la sopa de cebolla, las quesadillas, el
 * calzone y los chiles rellenos, y en ninguno de esos el humano dice `lacteo`.
 */
const UMBRAL_PROTEINA_G = 5;

/**
 * Y la otra mitad: el ganador tiene que PESAR algo dentro del plato. Veinte
 * gramos de parmesano rallado por encima de una sopa no son su proteína, y
 * contestar «lácteo» es peor que no contestar: un «no lo sé» se puede ir a
 * mirar y una respuesta plausible no.
 *
 * El 2 % sale de barrer el catálogo entero: es la cuota más alta que no pierde
 * ni un acierto. Al 3 % ya se lleva por delante la «Pasta con brócoli y
 * anchoas», donde 15 g de anchoa SÍ son la proteína del plato.
 */
const CUOTA_MINIMA = 0.02;

/** @returns {{nodo: string|null, margen: number|null, porRegla: boolean}} */
export function dominante(masa, { proteinaG = null, masaTotal = 0, condicional = false } = {}) {
  const filas = [...masa.entries()].sort((a, b) => b[1] - a[1]);
  if (!filas.length) return { nodo: null, margen: null, porRegla: false };

  let ganador = filas[0];
  if (condicional && filas[0][0] === "lacteo") {
    const otras = filas.filter(([k]) => k !== "lacteo" && (proteinaG?.get(k) ?? Infinity) >= UMBRAL_PROTEINA_G);
    if (otras.length) ganador = otras[0];
  }
  if (masaTotal > 0 && ganador[1] / masaTotal < CUOTA_MINIMA) {
    return { nodo: null, margen: null, porRegla: false };
  }
  const rival = filas.find(([k]) => k !== ganador[0]);
  return {
    nodo: ganador[0],
    // Ojo al margen NEGATIVO: cuando la regla del lácteo asciende a un nodo
    // más pequeño, el ganador pesa MENOS que el segundo. Filtrar por `>= 0`
    // esconde justo los casos donde decide la regla y no la masa.
    margen: rival ? 1 - rival[1] / ganador[1] : 1,
    porRegla: ganador !== filas[0],
  };
}

/** La proteína dominante de una receta, o null si el vector no lo sabe. */
export function proteinaDominante(receta) {
  const v = composicionDe(receta);
  return dominante(v.proteina, { proteinaG: v.proteinaG, masaTotal: v.masaTotal, condicional: true }).nodo;
}

/** El tipo de hidrato dominante, o null. */
export function hidratoDominante(receta) {
  const v = composicionDe(receta);
  return dominante(v.hidrato, { masaTotal: v.masaTotal }).nodo;
}

/**
 * Cuánto se parece lo derivado a lo curado, y CON QUÉ MARGEN.
 *
 * El acuerdo a secas engaña porque la mitad de las decisiones no tienen rival.
 * El reparto por margen es lo que dice si el número es sólido: hoy no hay ni
 * un fallo por encima del 50 % de margen y uno de cada trece por debajo del
 * 10 %. Un modelo bien calibrado sabe cuándo duda.
 *
 * @param {"proteina"|"hidrato"} eje
 * @param {(receta) => string|null} curado  el valor humano con el que comparar
 */
export function medirAcuerdo(recetas, eje, curado) {
  const bandas = { apretado: { ok: 0, mal: 0 }, medio: { ok: 0, mal: 0 }, holgado: { ok: 0, mal: 0 }, sinRival: { ok: 0, mal: 0 } };
  const errores = [];
  let ok = 0; let mal = 0; let sinRespuesta = 0;

  for (const r of recetas) {
    const esperado = curado(r);
    if (esperado == null) continue;
    const v = composicionDe(r);
    const d = dominante(eje === "proteina" ? v.proteina : v.hidrato, {
      proteinaG: v.proteinaG, masaTotal: v.masaTotal, condicional: eje === "proteina",
    });
    if (d.nodo == null) { sinRespuesta++; errores.push({ receta: r.name, esperado, derivado: null }); continue; }
    const acierta = d.nodo === esperado;
    if (acierta) ok++; else { mal++; errores.push({ receta: r.name, esperado, derivado: d.nodo, margen: d.margen }); }
    const banda = d.margen === 1 ? "sinRival" : d.margen >= 0.5 ? "holgado" : d.margen >= 0.25 ? "medio" : "apretado";
    bandas[banda][acierta ? "ok" : "mal"]++;
  }
  const total = ok + mal + sinRespuesta;
  return { ok, mal, sinRespuesta, total, acuerdo: total ? ok / total : 0, bandas, errores };
}

/** El valor humano de cada eje. `none` no es una proteína: es la ausencia. */
export const proteinaCurada = (r) => (r.mainProtein === "none" ? null : r.mainProtein);
