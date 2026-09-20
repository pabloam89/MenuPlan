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
 * salud y no lo es: Atwater fija el TOTAL, no el REPARTO. Cualquier terna
 * (P, C, F) que sume bien la satisface, incluida una inventada.
 *
 * ── Y por qué el propio informe desconfía de sí mismo ─────────────────────
 * Comparar lo declarado con la suma de ingredientes exige tres supuestos que
 * son MÍOS, no del catálogo: cuánto pesa una pieza, cuánto aceite se come de
 * verdad y si `baseServings` es correcto. Los tres mueven el resultado más
 * que el defecto que buscan, así que el bloque 1 los apaga uno a uno y solo
 * afirma lo que sobrevive a los tres:
 *
 *   sobre las 95 recetas sin líneas en `ud` y con una masa por ración
 *   plausible, la proteína sumada supera a la declarada en un 19,6 % mediano,
 *   pero con una dispersión enorme (p10 −11 %, p90 +67 %) y 71 de 95 por
 *   encima. No es un sesgo limpio que se arregle con un factor.
 *
 * Las kcal ni siquiera dan un número: según se cuente el aceite salen entre
 * −1,5 % y +18,4 %, y decidir eso exige `stepsRich[].part` (bloque 5) para
 * saber qué aceite se sirve y cuál se queda en la sartén.
 *
 * La conclusión honesta es que las dos fuentes discrepan y NINGUNA está
 * validada. Importa porque el número declarado es el que ve el usuario:
 * `Menu.jsx` construye `macros` desde `protein_g`.
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
const PIEZA_POR_DEFECTO = 80;
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
// Platos donde el aceite NO es medio de cocción sino parte del plato servido:
// se come entero, no se absorbe.
const SE_COME_CRUDO = /alioli|mayonesa|vinagreta|aliñ|gazpacho|salmorejo|hummus|pesto|escabech|marinad|ensalada|tostada|pan con|carpaccio|tartar|crudo/;

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
    if (/aceite/.test(n) && !SE_COME_CRUDO.test(norm(receta.name))) {          // medio de cocción
      aceites.push({ g, nu });
      continue;
    }

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
say(`  recetas Estrella con ≥95 % de su masa con macros de ingrediente: ${medibles.length} de ${estrella.length}`);
say("");
say("  Medir esto exige tres supuestos MÍOS, no del catálogo: cuánto pesa una");
say("  pieza, cuánto aceite se absorbe y si baseServings es correcto. Cada fila");
say("  apaga uno. La última no depende de ninguno: es el número defendible.");
say("");
say("  subconjunto                      n     error kcal    error proteína");
for (const [label, filtro] of [
  ["todas", () => true],
  ["sin líneas en `ud`", (x) => !tieneUd(x.r)],
  ["+ masa/ración 150–700 g", (x) => !tieneUd(x.r) && dentro(x, 150, 700)],
]) {
  const sub = medibles.filter(filtro);
  if (!sub.length) continue;
  const ek = mediana(sub.map((x) => (x.total.kcal / x.s - x.r.kcal) / x.r.kcal));
  const ep = mediana(sub.map((x) => (x.total.protein / x.s - x.r.protein_g) / x.r.protein_g));
  say(`  ${label.padEnd(32)}${String(sub.length).padStart(3)}      ${pct(ek).padStart(8)}      ${pct(ep).padStart(8)}`);
}
// La banda del aceite. Es el supuesto que más mueve las kcal y el que menos
// evidencia tiene: con el aceite fuera las kcal salen BAJAS, con el aceite
// entero salen ALTAS. Mientras no haya `part` para saber qué aceite se sirve
// y cuál se queda en la sartén, las kcal derivadas son una banda, no un dato.
const limpio = medibles.filter((x) => !tieneUd(x.r) && dentro(x, 150, 700));
say("");
say(`  banda del aceite sobre esas ${limpio.length} recetas (solo mueve las kcal):`);
for (const modo of ["fuera", "absorbido", "entero"]) {
  const ek = mediana(limpio.map((x) => {
    const k = sumaDesdeIngredientes(x.r, modo).total.kcal;
    return (k / x.s - x.r.kcal) / x.r.kcal;
  }));
  say(`    aceite ${modo.padEnd(12)} kcal ${pct(ek).padStart(8)}`);
}
// El reparto de la proteína, que es lo que no es una banda sino una dispersión.
const eps = limpio
  .map((x) => (x.total.protein / x.s - x.r.protein_g) / x.r.protein_g)
  .sort((a, b) => a - b);
