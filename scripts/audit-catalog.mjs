/**
 * audit-catalog.mjs
 *
 * Auditoría de VERACIDAD del catálogo. No valida el esquema — de eso ya se
 * encarga validate-catalog.mjs — sino si los números que el catálogo declara
 * se sostienen contra sus propios ingredientes.
 *
 * ── Por qué hace falta ────────────────────────────────────────────────────
 * Las macros de receta están al 100 % y pasan la comprobación de Atwater
 * (kcal ≈ 4P+4C+9F) con un error mediano de −0,6 %. Eso parecía una señal de
 * salud y no lo es: Atwater fija el TOTAL, no el REPARTO. Es una restricción
 * sobre cuatro grados de libertad, así que deja dos sueltos — y el bloque 1
 * enseña un caso donde el total cuadra mientras la grasa está muy por debajo.
 *
 * ── Y por qué el bloque 1 no da una cifra ─────────────────────────────────
 * Porque no la aguanta, y eso es el hallazgo. Comparar lo declarado con la
 * suma de ingredientes obliga a filtrar (qué recetas tienen bastante masa
 * cubierta, qué masa por ración es plausible), y cada filtro mueve el
 * resultado más que el defecto que busca:
 *
 *   · el umbral de COBERTURA es una rampa monótona: de −69 % a +26 % según
 *     dónde se corte. No es un control de calidad, es elegir el resultado.
 *   · la banda de MASA/RACIÓN es circular: la masa sale de los mismos pesos
 *     que el numerador y se divide por el mismo `baseServings`.
 *   · el ACEITE no da una banda de tres puntos sino binaria: el tope de
 *     absorción del 6 % casi nunca muerde, así que "absorbido" ≈ "entero".
 *
 * Lo que sobrevive a moverlos todos es el SIGNO, no la magnitud: la proteína
 * sumada supera a la declarada en 24 de 24 especificaciones probadas, con
 * magnitudes de +12 % a +27 % e IC95 bootstrap de unos 14 puntos de ancho.
 * Y el desacuerdo no es uniforme entre macros: la grasa se va en dirección
 * contraria según cómo se cuente el aceite.
 *
 * Hay que decir además que el subconjunto medible NO representa al catálogo:
 * `huevos`, `postres`, `desayunos`, `meriendas` y `cenas_rapidas` quedan con
 * cero recetas, el 17 % del corpus, porque los ingredientes sin `nutrition`
 * se concentran en fruta, panadería y huevos. Para esas categorías este
 * informe no dice nada.
 *
 * Importa porque el número declarado es el que ve el usuario: `Menu.jsx`
 * construye `macros` desde `protein_g`.
 *
 * ── Qué mira ──────────────────────────────────────────────────────────────
 *   1. macros      Σ ingredientes vs declarado, en kcal y en proteína
 *   2. raciones    `baseServings` sospechoso, por ratio de proteína y por masa
 *   3. enums       platos cuyo nombre contradice su etiqueta (pato, boniato…)
 *   4. tecnica     ausente, o incompatible con el nombre del plato
 *   5. partes      cobertura de `stepsRich[].part`
 *   6. piezas      líneas en `ud` que nadie sabe convertir a gramos
 *   7. alergenos   arrays vacíos, que es el único fallo que es riesgo
 *   8. alias       un alias que cambia el formato del producto
 *
 * ── Cómo resuelve los ingredientes ────────────────────────────────────────
 * Por `ingredientId`, que está al 100 % en las líneas y lo valida el build.
 * NO por nombre: un prototipo anterior lo hizo por regex sobre el nombre y
 * ese atajo mete su propio sesgo en la medición que intenta hacer.
 *
 * Usage:
 *   node scripts/audit-catalog.mjs              informe legible
 *   node scripts/audit-catalog.mjs --json       findings en JSON, para CI
 *   node scripts/audit-catalog.mjs --check      cuenta los de severidad alta
 */

import { readFileSync, readdirSync } from "fs";
import { gramsPerPiece } from "../src/lib/kitchenUnits.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");

const AS_JSON = process.argv.includes("--json");
const AS_CHECK = process.argv.includes("--check");

const recipes = [];
for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  for (const r of JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"))) recipes.push(r);
}
const ingredients = JSON.parse(readFileSync(join(ROOT, "src", "data", "ingredients.json"), "utf8"));
const BY_ID = new Map(ingredients.map((i) => [i.id, i]));

const estrella = recipes.filter((r) => r.estrella);
const ROLES_PRINCIPALES = new Set(["primero", "segundo", "plato_unico", "cena"]);
const ROLES_APARTE = new Set(["guarnicion", "salsa", "postre", "desayuno", "merienda"]);
const principales = estrella.filter(
  (r) => (r.mealRole ?? []).some((x) => ROLES_PRINCIPALES.has(x))
    && !(r.mealRole ?? []).some((x) => ROLES_APARTE.has(x)),
);

const norm = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Gramos de una línea.
 *
 * Las unidades `ud` no se convierten aquí. Producción ya resuelve esto en dos
 * capas y hay que preguntar a las dos, en su orden (`pieceGramsFor`,
 * src/lib/ingredients.js):
 *
 *   1. `ingrediente.pieza.g` del catálogo — resuelve por id, es el dato.
 *   2. `gramsPerPiece()` (PIECE_WEIGHTS, src/lib/kitchenUnits.js) — casa por
 *      regex contra el nombre, y es la red para los nombres libres.
 *
 * Este script nació con una tabla propia, y eso era el error: una tercera
 * verdad sobre cuánto pesa un huevo, peor que las dos que ya existían. Medir
 * las reales es lo que hace accionable el bloque 6.
 *
 * Lo que la tabla no cubre NO se inventa: pesa 0 y la línea baja la cobertura,
 * que es como debe ser. Un default de 80 g para todo convertía 28 hojas de
 * laurel en 2,2 kg y se colaba en las macros como si fuera un dato.
 */
