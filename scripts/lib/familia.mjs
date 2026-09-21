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
  ["leche de coco", "bebida"],
  // Un aceite de fruto seco es grasa, no fruto seco. Va como frase y no como
  // palabra porque "aceite" suelto es justo la palabra que no se puede tocar.
  ["aceite de sesamo", "grasa"],
  ["aceite de girasol", "grasa"],
  ["aceite de oliva", "grasa"],
  // Un nacho y una tortilla de maíz son pan, no maíz.
  ["nacho", "pan"],
  ["tortilla de maiz", "pan"],
  ["mantequilla de cacahuete", "fruto_seco"],
  ["manteca de cerdo", "grasa"],
  ["tinta de calamar", "salsa"],
  ["tortilla de maiz", "pan"],
  ["carne de txangurro", "marisco"],
  ["carne de zamburina", "marisco"],
  ["palito de cangrejo", "marisco"],
  ["pan rallado", "cereal"],
  ["semola de trigo", "cereal"],
  ["tomate seco", "encurtido"],
  ["tomate frito", "salsa"],
  ["tomate triturado", "salsa"],
  ["tomate concentrado", "salsa"],
  ["espárrago blanco", "encurtido"],
  ["esparrago blanco", "encurtido"],
  ["pimiento del piquillo", "encurtido"],
  ["cafe espresso", "bebida"],
  ["licor de cafe", "bebida"],
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
export const LEXICO = [
  // ── PREPARACIONES PRIMERO ────────────────────────────────────────────────
  // La preparación gana al ingrediente que la nombra: un caldo de pollo es
  // caldo, no pollo, y un vinagre de manzana es vinagre, no fruta. Sin esta
  // regla salían siete falsos — y no como excepciones sueltas, sino todos por
  // el mismo motivo, que es la señal de que faltaba el principio y no los
  // parches.
  //
  // `grasa` es la excepción y va al final del fichero: su palabra —"aceite"—
  // no nombra solo al producto, también al medio de conserva de otro
  // ("Anchoas en aceite"). Es la misma trampa que ya se coló tres veces en
  // esta auditoría.
  ["caldo", ["caldo", "fondo", "fumet"]],
  ["salsa", ["salsa", "mayonesa", "alioli", "ketchup", "mostaza", "pesto", "sofrito", "vinagre", "worcestershire", "tabasco", "sriracha", "gochujang", "harissa", "miso", "bechamel", "gazpacho", "mirin", "barbacoa"]],
  ["encurtido", ["aceituna", "alcaparra", "pepinillo", "encurtido", "piquillo"]],
  ["endulzante", ["azucar", "miel", "sirope", "panela", "melaza", "stevia", "edulcorante", "mermelada", "chocolate", "cacao"]],
  ["bebida", ["vino", "cerveza", "agua", "zumo", "brandy", "coñac", "jerez", "ron", "sidra", "cava", "vermut", "licor", "refresco", "infusion", "cafe", "vodka", "whisky", "cointreau", "ximenez"]],

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
  ["verdura_fruto", ["tomate", "pimiento", "berenjena", "calabacin", "calabaza", "pepino", "aguacate", "okra", "alcachofa", "esparrago", "guisante", "haba", "edamame", "apio", "maiz", "judia"]],
  // — legumbres —
  ["legumbre", ["garbanzo", "lenteja", "alubia", "frijol", "fabe", "soja", "tofu", "tempeh", "falafel", "garrofon", "altramuz"]],
  // — fruta —
  ["fruta", ["manzana", "pera", "platano", "naranja", "mandarina", "limon", "lima", "fresa", "arandano", "frambuesa", "mora", "uva", "melon", "sandia", "piña", "mango", "kiwi", "melocoton", "albaricoque", "ciruela", "cereza", "higo", "granada", "datil", "pasa", "papaya", "maracuya", "pomelo", "acai", "pulpa"]],
  // — féculas —
  ["arroz", ["arroz"]],
  ["pasta", ["pasta", "espagueti", "macarron", "fideo", "tallarin", "penne", "fusilli", "farfalle", "linguine", "orecchiette", "lasaña", "canelon", "cannelone", "raviol", "tortellini", "ñoqui", "orzo", "rigatoni", "tagliatelle", "fettuccine", "trofie", "placa", "lamina"]],
  ["pan", ["pan", "chapata", "hogaza", "baguette", "muffin", "pita", "naan", "picos", "biscote", "hojaldre", "oblea", "tortilla", "nacho", "masa", "bizcocho", "galleta"]],
  ["cereal", ["harina", "avena", "quinoa", "trigo", "centeno", "cebada", "espelta", "copo", "cereal", "granola", "bulgur", "semola", "polenta", "levadura", "maicena", "cuscu", "gelatina", "soletilla"]],
  // — despensa (las preparaciones ya se resolvieron arriba) —
  ["especia", ["sal", "pimienta", "pimenton", "comino", "oregano", "laurel", "canela", "azafran", "curry", "jengibre", "moscada", "clavo", "cardamomo", "albahaca", "perejil", "cilantro", "tomillo", "romero", "eneldo", "menta", "hierbabuena", "especia", "vainilla", "cayena", "curcuma", "cajun", "hierba", "cebollino", "salvia", "bicarbonato", "colorante", "extracto", "aji", "chile", "guindilla", "choricero", "hinojo"]],
  // — grasa AL FINAL: es la palabra que más falsos positivos produce —
  ["grasa", ["aceite", "ghee", "margarina", "oliva", "girasol"]],
];

const FRASES_NORM = FRASES.map(([frase, familia]) => [norm(frase), familia]);

/**
 * @param {{id:string,name:string,aisle:string}} ing
 * @param {Record<string,{familia:string,motivo?:string}>} juicios
 * @returns {{familia:string|null, via:"juicio"|"pasillo"|"frase"|"palabra"|null}}
 */
export function deriveFamilia(ing, juicios = {}) {
  const juicio = juicios[ing.id];
  if (juicio?.familia) return { familia: juicio.familia, via: "juicio" };

  const porPasillo = FAMILIA_POR_PASILLO[ing.aisle];
  if (porPasillo) return { familia: porPasillo, via: "pasillo" };

  // Se busca la frase en el nombre Y en el id escrito con espacios. El id ya
  // viene singularizado por el catálogo ("Tortillas de maíz" → tortilla-de-
  // maiz), así que buscarlo ahí ahorra tener que listar cada plural a mano.
  const n = `${norm(ing.name)} ${norm(ing.id).replace(/-/g, " ")}`;
  for (const [frase, familia] of FRASES_NORM) {
    if (n.includes(frase)) return { familia, via: "frase" };
  }

  const ws = stems(ing.name);
  for (const [familia, claves] of LEXICO) {
    if (claves.some((c) => ws.has(norm(c)))) return { familia, via: "palabra" };
  }

  return { familia: null, via: null };
}
