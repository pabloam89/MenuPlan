/**
 * Deriva la `familia` de un ingrediente — Fase A3 de specs/modelo-datos.md.
 *
 * POR QUÉ HACE FALTA. El catálogo tiene dos campos de agrupación y ninguno
 * agrupa alimentos: `category` es el pasillo (209 de 383 filas caen en
 * "Verduras y frutas", con Butifarra, Bogavante y Fettuccine dentro) y `aisle`
 * es la estantería (Aceitunas, Agua, Alga nori y Alioli comparten una). La
 * familia es la clave que falta, y de ella cuelgan cuatro cosas: la vista de
 * libro de cuentas, el bug de favoritos que casa por subcadena, `aporteDe` por
 * FK, y la taxonomía de la que el solver ya depende sin tenerla.
 *
 * CUATRO CAPAS, DE MÁS AUTORIDAD A MENOS. El orden no es estético: cada capa
 * de abajo es más falible que la de arriba, y así la falible nunca pisa a la
 * fiable.
 *
 *   1. juicio       decisión registrada a mano, con motivo (familiaLabels.json)
 *   2. pasillo      los pasillos que YA determinan la familia por sí solos
 *   3. frase        expresión de varias palabras ("pez espada", "leche de coco")
 *   4. palabra      raíz de palabra suelta, de lo más específico a lo general
 *
 * La capa 2 va ANTES que el léxico a propósito. "Jengibre fresco" está en el
 * pasillo Especias y el léxico diría `verdura_raiz`: técnicamente cierto y
 * útil para nada, porque nadie planifica una semana alrededor del jengibre.
 * Cuando el catálogo ya ha decidido que algo es un condimento, esa decisión
 * gana.
 *
 * Y NADA DE SUBCADENAS. Se casa por PALABRA con la raíz cortada, no con
 * `includes`. Esta auditoría ya ha desmontado tres veces el mismo bug —
 * `/aceite/` casando "Anchoas en aceite", "te" casando 972 de 1.033 recetas—
 * y la primera versión de este mismo fichero lo repitió por cuarta vez.
 */

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "en", "con", "sin", "un", "una",
  "al", "para", "o", "tipo", "variedad",
]);

export function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Todas las formas singulares plausibles de una palabra, sin decidir cuál.
 *
 * Singularizar con UNA regla no funciona en español y la primera versión de
 * esto se estrelló contra ello: "mejillones" pide quitar "-es" y "ajetes" pide
 * quitar solo la "-s", porque su singular ya acaba en "e". Con la regla de
 * "-es" salía "ajet", que no casa con "ajete", y se perdieron seis
 * ingredientes (Ajetes, Brotes tiernos, Guisantes, Cacahuetes…).
 *
 * Así que no se elige: se generan las tres y casa la que casa. Es una bolsa de
 * candidatos, no una afirmación sobre la morfología de la palabra.
 */
export function formas(w) {
  const f = new Set([w]);
  if (w.length > 3 && w.endsWith("s")) f.add(w.slice(0, -1));
  if (w.length > 4 && w.endsWith("es")) f.add(w.slice(0, -2));
  return f;
}

export function stems(nombre) {
  const out = new Set();
  for (const w of norm(nombre).split(/[^a-z0-9ñ]+/)) {
    if (w.length <= 1 || STOPWORDS.has(w)) continue;
    for (const f of formas(w)) out.add(f);
  }
  return out;
}

// ── Capa 2 ──────────────────────────────────────────────────────────────────
// Pasillos cuya familia es una sola cosa. No es una suposición sobre el mundo:
// es lo que el catálogo ya afirma al meter algo en ese pasillo.
export const FAMILIA_POR_PASILLO = {
  "Especias": "especia",
  "Legumbres": "legumbre",
  "Huevos": "huevo",
  "Frutas": "fruta",
};