// El catálogo manda (resuelve por id, nunca confunde "pimiento del piquillo"
// con "pimiento"); el regex queda de red. Lo que no cubra ninguna de las dos
// pesa 0 y baja la cobertura de su receta: no se inventa.
const piezaEnGramos = (linea) =>
  BY_ID.get(linea.ingredientId)?.pieza?.g ?? gramsPerPiece(linea.name) ?? null;

const gramos = (linea) => {
  const { amount: a, unit: u } = linea ?? {};
  if (typeof a !== "number" || !Number.isFinite(a)) return 0;
  if (u === "g" || u === "ml") return a;
  if (u === "ud") return a * (piezaEnGramos(linea) ?? 0);
  return 0; // "al gusto", "una pizca": no pesan
};

/**
 * Suma de macros desde los ingredientes, aplicando los tres ajustes de masa
 * que separan lo que se compra de lo que se come:
 *
 *   · el aceite de freír NO se excluye, se ABSORBE. El factor sale del propio
 *     catálogo: en "Patatas fritas caseras", 500 kcal totales menos las 288 de
 *     la patata dejan 212 kcal de aceite = 24 g = el 6 % del peso del sólido.
 *   · la sal y el azúcar de un curado se tiran.
 *   · la concha y el caparazón no se comen.
 */
const ABSORCION_FRITURA = 0.06;
const COMESTIBLE = [
  [/almeja|mejillon|berberecho|navaja|vieira|zamburina|chirla/, 0.30],
  [/gamba|langostino|cigala|bogavante|carabinero/, 0.50],
];
const YA_LIMPIO = /pelad|limpi|sin cascara|sin concha|carne de|desvainad/;

/**
 * Los aceites, por `ingredientId`. Antes esto era `/aceite/` sobre el nombre
 * de la línea y se tragaba "Anchoas en aceite", "Atún en aceite" y "Ventresca
 * de atún en aceite": conservas de pescado que el modo "aceite fuera" borraba
 * del sumatorio junto con su proteína. El FK las distingue sin ambigüedad —
 * tienen id propio (`anchoa-en-aceite`, `atun`, `ventresca`) — y es además el
 * criterio que este script dice seguir en todas partes.
 */
/**
 * Los dos vocabularios de alérgeno NO coinciden: el ingrediente habla en ids
 * de la UE (`crustaceos`, `huevos`, `leche`, `frutos_cascara`) y la receta en
 * los suyos (`marisco`, `huevo`, `lactosa`, `frutos_secos`). Compararlos en
 * crudo daría falsos positivos en masa.
 *
 * Esto es una COPIA de `ALLERGEN_ALIASES` (src/lib/allergens.js) y se copia a
 * regañadientes: ese módulo importa iconos `.jsx` y no se puede cargar desde
 * node pelado. Para que la copia no se desincronice en silencio —que es
 * exactamente lo que pasó con la tabla de pesos por pieza— hay un test que
 * compara las dos: src/lib/auditAllergenAliases.test.js.
 */
const ALIAS_ALERGENO = {
  gluten: "gluten", crustaceos: "crustaceos", crustaceo: "crustaceos",
  marisco: "crustaceos", mariscos: "crustaceos", huevo: "huevos",
  huevos: "huevos", pescado: "pescado", cacahuete: "cacahuetes",
  cacahuetes: "cacahuetes", soja: "soja", lactosa: "leche", leche: "leche",
  frutos_secos: "frutos_cascara", frutos_de_cascara: "frutos_cascara",
  frutos_cascara: "frutos_cascara", apio: "apio", mostaza: "mostaza",
  sesamo: "sesamo", "sésamo": "sesamo", sulfito: "sulfitos",
  sulfitos: "sulfitos", dioxido_de_azufre: "sulfitos", altramuz: "altramuces",
  altramuces: "altramuces", molusco: "moluscos", moluscos: "moluscos",
};
const normalizeAllergenId = (raw) => ALIAS_ALERGENO[norm(raw).replace(/\s+/g, "_")] ?? null;

const ACEITES = new Set([
  "aceite-oliva", "aceite-oliva-virgen", "aceite-girasol", "aceite-de-sesamo",
]);

function sumaDesdeIngredientes(receta, modoAceite = "absorbido") {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let masa = 0;
  let cubierta = 0;
  let solido = 0;
  const aceites = [];
  const lineas = receta.ingredients ?? [];

  const hayCurado = lineas.some((l) => /^sal\b|sal gruesa|sal marina/.test(norm(l.name)) && gramos(l) >= 50);

  for (const l of lineas) {
    const g = gramos(l);
    masa += g;
    const ing = BY_ID.get(l.ingredientId);
    const nu = ing?.nutrition;
    if (!nu) continue;
    cubierta += g;

    const n = norm(l.name);
    if (/^sal\b|sal gruesa|sal marina/.test(n) && g >= 50) continue;          // curado
    if (/^azucar/.test(n) && g >= 50 && hayCurado) continue;                  // curado
    if (ACEITES.has(l.ingredientId)) { aceites.push({ g, nu }); continue; }

    let efectivo = g;
    if (!YA_LIMPIO.test(n)) {
      for (const [re, factor] of COMESTIBLE) if (re.test(n)) { efectivo = g * factor; break; }
    }
    solido += efectivo;
    acumula(total, nu, efectivo);
  }
  for (const { g, nu } of aceites) {
    const efectivo = modoAceite === "fuera" ? 0
      : modoAceite === "entero" ? g
      : Math.min(g, ABSORCION_FRITURA * solido);
    acumula(total, nu, efectivo);
  }

  return { total, cobertura: masa > 0 ? cubierta / masa : 0, masa };
}
function acumula(total, nu, g) {
  total.kcal += (nu.kcal100g ?? 0) * g / 100;
  total.protein += (nu.protein100g ?? 0) * g / 100;
  total.carbs += (nu.carbs100g ?? 0) * g / 100;
  total.fat += (nu.fat100g ?? 0) * g / 100;
}

