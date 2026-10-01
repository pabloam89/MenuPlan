/**
 * Los rasgos de una petición de receta, sacados con reglas: «algo de cuchara
 * para el frío» → textura cuchara + temperatura caliente + reconfortante;
 * «que no sea pescado» → excluir el grupo pescado.
 *
 * Para el buscador híbrido (api/_bot/buscador.js): los vectores entienden de
 * qué va una frase pero no los rasgos ni el «no»; esto pone los rasgos y las
 * exclusiones, y el vector ordena el matiz. Acordado entre dos agentes
 * (diseño + crítica, oct 2026):
 *
 *  · BLANDOS (puntúan, no filtran): connotación, textura, temperatura, sabor,
 *    picante, calorías, coste, dificultad, táper, niños, congelar, hierro y los
 *    grupos de ingredientes pedidos («algo con pollo»). La carpeta sacada de
 *    palabras sueltas NO filtra: «ensalada de pasta», «arroz con leche».
 *  · DUROS (filtran; si quedan menos de 3, se quitan y se avisa): solo la
 *    técnica dicha («al horno»), «N minutos» y «rápido».
 *  · EXCLUIR (filtra siempre, nunca se relaja): lo negado, si cae en un grupo
 *    (por proteína principal + ingredientes, no por carpeta: hay 25 recetas
 *    de pescado y 54 de carne fuera de su carpeta), una técnica o el picante.
 *    Un dato que falta deja PASAR la receta al excluir y la deja FUERA al pedir.
 *  · Una negación que no se resuelve (`negacionSinResolver`) manda la frase a
 *    Haiku, que sí entiende «algo que no engorde».
 *
 * Todo sin tildes y con frontera de palabra: «pollo» no es «repollo», «ni» no
 * es «niños».
 */

export const sinTildes = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const ingredientes = (r) => sinTildes((r.ingredients ?? []).map((i) => i?.name ?? "").join(" | "));
const llevaIng = (r, re) => re.test(ingredientes(r));

// ── Grupos de ingredientes ────────────────────────────────────────────────
const CARNE_PROT = new Set(["ternera", "cerdo", "pato", "caza", "pollo", "pavo", "cordero"]);
const PESCADO_PROT = new Set(["pescado_azul", "pescado_blanco", "marisco"]);
export const GRUPOS = {
  pescado_azul: {
    dice: /\bpescados? azul(es)?\b/,
    es: (r) => r.mainProtein === "pescado_azul" || llevaIng(r, /\b(sardinas?|salmon|caballa|atun|boquerones?|bonito|jurel|anchoas?|trucha)\b/),
  },
  marisco: {
    dice: /\b(marisco|mariscos|gambas?|langostinos?|mejillones?|almejas?|calamar(es)?|sepia|pulpo)\b/,
    es: (r) => r.mainProtein === "marisco" || llevaIng(r, /\b(gambas?|langostinos?|mejillones?|almejas?|calamar(es)?|sepia|pulpo|chipirones?)\b/),
  },
  pescado: {
    dice: /\b(pescados?|pescaito|merluza|bacalao|salmon|atun|dorada|lubina|sardinas?)\b/,
    es: (r) => PESCADO_PROT.has(r.mainProtein) || r.category === "pescados"
      || llevaIng(r, /\b(merluza|bacalao|salmon|atun|dorada|lubina|sardinas?|boquerones?|caballa|bonito|rape|gall[oa]|pescado|gambas?|langostinos?|mejillones?|calamar(es)?)\b/),
  },
  carne_roja: {
    dice: /\bcarnes? roja?s?\b|\b(ternera|vacuno|buey|cordero|solomillo|entrecot|chuleton)\b/,
    es: (r) => ["ternera", "cordero", "caza"].includes(r.mainProtein) || llevaIng(r, /\b(ternera|vacuno|buey|cordero|solomillo|entrecot|chuleton)\b/),
  },
  pollo: {
    dice: /\b(pollo|pechugas?|muslos? de pollo)\b/,
    es: (r) => r.mainProtein === "pollo" || llevaIng(r, /\bpollo\b/),
  },
  carne: {
    dice: /\b(carnes?|filete|cerdo|lomo|jamon|chorizo|embutido|salchichas?|pavo|pollo|ternera|cordero)\b/,
    es: (r) => CARNE_PROT.has(r.mainProtein) || r.category === "carnes"
      || llevaIng(r, /\b(pollo|ternera|cerdo|lomo|jamon|chorizo|bacon|beicon|panceta|pavo|cordero|carne|salchichas?|morcilla|butifarra|solomillo)\b/),
  },
  huevo: {
    dice: /\b(huevos?|tortillas?|revuelto)\b/,
    es: (r) => r.mainProtein === "huevo" || r.category === "huevos" || llevaIng(r, /\bhuevos?\b/),
  },
  legumbre: {
    dice: /\b(legumbres?|lentejas?|garbanzos?|alubias?|judias blancas|fabes|potaje)\b/,
    es: (r) => r.mainProtein === "legumbre" || r.category === "legumbres" || r.mainBase === "legumbre",
  },
  pasta: { dice: /\b(pasta|macarrones|espaguetis|spaghetti|tallarines|lasana|fideos)\b/, es: (r) => r.mainBase === "pasta" },
  arroz: { dice: /\b(arroz|arrocito|risotto|paella)\b/, es: (r) => r.mainBase === "arroz" },
};
// Al pedir, el grupo más concreto gana: «pescado azul» no es además «pescado».
const MAS_CONCRETO = { pescado_azul: ["pescado"], carne_roja: ["carne"], pollo: ["carne"], marisco: ["pescado"] };