const q = (f) => pct(eps[Math.floor(f * eps.length)]);
say("");
say(`  proteína p10/p25/p50/p75/p90: ${q(0.1)} / ${q(0.25)} / ${q(0.5)} / ${q(0.75)} / ${q(0.9)}`);
say(`  ${eps.filter((e) => e > 0).length} de ${eps.length} recetas suman MÁS proteína de la que declaran.`);
say("  No es un sesgo limpio que se corrija con un factor: es dispersión. Ninguna");
say("  de las dos fuentes está validada, y la derivada tampoco puede arbitrar.");
// Atwater sobre lo DECLARADO: la comprobación que parece validar y no valida.
const atwater = estrella
  .filter((r) => r.kcal && r.protein_g != null && r.carbs_g != null && r.fat_g != null)
  .map((r) => (4 * r.protein_g + 4 * r.carbs_g + 9 * r.fat_g - r.kcal) / r.kcal);
say("");
say(`  Atwater sobre lo declarado: error mediano ${pct(mediana(atwater))} — los cuatro números`);
say("  concuerdan entre sí. Eso NO valida el reparto, y la columna de proteína lo demuestra.");

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

const FRITURA = /frit[ao]s?\b|rebozad|empanad|buñuelo|croqueta|tempura/;
const frituraMal = estrella.filter((r) => FRITURA.test(norm(r.name)) && r.tecnica && r.tecnica !== "fritura");
say(`  nombre de fritura con tecnica ≠ fritura: ${frituraMal.length}  (el valor 'fritura' no existe en el enum)`);
for (const r of frituraMal) add("tecnica", "media", r.id, r.name, `nombre de fritura pero tecnica: ${r.tecnica}`);

// Una técnica declarada puede ser directamente falsa, no solo incompleta: un
// curado en frío de 24 h etiquetado `sarten` engaña más que un campo vacío.
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
say("");
say("═══ 5 · PARTES: el campo que dice qué es principal y qué guarnición ═══");
const conSteps = estrella.filter((r) => (r.stepsRich ?? []).length);
const conPart = conSteps.filter((r) => (r.stepsRich ?? []).some((s) => s?.part));
const conMarcado = conSteps.filter((r) => (r.stepsRich ?? []).some((s) => /\{\{/.test(s?.text ?? "")));
say(`  Estrella con stepsRich:        ${conSteps.length} (${(conSteps.length / estrella.length * 100).toFixed(1)} %)`);
say(`  con marcado {{ingrediente}}:   ${conMarcado.length} (${(conMarcado.length / estrella.length * 100).toFixed(1)} %)`);
say(`  con stepsRich[].part:          ${conPart.length} (${(conPart.length / estrella.length * 100).toFixed(1)} %)  ← el hueco`);
say(`  derivables sin curar (tienen marcado y part): ${conPart.length}`);
say(`  pendientes de curar:           ${conSteps.length - conPart.length}`);

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
say(`  huérfanas: ${nHuerfanas} sobre ${huerfanos.length} ingredientes. No pesan nada, así que`);
say("  bajan la cobertura de su receta y la sacan del bloque 1. Cada una necesita");
say("  un `pieza: { nombre, g }` en ingredients.json — que además arregla la");
say("  lente 'Unidades' de la compra, no solo esta auditoría.");
say("");
for (const [n, e] of huerfanos.sort((a, b) => b[1].c - a[1].c).slice(0, 15)) {
  const c = e.c;
  say(`     ${String(c).padStart(3)} ×  ${n}`);
  add("piezas", "baja", null, n, `${c} líneas en 'ud' sin pieza declarada ni regex`);
}
if (huerfanos.length > 15) say(`     … y ${huerfanos.length - 15} ingredientes más`);

// ── 7 · ALÉRGENOS ──────────────────────────────────────────────────────────
say("");
say("═══ 7 · ALÉRGENOS: el único fallo que es riesgo, no calidad ═══");
const sinAlergenos = estrella.filter((r) => Array.isArray(r.allergens) && r.allergens.length === 0);
say(`  Estrella con allergens: [] (vacío explícito): ${sinAlergenos.length}`);
say("  puede ser correcto, pero es el único eje donde un falso negativo no es calidad.");
for (const r of sinAlergenos) add("alergenos", "revisar", r.id, r.name, "allergens: [] — verificar contra lib/allergens.js");

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