// ── Capa 3 ──────────────────────────────────────────────────────────────────
// Frases: lo que solo significa algo junto. "Leche de coco" no es leche y
// "pez espada" no es un pez llamado espada.
export const FRASES = [
  ["pez espada", "pescado_azul"],
  ["leche de coco", "fruto_seco"],
  // Un aceite viene de algo, y ese algo es su identidad: la oliva es un fruto
  // y el girasol y el sésamo son semillas. Que sean grasa lo dice el ROL.
  ["aceite de sesamo", "fruto_seco"],
  ["aceite de girasol", "fruto_seco"],
  ["aceite de oliva", "fruta"],
  ["aceituna", "fruta"],
  // Un nacho y una tortilla de maíz son pan, no maíz.
  ["nacho", "pan"],
  ["tortilla de maiz", "pan"],
  ["mantequilla de cacahuete", "fruto_seco"],
  ["manteca de cerdo", "carne_cerdo"],
  ["tinta de calamar", "cefalopodo"],
  ["tortilla de maiz", "pan"],
  ["pesto", "verdura_hoja"],
  // Todos los vinagres igual. Sin esta frase, "Vinagre de manzana" se iba a
  // `fruta` por la manzana y "Vinagre balsámico" a `compuesto`: el mismo
  // producto en dos familias según de qué estuviera hecho. Si el vino ya es
  // compuesto por fermentado, el vinagre lo es dos veces.
  ["vinagre", "compuesto"],
  ["carne de txangurro", "marisco"],
  ["carne de zamburina", "marisco"],
  ["palito de cangrejo", "marisco"],
  ["pan rallado", "cereal"],
  ["semola de trigo", "cereal"],
  // El tomate deja de partirse en tres: frito, triturado, concentrado y seco
  // son todos tomate. Lo que cambia entre ellos es el ROL, no lo que son. Este
  // bloque es literalmente la corrección que motivó separar los dos planos.
  ["tomate", "verdura_fruto"],
  ["pimiento del piquillo", "verdura_fruto"],
  ["hueso de ternera", "casqueria"],
  ["pata de ternera", "casqueria"],
  ["carne de cocido", "carne_roja"],
  ["salsa de soja", "salsa"],
];

// ── Capa 4 ──────────────────────────────────────────────────────────────────
// Raíces de palabra, de MÁS específico a MÁS general. La primera que casa
// gana, así que el orden es la regla de desempate y hay que leerlo como tal:
// `fruto_seco` va antes que `grasa` para que "Aceite de sésamo" no se lleve
// las almendras, y los pescados van antes que `grasa` por "Anchoas en aceite".
/**
 * ── EL ROL: para qué se usa ──────────────────────────────────────────────
 *
 * Plano distinto al de la familia, y por eso tabla distinta. La versión
 * anterior metía estos valores dentro de `familia` y necesitaba un principio
 * de desempate ("la preparación gana al ingrediente que la nombra") para que
 * un caldo de pollo no saliera como pollo. Con dos campos ese principio sobra:
 * el caldo de pollo es `carne_ave` de familia y `caldo` de rol, las dos cosas
 * a la vez, que es lo que siempre fue.
 *
 * Ausencia de match = `basico`: se come tal cual. Es el caso normal.
 */
/**
 * Roles que se deciden por cómo EMPIEZA el nombre, y se miran antes que las
 * palabras sueltas.
 *
 * Existe por el aceite, otra vez. "Aceite de oliva" es grasa; "Anchoas en
 * aceite" y "Tomate seco en aceite" no lo son — ahí el aceite es el medio de
 * conserva, no el producto. La diferencia está en la posición: lo que es una
 * grasa se llama así desde la primera palabra. Es la cuarta vez que esta
 * palabra engaña a este repositorio y la primera que se le pone una regla que
 * distingue en vez de una lista de excepciones.
 */
export const PREFIJOS_ROL = [
  ["aceite", "grasa"],
  ["manteca", "grasa"],
  ["margarina", "grasa"],
  ["ghee", "grasa"],
  ["tomate frito", "salsa"],
  ["tomate triturado", "salsa"],
  ["tomate concentrado", "salsa"],
  ["tomate seco", "encurtido"],
  // Antes de que "jerez" lo mande a `bebida`: un vinagre de Jerez no se bebe.
  ["vinagre", "condimento"],
];

/**
 * Último recurso antes de `basico`: el pasillo. Si algo está en Especias, su
 * papel es sazonar aunque su nombre no lleve ninguna palabra de condimento —
 * "Guindilla", "Hinojo", "Ají amarillo". Va después del léxico para que una
 * palabra explícita siempre gane (la Sriracha está ahí y es salsa).
 */
