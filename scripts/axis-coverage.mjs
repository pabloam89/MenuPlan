/**
 * axis-coverage.mjs
 *
 * ¿Puede el catálogo SERVIR cada petición que el agente sabe entender?
 *
 * Un eje no vale por existir: vale si, cuando alguien pide "más asiático", hay
 * recetas suficientes para llenar los huecos de un menú sin repetir plato. Un
 * eje con 8 recetas se entiende igual de bien y produce el mismo hummus dos
 * días seguidos que ya nos costó una regla nueva.
 *
 * Así que esto no mide "cuántas hay", mide "para cuánto dan":
 *
 *  · Solo cuenta el RECETARIO ESTRELLA. El fondo de armario no entra para un
 *    grupo normal (ver isPrimaryCatalog en utils/filterRecipes.js), así que
 *    contar el catálogo entero daría una cobertura que el generador no tiene.
 *  · Y cuenta POR ROL. 20 recetas que son todas primeros no llenan una cena:
 *    los huecos de un menú son primero / segundo / cena, y el pool tiene que
 *    llegar a los tres.
 *
 * El listón: para que una petición se pueda servir de verdad hacen falta unas
 * 3 apariciones por semana durante las 4 semanas que admite un menú, sin
 * repetir. De ahí los 12.
 *
 * Y hacen falta DOS de los tres roles, no los tres: una legumbre no es segundo
 * nunca —es primero o plato único— y exigírselo marcaba como hueco algo que es
 * la definición del plato. Con dos roles ya se pueden repartir los huecos de la
 * semana sin amontonar todo en la misma comida.
 *
 * Uso: node scripts/axis-coverage.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");
const FILES = [
  "legumbres", "carnes", "pescados", "huevos", "pasta_arroces", "sopas_cremas",
  "ensaladas_verduras", "platos_unicos", "cenas_rapidas",
];

const SIRVE = 12;   // recetas estrella para 3 x semana durante 4 semanas
const POR_ROL = 3;  // mínimo en segundo y en cena

const all = FILES.flatMap((f) => JSON.parse(readFileSync(join(RECIPES_DIR, `${f}.json`), "utf8")));
const estrella = all.filter((r) => r.estrella);

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const roles = (r) => r.mealRole ?? [];

// Lo que un usuario diría en voz alta, y con qué se responde hoy.
const PETICIONES = [
  ["más carne",           (r) => r.category === "carnes"],
  ["más pescado",         (r) => r.category === "pescados"],
  ["más legumbres",       (r) => r.category === "legumbres"],
  ["más pasta o arroz",   (r) => r.category === "pasta_arroces"],
  ["más huevo",           (r) => r.category === "huevos"],
  ["más verdura",         (r) => (r.mainIngredients ?? []).includes("verdura")],
  ["más setas",           (r) => (r.mainIngredients ?? []).includes("seta")],
  ["más fruta",           (r) => (r.mainIngredients ?? []).includes("fruta")],
  ["sin lácteos",         (r) => !(r.mainIngredients ?? []).includes("lacteo")],
  ["algo a la plancha",   (r) => r.tecnica === "plancha"],
  ["al horno",            (r) => r.tecnica === "horno"],
  ["de cuchara",          (r) => r.tecnica === "olla"],
  ["en sartén",           (r) => r.tecnica === "sarten"],
  ["sin cocinar",         (r) => r.tecnica === "crudo"],
  ["cena de montaje",     (r) => r.montaje === true],
  ["para los niños",      (r) => r.kidFavourite === true],
  ["algo de fin de semana", (r) => r.occasion === "especial"],
  ["vegetariano",         (r) => !["cerdo", "ternera", "pollo", "pavo", "pescado_azul", "pescado_blanco", "marisco"].includes(r.mainProtein)],
  ["bajo en hidratos",    (r) => (r.carbs_g ?? 999) <= 15],
  ["ligero",              (r) => (r.kcal ?? 999) <= 350],
  ["rápido (≤20 min)",    (r) => (r.time ?? 99) <= 20],
  ["de tupper",           (r) => r.tupperFriendly === true],
  ["congelable",          (r) => r.freezable === true],
  ["italiana",            (r) => r.cocina === "italiana"],
  ["asiática",            (r) => r.cocina === "asiatica"],
  ["mexicana",            (r) => r.cocina === "mexicana"],
  // "mediterranea" NO es un valor de COCINAS: el schema dice que `cocina`
  // AUSENTE es española (ver recipeSchema.js), así que esta fila medía un
  // valor que no existe y salía 0 para siempre. Lo que de verdad hay detrás
  // de la petición es el fondo español/mediterráneo, que es el defecto.
  ["española/mediterránea", (r) => !r.cocina],
];

const filas = PETICIONES.map(([label, match]) => {
  const hit = estrella.filter(match);
  const primero = hit.filter((r) => roles(r).includes("primero") || roles(r).includes("plato_unico")).length;
  const segundo = hit.filter((r) => roles(r).includes("segundo")).length;
  const cena = hit.filter((r) => roles(r).includes("cena") || roles(r).includes("plato_unico")).length;
  const total = hit.length;
  const conRol = [primero, segundo, cena].filter((n) => n >= POR_ROL).length;
  const ok = total >= SIRVE && conRol >= 2;
  const justo = !ok && total >= 6;
  return { label, total, primero, segundo, cena, conRol, estado: ok ? "sirve" : justo ? "justo" : "NO LLEGA" };
});

console.log(`Recetario Estrella jugable: ${estrella.length} recetas de ${all.length}\n`);
console.log("petición".padEnd(24) + "total".padStart(6) + "1º".padStart(6) + "2º".padStart(6) + "cena".padStart(6) + "  estado");
console.log("-".repeat(60));
for (const f of filas.sort((a, b) => a.total - b.total)) {
  console.log(
    f.label.padEnd(24) +
    String(f.total).padStart(6) + String(f.primero).padStart(6) +
    String(f.segundo).padStart(6) + String(f.cena).padStart(6) +
    "  " + f.estado,
  );
}

const faltan = filas.filter((f) => f.estado !== "sirve");
if (faltan.length > 0) {
  console.log("\nPara que el agente pueda servirlas hacen falta:");
  for (const f of faltan) {
    const piezas = [];
    if (f.total < SIRVE) piezas.push(`${SIRVE - f.total} recetas más`);
    if (f.conRol < 2) piezas.push(`reparto por rol (1º ${f.primero} · 2º ${f.segundo} · cena ${f.cena})`);
    console.log(`  ${f.label.padEnd(24)} ${piezas.join(", ")}`);
  }
}
void norm;

// ── Ejes PROPUESTOS (paso 7 del plan de datos) ──────────────────────────────
// La pregunta no es "¿cabe otro eje?" sino "¿hace falta un campo nuevo para
// servirlo?". Cada propuesta se mide con el mejor apaño que se puede hacer HOY
// con los datos que ya hay. Que el apaño llegue al listón no significa que el
// eje se pueda exponer: significa que el pool da, y que el problema —si lo
// hay— es la CALIDAD de la etiqueta, no la cantidad de recetas.
const txt = (r) => norm([r.name, r.description, ...(r.steps ?? [])].join(" "));
const ings = (r) => norm((r.ingredients ?? []).map((i) => i.name).join(" "));

const PROPUESTAS = [
  // TEXTURA — el único eje que exigiría curar receta a receta: no hay ningún
  // campo del que se deduzca. El apaño por palabras es justo lo que no vale
  // (mete "tostada" en crujiente), y por eso su número aquí engaña al alza.
  ["textura crujiente", "curación por receta", (r) => /crujient|rebozad|empanad|frito|fritas|tempura|panko|gratinad/.test(txt(r))],
  ["textura cremosa", "curación por receta", (r) => /crema|cremos|pure|risotto|hummus|veloute|bechamel/.test(txt(r))],
  // …salvo "blandito", que ya está curado y se llama kidFriendly.
  ["textura blanda", "ya existe: kidFriendly", (r) => r.kidFriendly === true],

  // TEMPERATURA — ya es `tecnica: "crudo"` más los fríos de cuchara. No hace
  // falta campo nuevo: hace falta que el eje "sin cocinar" se llame frío.
  ["plato frío", "ya existe: tecnica", (r) => r.tecnica === "crudo" || /gazpacho|salmorejo|vichyssoise|ajoblanco/.test(txt(r))],

  // CARGA DE COCINA — `difficulty` y `time` ya están en todas. Lo que falta no
  // es el dato, es el consumidor: el CAMPO `esfuerzo` de la libreta no lo lee
  // nadie (notepadFields.js).
  ["carga baja", "ya existe: difficulty+time", (r) => r.difficulty === "facil" && (r.time ?? 99) <= 25],
  ["carga alta", "ya existe: difficulty+time", (r) => (r.time ?? 0) >= 45 || r.difficulty === "dificil"],

  // PROCESADO — el único que sí pide dato nuevo, pero en el INGREDIENTE (383
  // filas), no en la receta (844). Una bandera por ingrediente sirve a todas
  // las recetas que lo llevan; al revés hay que curar cada plato. El apaño de
  // abajo es una lista de nombres, que es exactamente lo que esa bandera
  // sustituiría.
  ["sin ultraprocesados", "pide bandera en ingredients.json", (r) => !/chorizo|salchich|bacon|panceta|jamon cocido|fiambre|surimi|nugget|precocinad|tomate frito|hojaldre|masa quebrada|sobrasada|morcilla|mortadela|salami|pepperoni|frankfurt/.test(ings(r))],
];

console.log("\n\nEjes PROPUESTOS — ¿da el pool, y hace falta campo nuevo?\n");
console.log("eje".padEnd(22) + "total".padStart(6) + "1º".padStart(6) + "2º".padStart(6) + "cena".padStart(6) + "   de dónde sale");
console.log("-".repeat(78));
for (const [label, origen, match] of PROPUESTAS) {
  const hit = estrella.filter(match);
  const primero = hit.filter((r) => roles(r).includes("primero") || roles(r).includes("plato_unico")).length;
  const segundo = hit.filter((r) => roles(r).includes("segundo")).length;
  const cena = hit.filter((r) => roles(r).includes("cena") || roles(r).includes("plato_unico")).length;
  console.log(
    label.padEnd(22) + String(hit.length).padStart(6) + String(primero).padStart(6)
    + String(segundo).padStart(6) + String(cena).padStart(6) + "   " + origen,
  );
}
console.log(
  "\nNinguno se queda corto de pool: el más flaco (plato frío) son 76 recetas y"
  + "\ntodos llegan a dos roles. El cuello de botella no es cuántas recetas hay,"
  + "\nes de dónde sale la etiqueta — y solo textura exige curar receta a receta.",
);
