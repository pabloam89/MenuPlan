/**
 * Las preguntas del examen de búsqueda por significado, como las dice una
 * familia. Cada una lleva una regla sacada de los rasgos del catálogo: una
 * receta «encaja» si la cumple. Las usan scripts/vectores-examen.mjs (qué
 * modelo) y scripts/vectores-contra-haiku.mjs (vectores frente a Haiku).
 */

export const sin = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const lleva = (r, re) => (r.ingredients ?? []).some((i) => re.test(sin(i?.name)));
const rol = (r, x) => (r.mealRole ?? []).includes(x);

export const EXAMEN = [
  ["algo de cuchara para el frío", (r) => r.textura === "cuchara" && r.temperatura === "caliente"],
  ["un guiso de los de toda la vida", (r) => r.tecnica === "olla" && r.connotacion?.includes("casero")],
  ["una cena que parezca de restaurante", (r) => r.connotacion?.includes("festivo") || r.occasion === "especial"],
  ["algo para impresionar a los suegros", (r) => r.connotacion?.includes("festivo") || r.occasion === "especial"],
  ["algo fresquito para el verano", (r) => r.temperatura === "frio" || r.connotacion?.includes("fresco")],
  ["algo de picar para ver el fútbol", (r) => r.textura === "mano"],
  ["algo que pique un poco", (r) => r.picante && r.picante !== "no"],
  ["que sea barato, que estamos a fin de mes", (r) => r.costeNivel === "economico"],
  ["algo ligerito que me pasé el finde", (r) => r.caloriasNivel === "ligero"],
  ["algo contundente que vengo de entrenar", (r) => r.caloriasNivel === "contundente"],
  ["pescado al horno", (r) => r.category === "pescados" && r.tecnica === "horno"],
  ["algo con pollo", (r) => lleva(r, /\bpollo\b/)],
  ["una pasta rapidita", (r) => r.mainBase === "pasta" && r.time <= 25],
  ["papilla para el bebé", (r) => r.category === "bebes"],
  ["qué desayunamos", (r) => r.category === "desayunos" || rol(r, "desayuno")],
  ["un postre de chocolate", (r) => r.category === "postres" && lleva(r, /\bchocolate|\bcacao/)],
  ["para llevar en el táper al trabajo", (r) => r.tupperFriendly],
  ["algo que se coman los niños sin protestar", (r) => r.kidFriendly],
  ["para hacer de más y congelar", (r) => r.freezable],
  ["algo con hierro que la niña anda baja", (r) => r.healthFlags?.includes("rico_hierro")],
  ["algo ahumado", (r) => r.sabor?.includes("ahumado")],
  ["unas legumbres", (r) => r.category === "legumbres" || r.mainBase === "legumbre"],
  ["un arrocito", (r) => r.mainBase === "arroz"],
  ["huevos para cenar en un momento", (r) => r.category === "huevos" && r.time <= 20],
  ["una ensalada que llene", (r) => r.category === "ensaladas_verduras" && rol(r, "plato_unico")],
  ["una crema de verduras", (r) => r.category === "sopas_cremas"],
  ["algo dulce para merendar", (r) => r.sabor?.includes("dulce") && (r.category === "postres" || r.category === "desayunos" || r.category === "meriendas")],
  ["algo a la plancha sin complicarse", (r) => r.tecnica === "plancha" && r.difficulty === "facil"],
  ["algo exótico con especias", (r) => r.sabor?.includes("especiado")],
  ["cena ligera y rápida", (r) => r.caloriasNivel === "ligero" && r.time <= 25],
  ["carne roja", (r) => lleva(r, /\b(ternera|vacuno|buey|cordero|solomillo|entrecot)\b/)],
  ["pescado azul", (r) => lleva(r, /\b(sardinas?|salmon|caballa|atun|boquerones?|bonito|jurel)\b/)],
  ["verduras al horno", (r) => r.category === "ensaladas_verduras" && r.tecnica === "horno"],
  ["algo con garbanzos", (r) => lleva(r, /\bgarbanzos?\b/)],
  ["comida de domingo en familia", (r) => r.connotacion?.includes("festivo") || (r.connotacion?.includes("casero") && rol(r, "plato_unico"))],
  ["una tortilla", (r) => /\btortilla\b/.test(sin(r.name))],
  ["lo que comía de pequeño en casa de mi abuela", (r) => r.connotacion?.includes("casero")],
  ["algo reconfortante que estoy pachucho", (r) => r.connotacion?.includes("reconfortante")],
];

// Negaciones: el vector no entiende el «no»; se mide cuánto falla.
export const NEGACIONES = [
  ["que no sea pescado", (r) => r.category !== "pescados" && !lleva(r, /\b(merluza|bacalao|salmon|atun|gambas?|langostinos?|sardinas?|calamar(es)?)\b/)],
  ["sin encender el horno", (r) => r.tecnica !== "horno"],
  ["algo sin carne", (r) => r.category !== "carnes" && !lleva(r, /\b(pollo|ternera|cerdo|jamon|chorizo|pavo|cordero|carne)\b/)],
];