// ── Técnicas (duras al pedir, excluibles) ────────────────────────────────
const TECNICAS = {
  horno: /\b(al horno|horneado|horneada|hornear|horno)\b/,
  plancha: /\b(plancha|planchita)\b/,
  sarten: /\b(fritos?|fritas?|frituras?|sarten|rebozados?|rebozadas?)\b/,
  olla: /\b(guisos?|guisado|guisito|estofados?|olla|puchero)\b/,
  crudo: /\b(crudos?|crudas?|sin cocinar)\b/,
};

// ── Blandos: [campo, valor, expresión] ────────────────────────────────────
const FRIO_TIEMPO = /\b(para el|con este|con el|contra el|con tanto|que hace) frio\b|\binvierno\b|\bcalentit[oa]\b/;
const BLANDOS = [
  ["connotacion", "casero", /\b(abuela|de siempre|toda la vida|de pequen[oa]|como en casa|caser[oa]|tradicional|de mi madre|de las de antes)\b/],
  ["connotacion", "reconfortante", /\b(pachuch[oa]|resfriad[oa]|reconfortante|malit[oa]|reconforte)\b/],
  ["connotacion", "festivo", /\b(restaurante|impresionar|suegros|invitados|especial|celebrar|celebracion|cumpleanos|domingo|fiesta|lucirme|quedar bien)\b/],
  ["connotacion", "fresco", /\b(fresquit[oa]|fresc[oa]|refrescante|verano|calor)\b/],
  ["textura", "cuchara", /\b(cuchara|potaje|puchero|cocido|caldo|caldito|sopa|guiso|guisito)\b/],
  ["textura", "mano", /\b(picoteo|picotear|de picar|para picar|bocaditos?|aperitivos?|futbol|con las manos)\b/],
  ["picante", "con", /\b(picante|picantit[oa]|que pique|guindilla|enchilad[oa])\b/],
  ["sabor", "especiado", /\b(especias|especiad[oa]|exotic[oa]|curry|oriental|indi[oa]|mexican[oa])\b/],
  ["sabor", "ahumado", /\bahumad[oa]s?\b/],
  ["sabor", "dulce", /\b(dulces?|dulcecit[oa]|golos[oa])\b/],
  ["sabor", "intenso", /\b(intens[oa]|sabros[oa]|potente)\b/],
  ["sabor", "suave", /\b(suave|suavecit[oa])\b/],
  ["calorias", "ligero", /\b(ligeri?t?[oa]s?|light|dieta|me pase|poco calorico|sano|saludable)\b/],
  ["calorias", "contundente", /\b(contundente|que llene|llenar|entrenar|entreno|con hambre|mucha hambre)\b/],
  ["coste", "economico", /\b(barat[oa]s?|baratit[oa]|economic[oa]|fin de mes|ajustad[oa])\b/],
  ["dificultad", "facil", /\b(sin complicarse|sin complicaciones|facil|facilit[oa]|sencill[oa])\b/],
  ["taper", true, /\b(taper|tupper|tuper|al trabajo|a la oficina)\b/],
  ["ninos", true, /\b(ninos|ninas|nino|nina|peques?|crios|chavales|hijos?)\b/],
  ["congelar", true, /\b(congelar|congelado|hacer de mas|para varios dias)\b/],
  ["hierro", true, /\bhierro\b/],
];