export const ROL_POR_PASILLO = { "Especias": "condimento" };

export const LEXICO_ROL = [
  ["caldo", ["caldo", "fondo", "fumet"]],
  ["salsa", ["salsa", "mayonesa", "alioli", "ketchup", "pesto", "sofrito", "worcestershire", "tabasco", "sriracha", "gochujang", "harissa", "miso", "bechamel", "gazpacho", "barbacoa", "tinta"]],
  ["encurtido", ["aceituna", "alcaparra", "pepinillo", "encurtido", "piquillo"]],
  ["endulzante", ["azucar", "miel", "sirope", "panela", "melaza", "stevia", "edulcorante", "mermelada", "chocolate", "cacao"]],
  ["bebida", ["vino", "cerveza", "agua", "zumo", "brandy", "coñac", "jerez", "ron", "sidra", "cava", "vermut", "licor", "refresco", "infusion", "cafe", "vodka", "whisky", "cointreau", "ximenez", "mirin"]],
  ["condimento", ["sal", "pimienta", "pimenton", "comino", "oregano", "laurel", "canela", "azafran", "curry", "jengibre", "moscada", "clavo", "cardamomo", "albahaca", "perejil", "cilantro", "tomillo", "romero", "eneldo", "menta", "hierbabuena", "especia", "vainilla", "cayena", "curcuma", "cajun", "hierba", "cebollino", "salvia", "bicarbonato", "colorante", "extracto", "vinagre", "mostaza", "levadura", "gelatina", "tahini"]],
];

/**
 * ── LA FAMILIA: qué es ───────────────────────────────────────────────────
 *
 * Solo identidad. Ya no lleva valores de uso, así que el orden deja de ser un
 * desempate entre planos y pasa a ser lo que debía: de lo más específico a lo
 * más general dentro de la misma pregunta.
 */