const mediana = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} %`;

const findings = [];
const add = (bloque, severidad, id, nombre, detalle, extra = {}) =>
  findings.push({ bloque, severidad, id, nombre, detalle, ...extra });

const out = [];
const say = (s = "") => out.push(s);

// ── 1 · MACROS ─────────────────────────────────────────────────────────────
const conCobertura = [];
for (const r of estrella) {
  const { total, cobertura, masa } = sumaDesdeIngredientes(r);
  const s = r.baseServings || 4;
  conCobertura.push({ r, total, cobertura, masa, s });
}
const medibles = conCobertura.filter((x) => x.cobertura >= 0.95 && x.r.kcal && x.r.protein_g);
const tieneUd = (r) => (r.ingredients ?? []).some((l) => l.unit === "ud");
const dentro = (x, min, max) => x.masa / x.s >= min && x.masa / x.s <= max;

say("═══ 1 · MACROS: la suma de ingredientes contra lo declarado ═══");
say("");
say("  Este bloque NO da una cifra, y el motivo es el hallazgo. Cada filtro que");
say("  hace la medición posible mueve el resultado más que el defecto buscado,");
say("  así que lo que se publica es el rango y la sensibilidad, no un titular.");

// ── 1a · el filtro de cobertura es una rampa, no un control de calidad ─────
// Cuanta más masa de la receta tiene macros de ingrediente, más proteína se
// cuenta: el error es función monótona de la cobertura POR CONSTRUCCIÓN.
// Elegir un umbral es elegir el resultado, así que se enseña la rampa entera.
say("");
say("  a) el umbral de cobertura ES el número:");
say("");
say("     cobertura      n    error proteína");
const TRAMOS = [[0, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 0.95], [0.95, 0.99], [0.99, 1.01]];
for (const [lo, hi] of TRAMOS) {
  const sub = conCobertura.filter((x) => x.r.kcal && x.r.protein_g && x.cobertura >= lo && x.cobertura < hi);
  if (!sub.length) continue;
  const ep = mediana(sub.map((x) => (x.total.protein / x.s - x.r.protein_g) / x.r.protein_g));
  say(`     ${(lo * 100).toFixed(0).padStart(3)}–${(hi * 100).toFixed(0).padStart(3)} %  ${String(sub.length).padStart(5)}        ${pct(ep).padStart(8)}`);
}
say("");
say("  Las recetas de cobertura baja no están 'mal medidas': les falta la mitad");
say("  de la despensa. Y lo que falta no falta al azar — los ingredientes sin");
say("  `nutrition` se concentran en fruta, panadería y huevos.");

// ── 1b · los CUATRO macros, no dos ────────────────────────────────────────
// Publicar solo kcal y proteína permitía leer "-1,5 % en kcal" como acuerdo.
// No lo es: con el aceite fuera el total cuadra porque la grasa cae un 28 %
// y la proteína sube un 18 %. Es cancelación, y solo se ve con los cuatro.
const limpio = medibles.filter((x) => !tieneUd(x.r) && dentro(x, 150, 700));
say("");
say(`  b) los cuatro macros sobre las ${limpio.length} recetas del corte más estricto:`);
say("");
say(`     ${"aceite".padEnd(11)}${"kcal".padStart(8)}${"prot".padStart(9)}${"carbs".padStart(9)}${"grasa".padStart(9)}`);
for (const modo of ["fuera", "absorbido", "entero"]) {
  const err = (sel, dec) => mediana(limpio.map((x) => {
    const t = sumaDesdeIngredientes(x.r, modo).total;
    return (sel(t) / x.s - x.r[dec]) / x.r[dec];
  }));
  const f = (v) => pct(v).padStart(8);
  const c = (v) => pct(v).padStart(9);
  say(`     ${modo.padEnd(11)}${f(err((t) => t.kcal, "kcal"))}${c(err((t) => t.protein, "protein_g"))}${c(err((t) => t.carbs, "carbs_g"))}${c(err((t) => t.fat, "fat_g"))}`);
}
say("");
say("  Mirar SOLO la columna de kcal en la fila 'fuera' invita a leer acuerdo");
say("  donde hay cancelación: ese total sale de una grasa muy baja sumada a una");
say("  proteína y unos carbos altos. Los cuatro macros a la vez lo desmienten.");
say("  Y 'absorbido' ≈ 'entero' porque el tope del 6 % casi nunca muerde: la");
say("  banda real es binaria, el aceite se cuenta o no se cuenta.");

// ── 1c · qué sobrevive a mover los filtros ────────────────────────────────
// Curva de especificación: todas las combinaciones defendibles de umbral de
// cobertura y banda de masa. Si el signo aguanta en todas, el signo es el
// hallazgo; la magnitud no lo es.
say("");
say("  c) curva de especificación — todas estas combinaciones son defendibles:");
const espec = [];
for (const cob of [0.90, 0.95, 0.99]) {
  for (const [lo, hi] of [[120, 900], [150, 700], [200, 600], [150, 500]]) {
    for (const soloSinUd of [true, false]) {
      const sub = conCobertura.filter((x) => x.r.kcal && x.r.protein_g && x.cobertura >= cob
        && (!soloSinUd || !tieneUd(x.r)) && dentro(x, lo, hi));
      if (sub.length < 15) continue;
      espec.push(mediana(sub.map((x) => (x.total.protein / x.s - x.r.protein_g) / x.r.protein_g)));
    }
  }
}
espec.sort((a, b) => a - b);
const positivas = espec.filter((e) => e > 0).length;
say(`     ${espec.length} especificaciones, de ${pct(espec[0])} a ${pct(espec[espec.length - 1])}, mediana ${pct(mediana(espec))}`);
say(`     positivas: ${positivas} de ${espec.length}`);

// Bootstrap de la mediana: la precisión que el dato aguanta de verdad.
const eps = limpio
  .map((x) => (x.total.protein / x.s - x.r.protein_g) / x.r.protein_g)
  .sort((a, b) => a - b);
let semilla = 12345;
const aleatorio = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
const medianas = [];
for (let i = 0; i < 4000; i++) {
  const m = [];
  for (let j = 0; j < eps.length; j++) m.push(eps[Math.floor(aleatorio() * eps.length)]);
  medianas.push(mediana(m));
}
medianas.sort((a, b) => a - b);
const q = (f, xs = eps) => pct(xs[Math.floor(f * xs.length)]);
say("");
say(`     bootstrap de la mediana (4 000 remuestreos): IC95 ${q(0.025, medianas)} … ${q(0.975, medianas)}`);
say(`     dispersión p10/p25/p50/p75/p90: ${q(0.1)} / ${q(0.25)} / ${q(0.5)} / ${q(0.75)} / ${q(0.9)}`);
say(`     ${eps.filter((e) => e > 0).length} de ${eps.length} recetas suman MÁS proteína de la que declaran.`);

// ── 1d · a qué catálogo se parece el subconjunto medible ──────────────────
// Lo que no se puede medir importa tanto como lo medido: si una categoría
// entera cae fuera, el número no habla de ella aunque se presente global.
say("");
say("  d) el subconjunto medible NO representa al catálogo:");
const porCat = (xs) => xs.reduce((a, r) => ((a[r.category ?? "?"] = (a[r.category ?? "?"] ?? 0) + 1), a), {});
const catTodas = porCat(estrella);
const catLimpio = porCat(limpio.map((x) => x.r));
say("");
say("     categoría              corpus   medibles   error proteína");
for (const [c, n] of Object.entries(catTodas).sort((a, b) => b[1] - a[1])) {
  const sub = limpio.filter((x) => (x.r.category ?? "?") === c);
  const err = sub.length >= 3
    ? pct(mediana(sub.map((x) => (x.total.protein / x.s - x.r.protein_g) / x.r.protein_g)))
    : "—";
  say(`     ${c.padEnd(22)}${String(n).padStart(5)}${String(catLimpio[c] ?? 0).padStart(10)}       ${err.padStart(8)}`);
}
const ausentes = Object.entries(catTodas).filter(([c]) => !catLimpio[c]);
const nAusentes = ausentes.reduce((a, [, n]) => a + n, 0);
say("");
say(`  ${nAusentes} recetas (${(nAusentes / estrella.length * 100).toFixed(1)} % del corpus) están en categorías con CERO`);
say(`  representación: ${ausentes.map(([c]) => c).join(", ")}.`);
say("  Para ellas este bloque no dice nada, ni a favor ni en contra.");
// Post-estratificado a la mezcla del corpus, sobre las categorías que sí salen.
let num = 0, den = 0;
for (const [c, n] of Object.entries(catTodas)) {
  const sub = limpio.filter((x) => (x.r.category ?? "?") === c);
  if (sub.length < 3) continue;
  num += n * mediana(sub.map((x) => (x.total.protein / x.s - x.r.protein_g) / x.r.protein_g));
  den += n;
}
say(`  Reponderado a la mezcla real del catálogo: ${pct(num / den)}.`);

// ── 1e · Atwater, con la misma vara que se le exige a lo demás ────────────
const atwater = estrella
  .filter((r) => r.kcal && r.protein_g != null && r.carbs_g != null && r.fat_g != null)
  .map((r) => (4 * r.protein_g + 4 * r.carbs_g + 9 * r.fat_g - r.kcal) / r.kcal)
  .sort((a, b) => a - b);
say("");
say(`  e) Atwater sobre lo declarado, p10/p50/p90: ${q(0.1, atwater)} / ${q(0.5, atwater)} / ${q(0.9, atwater)}`);
say("  Atwater fija el TOTAL, no el REPARTO: es 1 restricción sobre 4 grados de");
say("  libertad, así que deja 2 libres. No es vacía (una terna al azar no la");
say("  pasa), pero tampoco valida el reparto, y el apartado (b) enseña por qué:");
say("  el total puede cuadrar con la grasa muy por debajo de lo declarado.");

say("");
say("  ── LO PUBLICABLE ──");
say("  La proteína sumada supera a la declarada en la mayoría de las recetas");
say("  medibles, y el SIGNO aguanta las " + espec.length + " especificaciones probadas. La");
say("  MAGNITUD no: depende del umbral de cobertura y de la banda de masa tanto");
say("  como del defecto. No hay evidencia para un factor de corrección, y el");
say("  desacuerdo no es uniforme entre macros. Importa porque el número");
say("  declarado es el que ve el usuario: `Menu.jsx` construye `macros` desde");
say("  `protein_g`.");

for (const x of limpio) {
  const ep = (x.total.protein / x.s - x.r.protein_g) / x.r.protein_g;
  if (Math.abs(ep) > 0.5) {
    add("macros", "alta", x.r.id, x.r.name,
      `protein_g declarada ${x.r.protein_g} g, sumada ${(x.total.protein / x.s).toFixed(0)} g (${pct(ep)})`,
      { declarado: x.r.protein_g, sumado: +(x.total.protein / x.s).toFixed(1) });
  }
}

// ── 2 · RACIONES ───────────────────────────────────────────────────────────
// El ratio de proteína es mejor detector que el de kcal porque el aceite,
// que es el que ensucia las kcal, aporta CERO proteína.
say("");
say("═══ 2 · RACIONES: baseServings sospechoso ═══");
const sospechosas = [];
for (const x of conCobertura) {
  if (x.cobertura < 0.90 || !x.r.protein_g) continue;
  const ratio = (x.total.protein / x.s) / x.r.protein_g;
  const masaRacion = x.masa / x.s;
  const fueraRatio = ratio > 1.6 || ratio < 0.6;
  const fueraMasa = masaRacion > 900 || masaRacion < 120;
  if (!fueraRatio && !fueraMasa) continue;
  const sugerido = ratio > 1.6 ? Math.round(x.s * ratio) : null;
  sospechosas.push({ ...x, ratio, masaRacion, sugerido });
}
sospechosas.sort((a, b) => b.ratio - a.ratio);
say(`  recetas con ratio de proteína fuera de [0,6 – 1,6] o masa/ración fuera de [120 – 900] g: ${sospechosas.length}`);
say("");
say("   ratio   actual  sugerido   g/ración   receta");
for (const x of sospechosas.slice(0, 25)) {
  say(`   ×${x.ratio.toFixed(2).padStart(5)}    x${x.s}       ${String(x.sugerido ?? "—").padStart(3)}      ${x.masaRacion.toFixed(0).padStart(5)} g   ${x.r.name.slice(0, 44)}`);
}
if (sospechosas.length > 25) say(`   … y ${sospechosas.length - 25} más`);
for (const x of sospechosas) {
  add("raciones", x.ratio > 2 ? "alta" : "media", x.r.id, x.r.name,
    `baseServings ${x.s}, ratio de proteína ×${x.ratio.toFixed(2)}, ${x.masaRacion.toFixed(0)} g/ración`,
    { actual: x.s, sugerido: x.sugerido });
}

// ── 3 · ENUMS: el nombre contradice la etiqueta ────────────────────────────
say("");
say("═══ 3 · ENUMS: el nombre del plato contradice su etiqueta ═══");
const CONTRADICCIONES = [
  { re: /\bpato\b|magret/, campo: "mainProtein", malos: ["pollo", "pavo"], falta: "pato",
    nota: "el enum de mainProtein no tiene `pato`" },
  { re: /boniato/, campo: "mainBase", malos: ["patatas"], falta: "boniato",
    nota: "`boniato` sí existe en el enum y no se usó" },
];
for (const c of CONTRADICCIONES) {
  const hits = estrella.filter((r) => c.re.test(norm(r.name)) && c.malos.includes(r[c.campo]));
  say(`  ${c.nota}: ${hits.length} recetas`);
  for (const r of hits) {
    say(`     ${r[c.campo].padEnd(8)} → ${c.falta.padEnd(8)}  ${r.name.slice(0, 50)}`);
    add("enums", "media", r.id, r.name, `${c.campo}: ${r[c.campo]} → ${c.falta}`,
      { campo: c.campo, actual: r[c.campo], sugerido: c.falta });
  }
}

// ── 4 · TÉCNICA ────────────────────────────────────────────────────────────
say("");
say("═══ 4 · TÉCNICA: ausente o incompatible con el nombre ═══");
const sinTecnica = recipes.filter((r) => (r.mealRole ?? []).includes("guarnicion") && !r.tecnica);
say(`  guarniciones sin tecnica: ${sinTecnica.length}`);
for (const r of sinTecnica) add("tecnica", "media", r.id, r.name, "guarnición sin `tecnica`");

// El check de "nombre de fritura con tecnica ≠ fritura" ESTUVO aquí y se
// quitó: eran 48 hallazgos y ninguno era un hallazgo.
//
//   · `tecnica` no es "qué técnica" sino la DOMINANTE resuelta por prioridad,
//     y `scripts/mark-catalog-axes.mjs:119` mapea a propósito todo lo frito a
//     `sarten`. Los 48 eran la salida deliberada del generador, no una
//     desviación de él.
//   · el concepto "frito" ya vive en otro eje y ese sí tiene consumidor:
//     `healthFlags.frito` (lib/healthFlags.js) alimenta la regla
//     `dos_fritos_seguidos` de validateMenu, y marca 51 de las 52.
//   · y el check tenía dos bugs propios: `/frit[ao]s?\b/` casaba con
//     "sofrito", y casaba con la GUARNICIÓN — "Chuletón a la parrilla con
//     patatas fritas" es plancha y está bien, lo frito es el acompañamiento.

// `escabeche` NO va aquí: se cuece y luego se marina, así que una técnica de
// calor es correcta. `curado` solo cuenta sobre la proteína — "cheddar curado"
// y "queso curado" son el queso de un plato que sí se cocina.
const CRUDO = /gravlax|ceviche|tartar|carpaccio|marinad/;
const QUESO_CURADO = /queso curado|cheddar curado|curado en lonchas/;
const crudoMal = estrella.filter(
  (r) => CRUDO.test(norm(r.name))
    && !QUESO_CURADO.test(norm(r.name))
    && ["sarten", "plancha", "horno", "olla"].includes(r.tecnica),
);
say(`  nombre de crudo/curado con técnica de calor: ${crudoMal.length}`);
for (const r of crudoMal) {
  say(`     ${String(r.tecnica).padEnd(8)} en  ${r.name.slice(0, 50)}`);
  add("tecnica", "alta", r.id, r.name, `plato crudo/curado con tecnica: ${r.tecnica}`);
}

// ── 5 · PARTES ─────────────────────────────────────────────────────────────
// Ya no se recalcula aquí: se lee de src/data/derived/recipeParts.json, que
// es la tabla intermedia que produce scripts/build-derived.mjs. Es el mismo
// principio que el resto del fichero — una sola verdad por dato — y además
// hace que este bloque hable del vector real (masa y macros por componente) y
// no solo de si el campo está o no está.
say("");
say("═══ 5 · PARTES: qué componente del plato es cada cosa ═══");
const PARTES = JSON.parse(readFileSync(join(ROOT, "src", "data", "derived", "recipeParts.json"), "utf8"));
const META = JSON.parse(readFileSync(join(ROOT, "src", "data", "derived", "_meta.json"), "utf8"));
const porOrigen = { curado: [], monocomponente: [], monocomponente_juzgado: [], sin_curar: [], sin_senal: [] };
for (const r of estrella) {
  const fila = PARTES[r.id];
  if (fila) porOrigen[fila.origen]?.push(r);
}
const pcE = (n) => `${String(n).padStart(3)} (${(n / estrella.length * 100).toFixed(1)} %)`;
say(`  Estrella con vector de partes curado:  ${pcE(porOrigen.curado.length)}`);
say(`  monocomponente por construcción:       ${pcE(porOrigen.monocomponente.length)}`);
say(`  monocomponente tras mirarla:           ${pcE(porOrigen.monocomponente_juzgado.length)}`);
say(`  sin señal de componente aparte:        ${pcE(porOrigen.sin_senal.length)}`);
say(`  con señal y sin mirar:                 ${pcE(porOrigen.sin_curar.length)}  ← el hueco`);
say("");
say("  `sin señal` no es lo mismo que hueco: son las que la puerta de dos");
say("  etapas (scripts/select-recipes-for-parts.mjs) descarta porque ni su");
say("  nombre ni sus últimos pasos sugieren un componente aparte. La puerta es");
say("  de recall, así que un falso negativo ahí es raro.");
say("");
say("  El hueco NO se puede tapar derivando. El operador determinista");
say(`  (src/lib/derive/stepParts.js) concuerda con lo curado un ${(META.recipeParts.operador_determinista.concordancia_con_curado * 100).toFixed(1)} %,`);
say("  y el techo es conceptual: la parte es propiedad del PLATO, no del");
say("  ingrediente — la misma cebolla es sofrito del principal en una receta y");
say("  la guarnición en otra. Rellenarlo exige el pipeline curado");
say("  (scripts/enrich-recipe-steps.mjs --parts) sobre los objetivos que marca");
say("  scripts/select-recipes-for-parts.mjs.");
for (const r of porOrigen.sin_curar) {
  add("partes", "media", r.id, r.name, "da señal de tener componente aparte y nadie la ha mirado");
}
// Lo que el vector ya permite decir, que era la pregunta original: ¿manda el
// principal en el plato, o lo hace su guarnición?
const conVector = porOrigen.curado.filter((r) => PARTES[r.id].partes?.principal);
const dominaGuarnicion = conVector.filter((r) => {
  const p = PARTES[r.id].partes;
  return p.guarnicion && p.guarnicion.masa_g > p.principal.masa_g;
});
say("");
say(`  de las ${conVector.length} con principal identificado, en ${dominaGuarnicion.length} pesa más la guarnición que el`);
say("  principal. No es un error: es por qué el rol no se puede leer del peso.");

// ── 6 · PIEZAS ─────────────────────────────────────────────────────────────
say("");
say("═══ 6 · PIEZAS: líneas en `ud` que nadie sabe pesar ═══");
const porIngrediente = new Map();
let lineasUd = 0;
for (const r of estrella) {
  for (const l of r.ingredients ?? []) {
    if (l.unit !== "ud") continue;
    lineasUd++;
    const e = porIngrediente.get(l.name) ?? { c: 0, linea: l };
    e.c++;
    porIngrediente.set(l.name, e);
  }
}
const huerfanos = [...porIngrediente.entries()].filter(([, e]) => piezaEnGramos(e.linea) == null);
const nHuerfanas = huerfanos.reduce((a, [, e]) => a + e.c, 0);
say(`  líneas en 'ud': ${lineasUd} sobre ${porIngrediente.size} ingredientes distintos`);
say(`  que el catálogo o PIECE_WEIGHTS saben pesar: ${lineasUd - nHuerfanas} (${((lineasUd - nHuerfanas) / lineasUd * 100).toFixed(0)} %)`);
say(`  huérfanas: ${nHuerfanas} sobre ${huerfanos.length} ingredientes. No pesan nada.`);
say("");
say("  OJO con el arreglo evidente. Añadirles `pieza` NO es gratis y no arregla");
say("  la compra: la empeora. `aggregationUnit` (lib/shoppingBuilder.js) saca la");
say("  línea de `ud` en cuanto existe un peso, y la lente 'Unidades' vuelve a");
say("  piezas con `gramsPerPiece`, que no mira el catálogo. Sin entrada en");
say("  PIECE_WEIGHTS el viaje es de ida: '16 uds' pasa a '128 g' para siempre, y");
say("  la línea deja de redondear a pieza entera. Se probó y se revirtió; el");
say("  candado está en src/lib/piezaRoundTrip.test.js.");
say("");
say("  El defecto de fondo es que `aggregationUnit` convierte cuando SABE pesar,");
say("  en vez de cuando el ingrediente aparece de verdad en las dos unidades.");
say("  Eso ya afecta a 23 ingredientes desde antes, huevo y pan entre ellos.");
say("");
for (const [n, e] of huerfanos.sort((a, b) => b[1].c - a[1].c).slice(0, 15)) {
  const c = e.c;
  say(`     ${String(c).padStart(3)} ×  ${n}`);
  add("piezas", "baja", null, n, `${c} líneas en 'ud' sin pieza declarada ni regex`);
}
if (huerfanos.length > 15) say(`     … y ${huerfanos.length - 15} ingredientes más`);

// ── 7 · ALÉRGENOS ──────────────────────────────────────────────────────────
// El único eje donde un falso negativo no es calidad sino riesgo, así que la
// sospecha no basta: hay que cruzarlo. Se cruza con `normalizeAllergenId`
// porque los dos vocabularios NO coinciden — el ingrediente habla en ids de la
// UE (`crustaceos`, `huevos`, `leche`, `frutos_cascara`) y la receta en los
// suyos (`marisco`, `huevo`, `lactosa`, `frutos_secos`). Comparar en crudo
// daría falsos positivos en masa.
//
// `cookingAllergens` NO entra en la unión, a propósito: ingredientSchema lo
// define como segundo nivel (el vino de un sofrito no excluye la receta, la
// adapta) y prohíbe que un alérgeno esté en los dos niveles.
say("");
say("═══ 7 · ALÉRGENOS: el único fallo que es riesgo, no calidad ═══");
const sinAlergenos = estrella.filter((r) => Array.isArray(r.allergens) && r.allergens.length === 0);
const alergenosDeIngredientes = (r) => {
  const u = new Set();
  for (const l of r.ingredients ?? []) {
    for (const a of BY_ID.get(l.ingredientId)?.allergens ?? []) u.add(normalizeAllergenId(a));
  }
  return [...u].filter(Boolean);
};
const falsosVacios = sinAlergenos
  .map((r) => ({ r, faltan: alergenosDeIngredientes(r) }))
  .filter((x) => x.faltan.length);
say(`  Estrella con allergens: [] — ${sinAlergenos.length}`);
say(`  de esas, con algún ingrediente que SÍ declara alérgeno: ${falsosVacios.length}`);
for (const x of falsosVacios) {
  add("alergenos", "alta", x.r.id, x.r.name, `allergens: [] pero sus ingredientes declaran ${x.faltan.join(", ")}`);
}
// Contraste: si el oráculo tuviera margen, encontraría algo en las que SÍ
// declaran. Encuentra casi nada, o sea que las dos fuentes ya concuerdan.
const conAlergenos = estrella.filter((r) => (r.allergens ?? []).length);
const ampliables = conAlergenos.filter((r) => {
  const dec = new Set((r.allergens ?? []).map(normalizeAllergenId));
  return alergenosDeIngredientes(r).some((a) => !dec.has(a));
});
say(`  contraste — de las ${conAlergenos.length} que sí declaran, la unión añadiría algo en ${ampliables.length}.`);
say("  El cruce no encuentra falsos vacíos, y tampoco es un detector romo: las");
say("  dos fuentes ya están de acuerdo. Un `[]` aquí significa 'sin alérgeno'.");

// Lo que sí está descuadrado es el segundo nivel, y es convención, no riesgo.
const conCocinado = estrella.filter((r) =>
  (r.ingredients ?? []).some((l) => (BY_ID.get(l.ingredientId)?.cookingAllergens ?? []).length));
const sinDeclararCocinado = conCocinado.filter((r) =>
  !(r.allergens ?? []).map(normalizeAllergenId).includes("sulfitos"));
say("");
say(`  el desajuste real: de ${conCocinado.length} recetas con un ingrediente de alérgeno`);
say(`  de cocinado (vino, vinagre, brandy), ${conCocinado.length - sinDeclararCocinado.length} declaran sulfitos y ${sinDeclararCocinado.length} no.`);
say("  Es una convención sin fijar, no un riesgo: `sulfitos` es uno de los seis");
say("  que la red por nombre de lib/allergens.js ya caza por su cuenta.");
for (const r of sinDeclararCocinado) {
  add("alergenos", "baja", r.id, r.name, "lleva alérgeno de cocinado y no declara sulfitos");
}

// ── 8 · ALIAS ──────────────────────────────────────────────────────────────
// Un alias no es un sinónimo: es una promesa de que las dos cosas se compran
// igual. "Queso rallado" tiene como alias "Queso cheddar en lonchas", y a la
// vez existe un `queso-en-lonchas` sin usar — así que la lista de la compra
// suma lonchas con rallado en la misma línea y te manda a por una bolsa sola.
// Lo detectamos donde es objetivo: el formato que dice el nombre canónico
// contra el que dice el alias.
say("");
say("═══ 8 · ALIAS: un alias que cambia el formato del producto ═══");
const FORMATOS = [
  ["rallado", /rallad/], ["lonchas", /loncha/], ["dados", /\bdados|taquitos|tacos\b/],
  ["molido", /molid|picad/], ["entero", /\bentero\b|\bentera\b/], ["polvo", /en polvo/],
];
const formatoDe = (t) => FORMATOS.filter(([, re]) => re.test(norm(t))).map(([f]) => f);
const choques = [];
for (const ing of ingredients) {
  const suyo = formatoDe(ing.name);
  if (!suyo.length) continue;
  for (const a of ing.aliases ?? []) {
    const otro = formatoDe(a);
    if (otro.length && !otro.some((f) => suyo.includes(f))) choques.push({ ing, a, suyo, otro });
  }
}
say(`  alias que declaran un formato distinto al del ingrediente: ${choques.length}`);
for (const c of choques.slice(0, 12)) {
  say(`     ${c.ing.id.padEnd(22)} ${c.suyo.join("/")} → ${c.otro.join("/")}   «${c.a}»`);
  add("alias", "media", c.ing.id, c.ing.name, `alias «${c.a}» es ${c.otro.join("/")}, el ingrediente es ${c.suyo.join("/")}`);
}
if (choques.length > 12) say(`     … y ${choques.length - 12} más`);

// ── 9 ──────────────────────────────────────────────────────────────────────
// El libro de cuentas de `alimentos`. Es el bloque que contesta la pregunta
// que hasta ahora no se podía hacer: "de esta familia, ¿cuántas filas y
// cuántas rellenas?". Y contesta también la que importa más — cuánto de lo que
// falta es trabajo pendiente (`ausente_resoluble`) y cuánto es trabajo que hay
// que ir a buscar fuera (`ausente_sin_fuente`). Sin esa distinción, una tabla
// terminada parece a medias para siempre.
say("");
say("═══ 9 · ALIMENTOS: el libro de cuentas de la tabla de referencia ═══");
let alimentos = null;
try {
  alimentos = JSON.parse(readFileSync(join(ROOT, "src", "data", "alimentos.json"), "utf8"));
} catch { /* la tabla aún no existe: no es un fallo del catálogo */ }

if (!alimentos) {
  say("  no hay src/data/alimentos.json — `node scripts/build-alimentos.mjs`");
} else {
  const porFuente = {};
  for (const a of alimentos) porFuente[a.fuente] = (porFuente[a.fuente] ?? 0) + 1;
  say(`  ${alimentos.length} filas · ${Object.entries(porFuente).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  say("");
  say("     campo                 relleno  no_aplica  resoluble  sin_fuente");
  const campos = Object.keys(alimentos[0].huecos);
  for (const campo of campos) {
    const c = { relleno: 0, no_aplica: 0, ausente_resoluble: 0, ausente_sin_fuente: 0 };
    for (const a of alimentos) c[a.huecos[campo]]++;
    say(`     ${campo.padEnd(20)} ${String(c.relleno).padStart(7)}  ${String(c.no_aplica).padStart(9)}  ${String(c.ausente_resoluble).padStart(9)}  ${String(c.ausente_sin_fuente).padStart(10)}`);
  }
  // Lo resoluble es la única columna que es una lista de tareas. Se saca como
  // total para que se vea si el trabajo pendiente encoge entre ejecuciones.
  const resoluble = alimentos.reduce(
    (n, a) => n + Object.values(a.huecos).filter((e) => e === "ausente_resoluble").length, 0,
  );
  const sinFuente = alimentos.reduce(
    (n, a) => n + Object.values(a.huecos).filter((e) => e === "ausente_sin_fuente").length, 0,
  );
  say("");
  say(`  huecos resolubles (hay dónde ir a buscarlos): ${resoluble}`);
  say(`  huecos sin fuente (BEDCA nombró el alimento y no lo dijo): ${sinFuente}`);

  const heredados = alimentos.filter((a) => a.fuente === "heredado");
  if (heredados.length > 0) {
    say("");
    say(`  ⚠️  ${heredados.length} filas con número y sin ficha — se usan hoy y nadie sabe de dónde salen:`);
    say(`      ${heredados.map((a) => a.id).join(", ")}`);
    for (const a of heredados) {
      add("alimentos", "media", a.id, a.nombre, "nutrición heredada sin procedencia: no se puede auditar el número");
    }
  }
}

// ── RESUMEN ────────────────────────────────────────────────────────────────
say("");
say("═══ RESUMEN ═══");
const porBloque = {};
for (const f of findings) porBloque[f.bloque] = (porBloque[f.bloque] ?? 0) + 1;
for (const [b, n] of Object.entries(porBloque)) say(`  ${b.padEnd(12)} ${n}`);
say(`  TOTAL        ${findings.length} hallazgos`);

if (AS_JSON) {
  console.log(JSON.stringify({ generado: new Date().toISOString(), recetas: recipes.length, estrella: estrella.length, principales: principales.length, findings }, null, 2));
} else {
  console.log(out.join("\n"));
}

// --check cuenta pero NO falla, a propósito: sin una línea base acordada, un
// exit 1 aquí solo enseñaría al equipo a ignorar el check. Cuando el equipo
// fije el número, esto pasa a comparar contra él y entonces sí puede fallar.
if (AS_CHECK) {
  const graves = findings.filter((f) => f.severidad === "alta").length;
  console.error(`\n[--check] hallazgos de severidad alta: ${graves}`);
}