/** ¿Cumple la receta un rasgo blando o duro? Un dato que falta: no cumple. */
export function cumple(r, { campo, valor }) {
  switch (campo) {
    case "connotacion": return (r.connotacion ?? []).includes(valor) || (valor === "festivo" && r.occasion === "especial");
    case "textura": return r.textura === valor;
    case "temperatura": return r.temperatura === valor;
    case "tecnica": return r.tecnica === valor;
    case "picante": return valor === "con" ? !!r.picante && r.picante !== "no" : r.picante === "no";
    case "sabor": return (r.sabor ?? []).includes(valor);
    case "calorias": return r.caloriasNivel === valor;
    case "coste": return r.costeNivel === valor;
    case "dificultad": return r.difficulty === valor;
    case "taper": return !!r.tupperFriendly;
    case "ninos": return !!r.kidFriendly;
    case "congelar": return !!r.freezable;
    case "hierro": return (r.healthFlags ?? []).includes("rico_hierro");
    case "grupo": return !!GRUPOS[valor]?.es(r);
    case "maxMinutos": return !!r.time && r.time <= valor;
    case "rol": return (r.mealRole ?? []).includes(valor);
    default: return false;
  }
}

/** ¿La deja fuera una exclusión? Un dato que falta: pasa. */
export function excluye(r, { tipo, valor }) {
  if (tipo === "grupo") return !!GRUPOS[valor]?.es(r);
  if (tipo === "tecnica") return r.tecnica === valor;
  if (tipo === "picante") return !!r.picante && r.picante !== "no";
  return false;
}

// ── Negación ──────────────────────────────────────────────────────────────
// Frases hechas con «sin»/«no»/«ni» que no niegan nada de la receta.
const NO_NIEGAN = /\b(sin complicarse|sin complicaciones|sin prisas?|sin mas|ni idea|no se|no lo se|me da igual|lo que sea|no me importa|sin pasarse)\b/g;
// «menos» no: «en menos de 20 minutos» no niega nada.
const DISPARADOR = /\b(no|sin|ni|nada de|evitar|tampoco)\b/;
// Palabras de relleno dentro del alcance de una negación: si solo quedan
// estas tras resolver, la negación está resuelta.
const RELLENO = new Set("ni no sin me te nos le les apetece apetecen quiero queremos quiere lleve lleven tenga tengan sea sean pique haya hay usar encender encendemos el la los las lo un una unos unas de del que hoy otra vez mas mucho mucha muy tanto tanta nada nadie para por con y o a al este esta esto ya algo comer comida cena cenar plato".split(" "));

function resolverAlcance(alcance) {
  const excluir = [];
  let resto = ` ${alcance} `;
  const quita = (re) => { resto = resto.replace(new RegExp(re.source, "g"), " "); };
  // Lo más concreto primero, para no dejar «azul» suelto.
  for (const g of ["pescado_azul", "carne_roja", "marisco", "pollo", "pescado", "carne", "huevo", "legumbre", "pasta", "arroz"]) {
    if (GRUPOS[g].dice.test(resto)) { excluir.push({ tipo: "grupo", valor: g }); quita(GRUPOS[g].dice); }
  }
  for (const [t, re] of Object.entries(TECNICAS)) {
    if (re.test(resto)) { excluir.push({ tipo: "tecnica", valor: t }); quita(re); }
  }
  if (/\b(picante|pique|picantes|picar)\b/.test(resto)) { excluir.push({ tipo: "picante", valor: true }); quita(/\b(picante|pique|picantes|picar)\b/); }
  const sobra = resto.split(/[^a-z0-9n]+/).filter((w) => w && !RELLENO.has(w));
  return { excluir, resuelta: excluir.length > 0 && sobra.length === 0 };
}

/**
 * @returns {{ blandos: {campo,valor}[], duros: {campo,valor}[], excluir: {tipo,valor}[],
 *   negacion: boolean, negacionSinResolver: boolean, resto: string, hayRasgos: boolean }}
 *   `resto` es la frase sin lo negado: lo que se vectoriza.
 */