export const LEXICO = [
  // — casquería y despojos, antes que la carne que los nombra —
  ["casqueria", ["callo", "higado", "molleja", "riñon", "seso", "morro", "manita", "oreja", "unto", "tuetano"]],
  // — embutido y curados, antes que la especie —
  ["embutido", ["chorizo", "butifarra", "fuet", "salchichon", "morcilla", "sobrasada", "salami", "mortadela", "cecina", "longaniza", "fiambre", "pastrami", "foie", "pate", "jamon", "lacon", "bacon", "panceta", "guanciale", "tocino", "salchicha", "chistorra"]],
  // — carnes por especie —
  ["carne_caza", ["jabali", "venado", "corzo", "conejo", "perdiz", "liebre", "pichon"]],
  ["carne_ave", ["pollo", "pavo", "pato", "codorniz", "magret", "pechuga", "contramuslo", "alita", "muslo"]],
  ["carne_cerdo", ["cerdo", "cochinillo", "secreto", "presa", "pluma", "magro", "iberico"]],
  ["carne_roja", ["ternera", "buey", "vaca", "toro", "cordero", "cabrito", "chuleton", "entrecot", "entraña", "escalopin", "carrillada", "carrillera", "jarrete", "morcillo", "redondo", "solomillo", "mechar"]],
  // — pescado y marisco, ANTES que grasa: "Anchoas en aceite" —
  ["cefalopodo", ["calamar", "sepia", "chipiron", "pulpo", "puntilla", "choco"]],
  ["marisco", ["gamba", "langostino", "cigala", "bogavante", "carabinero", "necora", "cangrejo", "percebe", "quisquilla", "almeja", "mejillon", "berberecho", "navaja", "vieira", "zamburiña", "ostra", "coquina", "txangurro", "surimi", "centollo"]],
  ["pescado_azul", ["atun", "bonito", "salmon", "sardina", "boqueron", "caballa", "anchoa", "jurel", "melva", "emperador", "arenque", "trucha", "ventresca"]],
  ["pescado_blanco", ["merluza", "bacalao", "lubina", "dorada", "rodaballo", "rape", "lenguado", "gallo", "corvina", "cabracho", "congrio", "mero", "panga", "abadejo", "pescadilla", "raya", "besugo", "salmonete"]],
  // — huevo y lácteos —
  ["huevo", ["huevo", "clara", "yema"]],
  ["queso", ["queso", "quesito", "mozzarella", "parmesano", "burrata", "feta", "ricotta", "mascarpone", "manchego", "cheddar", "gruyer", "gorgonzola", "roquefort", "brie", "emmental", "cabrale", "requeson"]],
  ["lacteo_fermentado", ["yogur", "kefir", "cuajada", "skyr"]],
  ["nata_mantequilla", ["nata", "mantequilla"]],
  ["leche", ["leche"]],
  // — frutos secos ANTES que grasa y que fruta: "Aceite de sésamo", "Coco rallado" —
  // "nuece" está porque "Nueces" no singulariza a "nuez" con ninguna regla
  // razonable: es el caso que justifica que las claves se escriban tal y como
  // aparecen y no se intente derivarlas.
  ["fruto_seco", ["almendra", "nuez", "nuece", "avellana", "pistacho", "anacardo", "cacahuete", "piñon", "pipa", "semilla", "sesamo", "tahini", "chia", "lino", "castaña", "coco"]],
  // — vegetales —
  ["seta", ["champiñon", "seta", "boletu", "portobello", "niscalo", "shiitake", "trufa"]],
  ["alga", ["alga", "nori", "wakame", "kombu"]],
  ["tuberculo", ["patata", "boniato", "batata", "yuca", "chirivia"]],
  ["verdura_raiz", ["zanahoria", "remolacha", "nabo", "rabano", "apionabo"]],
  ["verdura_bulbo", ["cebolla", "cebolleta", "ajo", "ajete", "puerro", "chalota", "escalonia"]],
  ["verdura_col", ["brocoli", "coliflor", "col", "repollo", "lombarda", "kale", "romanesco", "grelo", "brusela"]],
  ["verdura_hoja", ["espinaca", "acelga", "lechuga", "rucula", "canonigo", "escarola", "endivia", "berro", "brote", "hoja"]],
  ["verdura_fruto", ["tomate", "pimiento", "berenjena", "calabacin", "calabaza", "pepino", "pepinillo", "aguacate", "okra", "alcachofa", "esparrago", "guisante", "haba", "edamame", "apio", "maiz", "judia"]],
  // — legumbres —
  ["legumbre", ["garbanzo", "lenteja", "alubia", "frijol", "fabe", "soja", "tofu", "tempeh", "falafel", "garrofon", "altramuz", "miso", "gochujang"]],
  // — fruta —
  ["fruta", ["manzana", "pera", "platano", "naranja", "mandarina", "limon", "lima", "fresa", "arandano", "frambuesa", "mora", "uva", "melon", "sandia", "piña", "mango", "kiwi", "melocoton", "albaricoque", "ciruela", "cereza", "higo", "granada", "datil", "pasa", "papaya", "maracuya", "pomelo", "acai", "pulpa"]],
  // — féculas —
  ["arroz", ["arroz"]],
  ["pasta", ["pasta", "espagueti", "macarron", "fideo", "tallarin", "penne", "fusilli", "farfalle", "linguine", "orecchiette", "lasaña", "canelon", "cannelone", "raviol", "tortellini", "ñoqui", "orzo", "rigatoni", "tagliatelle", "fettuccine", "trofie", "placa", "lamina"]],
  ["pan", ["pan", "chapata", "hogaza", "baguette", "muffin", "pita", "naan", "picos", "biscote", "hojaldre", "oblea", "tortilla", "nacho", "masa", "bizcocho", "galleta"]],
  ["cereal", ["harina", "avena", "quinoa", "trigo", "centeno", "cebada", "espelta", "copo", "cereal", "granola", "bulgur", "semola", "polenta", "levadura", "maicena", "cuscu", "gelatina", "soletilla"]],
  // — la especia SÍ es identidad: es una clase de alimento (parte aromática
  //   seca de una planta), no solo un uso. Por eso se queda aquí y no en el
  //   rol, aunque su rol sea casi siempre `condimento`.
  ["especia", ["pimienta", "pimenton", "comino", "oregano", "laurel", "canela", "azafran", "curry", "jengibre", "moscada", "clavo", "cardamomo", "albahaca", "perejil", "cilantro", "tomillo", "romero", "eneldo", "menta", "hierbabuena", "especia", "vainilla", "cayena", "curcuma", "cajun", "hierba", "cebollino", "salvia", "extracto", "aji", "chile", "guindilla", "choricero", "hinojo", "mostaza", "sriracha", "tabasco"]],
  // La sal no es una planta ni un animal, y el agua tampoco. Fingir que son
  // "especia" era cómodo y falso; `mineral` lo dice como es.
  ["mineral", ["sal", "agua", "bicarbonato", "colorante", "hielo"]],
  // — grasa AL FINAL: es la palabra que más falsos positivos produce —
  // Lo que queda sin identidad propia porque está hecho de varias cosas: una
  // mayonesa es huevo y aceite, una salsa barbacoa es media despensa. Va el
  // último porque solo debe recogerlo lo que de verdad no encaja en nada.
  ["endulzante", ["azucar", "miel", "sirope", "panela", "melaza", "stevia", "edulcorante", "mermelada", "chocolate", "cacao"]],
  // El alcohol y el café van aquí y no a su materia prima a propósito: un vino
  // ya no es uva ni nutricional ni culinariamente, y llamarlo `fruta` sería
  // tan falso como llamarlo `bebida` en el campo de identidad. Fermentar y
  // destilar producen otra cosa.
  ["compuesto", ["mayonesa", "alioli", "bechamel", "ketchup", "barbacoa", "worcestershire", "harissa", "gazpacho", "sofrito", "caldo", "granola", "cereal", "vino", "cava", "cerveza", "brandy", "jerez", "ximenez", "ron", "sidra", "vermut", "licor", "vodka", "whisky", "cointreau", "cafe", "mirin", "gelatina", "levadura", "vinagre", "cesar"]],
];