export function rasgosDeFrase(frase) {
  let t = ` ${sinTildes(frase).replace(/[¿?¡!.,;:()"«»]/g, " ").replace(/\s+/g, " ")} `;
  t = t.replace(NO_NIEGAN, (m) => m.replace(/\b(sin|no|ni)\b/g, "_$1"));

  // Negaciones: «sin X», «que no sea X», «nada de X», «ni X ni Y» (alcance
  // hasta 4 palabras) y «X no» / «X tampoco» al final.
  const excluir = [];
  let negacion = false;
  let negacionSinResolver = false;
  const alcances = [];
  const re = /\b(?:que\s+)?(no|sin|ni|nada de|evitar|tampoco)\b((?:\s+[a-z0-9n_]+){1,4})/g;
  for (const m of t.matchAll(re)) alcances.push([m.index, m[0].length, m[2]]);
  const alFinal = t.match(/((?:\s+[a-z0-9n_]+){1,3})\s+(no|tampoco)\s*$/);
  if (alFinal && !alcances.some(([i]) => i >= alFinal.index)) alcances.push([alFinal.index, alFinal[0].length, alFinal[1]]);
  if (!alcances.length && DISPARADOR.test(t)) negacion = true;
  let positivo = t;
  for (const [i, largo, alcance] of alcances) {
    negacion = true;
    const r = resolverAlcance(alcance);
    excluir.push(...r.excluir);
    if (!r.resuelta) negacionSinResolver = true;
    positivo = positivo.slice(0, i) + " ".repeat(largo) + positivo.slice(i + largo);
  }
  if (negacion && !alcances.length) negacionSinResolver = true;
  positivo = positivo.replace(/_(sin|no|ni)\b/g, "$1");

  // Lo positivo, sobre la frase SIN lo negado.
  const blandos = [];
  const duros = [];
  const pon = (lista, campo, valor) => { if (!lista.some((x) => x.campo === campo && x.valor === valor)) lista.push({ campo, valor }); };
  if (FRIO_TIEMPO.test(positivo)) { pon(blandos, "temperatura", "caliente"); pon(blandos, "connotacion", "reconfortante"); }
  else if (/\b(frio|fria|frios|frias)\b/.test(positivo)) pon(blandos, "temperatura", "frio");
  for (const [campo, valor, expr] of BLANDOS) {
    if (campo === "connotacion" && valor === "fresco" && FRIO_TIEMPO.test(positivo)) continue;
    if (expr.test(positivo)) pon(blandos, campo, valor);
  }
  if (/\bensaladas?\b/.test(positivo) && /\b(que llene|completa|unica|de plato unico)\b/.test(positivo)) pon(blandos, "rol", "plato_unico");
  const grupos = Object.keys(GRUPOS).filter((g) => GRUPOS[g].dice.test(positivo));
  for (const g of grupos) {
    const tapado = Object.entries(MAS_CONCRETO).some(([fino, gruesos]) => gruesos.includes(g) && grupos.includes(fino));
    if (!tapado) pon(blandos, "grupo", g);
  }
  for (const [tec, expr] of Object.entries(TECNICAS)) if (expr.test(positivo)) pon(duros, "tecnica", tec);
  const min = positivo.match(/\b(\d{1,3})\s*(min|minutos)\b/);
  if (min) pon(duros, "maxMinutos", Number(min[1]));
  else if (/\bmedia hora\b/.test(positivo)) pon(duros, "maxMinutos", 30);
  else if (/\bcuarto de hora\b/.test(positivo)) pon(duros, "maxMinutos", 15);
  else if (/\b(rapid[oa]s?|rapidit[oa]s?|en un momento|en nada|en un pispas|express)\b/.test(positivo)) pon(duros, "maxMinutos", 25);

  const resto = positivo.replace(/\s+/g, " ").trim();
  return {
    blandos, duros, excluir, negacion, negacionSinResolver, resto,
    hayRasgos: blandos.length + duros.length + excluir.length > 0,
  };
}

/** Cuántos blandos cumple: para ordenar antes que el parecido. */
export const blandosCumplidos = (r, blandos) => blandos.reduce((n, b) => n + (cumple(r, b) ? 1 : 0), 0);