const FRASES_NORM = FRASES.map(([frase, familia]) => [norm(frase), familia]);

/** Texto donde buscar frases: el nombre y el id, que ya viene singularizado. */
const buscable = (ing) => `${norm(ing.name)} ${norm(ing.id).replace(/-/g, " ")}`;

/**
 * El rol: para qué se usa. Sin match, `basico` — se come tal cual, que es el
 * caso normal y no un hueco.
 *
 * @returns {{rol:string, via:"juicio"|"palabra"|"defecto"}}
 */
export function deriveRol(ing, juicios = {}) {
  const juicio = juicios[ing.id];
  if (juicio?.rol) return { rol: juicio.rol, via: "juicio" };

  const n = norm(ing.name);
  for (const [prefijo, rol] of PREFIJOS_ROL) {
    if (n.startsWith(prefijo)) return { rol, via: "prefijo" };
  }

  const ws = stems(ing.name);
  for (const [rol, claves] of LEXICO_ROL) {
    if (claves.some((c) => ws.has(norm(c)))) return { rol, via: "palabra" };
  }
  const porPasillo = ROL_POR_PASILLO[ing.aisle];
  if (porPasillo) return { rol: porPasillo, via: "pasillo" };

  return { rol: "basico", via: "defecto" };
}

/**
 * La familia: qué es.
 *
 * @param {{id:string,name:string,aisle:string}} ing
 * @param {Record<string,{familia?:string,rol?:string,motivo?:string}>} juicios
 * @returns {{familia:string|null, via:"juicio"|"pasillo"|"frase"|"palabra"|null}}
 */
export function deriveFamilia(ing, juicios = {}) {
  const juicio = juicios[ing.id];
  if (juicio?.familia) return { familia: juicio.familia, via: "juicio" };

  const porPasillo = FAMILIA_POR_PASILLO[ing.aisle];
  if (porPasillo) return { familia: porPasillo, via: "pasillo" };

  const n = buscable(ing);
  for (const [frase, familia] of FRASES_NORM) {
    if (n.includes(frase)) return { familia, via: "frase" };
  }

  const ws = stems(ing.name);
  for (const [familia, claves] of LEXICO) {
    if (claves.some((c) => ws.has(norm(c)))) return { familia, via: "palabra" };
  }

  return { familia: null, via: null };
}
