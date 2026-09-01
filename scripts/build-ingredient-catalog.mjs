/**
 * build-ingredient-catalog.mjs — Fase 0 del catálogo de ingredientes.
 *
 * NO toca el esquema ni los datos de la app. Solo LEE el catálogo de recetas y
 * produce cuatro artefactos para revisión humana:
 *
 *   1. src/data/ingredients.json            — el catálogo canónico bundleado
 *   2. output/ingredients-review.csv        — nombres que necesitan revisión
 *   3. output/ingredient-merges-review.csv  — fusiones de alias sospechosas
 *   4. output/allergen-reconciliation.md    — alérgenos declarados vs computados
 *
 * El objetivo del informe (3) es responder a una pregunta que hoy nadie puede
 * responder: ¿los `allergens` declarados a mano en cada receta coinciden con
 * los que se deducen de sus propios ingredientes? Un "falta" ahí es un fallo de
 * seguridad alimentaria potencial; un "sobra" es normalmente una declaración
 * conservadora (correcta) o un hueco de este script.
 *
 * Reutiliza deliberadamente la maquinaria que ya existe en src/lib para no
 * duplicar vocabulario: ingredientStem/guessShoppingAisle/guessIngredientCategory
 * (ingredientCategories.js), la cascada de alias de ingredientImages.js y
 * normalizeAllergenId (allergens.js).
 *
 * Lo nuevo vive en dos módulos hermanos:
 *   - ingredient-allergens.mjs — el mapeo ingrediente → alérgeno, que no existe
 *     en ninguna otra parte (el catálogo declara alérgenos por RECETA, nunca
 *     por ingrediente). Compartido con apply-allergen-findings.mjs.
 *   - ingredient-overrides.mjs — las decisiones de canonicalización revisadas
 *     a mano, que ganan a la heurística de la cascada de arte.
 *
 * Uso:  node scripts/build-ingredient-catalog.mjs
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import {
  ingredientStem,
  normalizeName,
  guessShoppingAisle,
  guessIngredientCategory,
} from "../src/lib/ingredientCategories.js";
import { ingredientImageSrc } from "../src/lib/ingredientImages.js";
import { normalizeAllergenId, EU_ALLERGENS } from "../src/lib/allergens.js";
import { INTOLERANCE_RULES } from "../src/lib/intolerances.js";
import { compileKeywordRegex, normalizeText } from "../src/lib/recipeText.js";
import {
  validateIngredients,
  ADAPTABLE_RESTRICTIONS as SCHEMA_ADAPTABLE_RESTRICTIONS,
} from "../src/data/ingredientSchema.js";
import { overrideFor } from "./ingredient-overrides.mjs";
import {
  INGREDIENT_SUBSTITUTIONS,
  DELIBERATELY_NOT_SUBSTITUTABLE,
} from "./ingredient-substitutions.mjs";
import {
  allergensForIngredientName,
  NON_VEGETARIAN_RE,
  NON_VEGAN_RE,
} from "./ingredient-allergens.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
const OUT_DIR = join(ROOT, "output");


function slug(text) {
  return normalizeName(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sin-nombre";
}

/** Id canónico a partir del nombre. Devuelve {id, source, confident, name?}. */
function canonicalIdFor(name) {
  // Las decisiones revisadas a mano ganan a cualquier heurística.
  const override = overrideFor(normalizeName(name));
  if (override) return { id: override.id, source: "override", confident: true, name: override.name };

  const src = ingredientImageSrc(name); // "/ingredients/<id>.png" | null
  if (src) {
    const id = src.replace("/ingredients/", "").replace(".png", "");
    // Las familias visuales (fam_carne_roja…) agrupan productos DISTINTOS para
    // comprar (un solomillo no es un entrecot). Sirven de pista, no de id.
    if (!id.startsWith("fam_")) return { id, source: "art", confident: true };
    return { id: slug(ingredientStem(name)), source: `family:${id}`, confident: false };
  }
  return { id: slug(ingredientStem(name)), source: "stem", confident: false };
}

// ─────────────────────────────────────────────────────────────────────────
// Con qué restricciones adaptables choca cada ingrediente.
//
// Se deriva de INTOLERANCE_RULES —las MISMAS listas que usa el cliente para
// excluir— y no de los alérgenos del ingrediente, porque los dos conjuntos NO
// coinciden y confundirlos da respuestas falsas en las dos direcciones:
//
//   · La mantequilla lleva el alérgeno `leche` pero NO está en lactosa_fina:
//     se tolera, y ese es justo el sentido de la variante "fina" frente al
//     alérgeno completo (ver el comentario de intolerances.js).
//   · El vinagre tiene sulfitos de cocinado pero NO alcohol: ya fermentó en
//     ácido acético, y por eso no aparece en la lista de alcohol_cocina.
//
// Se evalúa contra el NOMBRE CANÓNICO, nunca contra los alias: "Vinagre" tiene
// como alias "Vinagre de vino", que contiene la palabra "vino" y lo metería en
// alcohol_cocina por la puerta de atrás.
// ─────────────────────────────────────────────────────────────────────────
// Fuente única: la define ingredientSchema.js y aquí solo se consume, para que
// el generador no pueda producir un valor que el schema rechace.
const ADAPTABLE_RESTRICTIONS = SCHEMA_ADAPTABLE_RESTRICTIONS;

const RESTRICTION_RE = Object.fromEntries(
  ADAPTABLE_RESTRICTIONS.map((id) => [id, compileKeywordRegex(INTOLERANCE_RULES[id].keywords)]),
);

// La lista de lactosa_fina casa "leche" a secas, así que se lleva por delante
// las bebidas vegetales. No llevan lactosa y no hay nada que adaptar en ellas.
const RESTRICTION_VETOES = {
  lactosa_fina: [/leche de (coco|almendra|avena|soja|arroz|anacardo)/, /bebida de /],
};

function restrictionConflictsFor(name) {
  const n = normalizeText(name);
  return ADAPTABLE_RESTRICTIONS.filter((id) => {
    if (!RESTRICTION_RE[id].test(n)) return false;
    return !(RESTRICTION_VETOES[id] ?? []).some((re) => re.test(n));
  });
}

function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Extracción
// ─────────────────────────────────────────────────────────────────────────
const recipes = [];
for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const entries = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"));
  for (const r of entries) recipes.push({ ...r, _file: file });
}

/** id canónico → agregado */
const byId = new Map();
/** nombre crudo → id canónico */
const nameToId = new Map();

for (const recipe of recipes) {
  for (const line of recipe.ingredients ?? []) {
    const name = String(line.name ?? "").trim();
    if (!name) continue;
    const { id, source, confident, name: overrideName } = canonicalIdFor(name);
    nameToId.set(name, id);

    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name,
        overrideName,
        idSource: source,
        confident,
        variants: new Map(),
        units: new Map(),
        amounts: [],
        recipeIds: new Set(),
        allergens: [],
        cookingAllergens: [],
      });
    }
    const entry = byId.get(id);
    entry.variants.set(name, (entry.variants.get(name) ?? 0) + 1);
    entry.units.set(line.unit, (entry.units.get(line.unit) ?? 0) + 1);
    if (typeof line.amount === "number") entry.amounts.push(line.amount);
    entry.recipeIds.add(recipe.id);
    // Unión de alérgenos de todas las variantes que colapsan en este id: si
    // "Queso" y "Queso vegano" cayeran juntos, la dirección segura es marcar.
    const { hard, cooking } = allergensForIngredientName(name);
    for (const a of hard) if (!entry.allergens.includes(a)) entry.allergens.push(a);
    for (const a of cooking) if (!entry.cookingAllergens.includes(a)) entry.cookingAllergens.push(a);
  }
}

// Nombre display = la variante más frecuente; alias = el resto.
for (const entry of byId.values()) {
  const sorted = [...entry.variants.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  // El nombre de display sale del override si lo hay (decisión revisada), y si
  // no de la variante más frecuente. Los alias son siempre TODAS las variantes
  // crudas distintas del display, para que ninguna se pierda.
  entry.name = entry.overrideName ?? sorted[0][0];
  // Los alias se deduplican POR FORMA NORMALIZADA, no por texto exacto. El
  // catálogo escribe el mismo producto con acentos o mayúsculas distintas
  // ("Queso gruyère" / "Queso Gruyère"), y como el resolutor busca por nombre
  // normalizado, ambos son la misma clave: dejarlos los dos genera dos filas
  // con la misma PK en ingredient_aliases y revienta el seed con
  // "ON CONFLICT DO UPDATE command cannot affect row a second time".
  // `sorted` viene por frecuencia, así que gana la grafía más usada.
  const seenLabels = new Set([normalizeName(entry.name)]);
  entry.aliases = [];
  for (const [variant] of sorted) {
    const key = normalizeName(variant);
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    entry.aliases.push(variant);
  }
  entry.allergens.sort();
  // Un alérgeno que ya está en el nivel duro por alguna variante no se repite
  // en el de cocinado.
  entry.cookingAllergens = entry.cookingAllergens.filter((a) => !entry.allergens.includes(a)).sort();
  entry.aisle = guessShoppingAisle(entry.name);
  entry.category = guessIngredientCategory(entry.name);
  const n = normalizeName(entry.name);
  entry.isVegetarian = !NON_VEGETARIAN_RE.test(n);
  entry.isVegan = entry.isVegetarian && !NON_VEGAN_RE.test(n);
  entry.conflictsWith = restrictionConflictsFor(entry.name);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. src/data/ingredients.json — el catálogo bundleado
//
// Ordenado por id, NO por frecuencia de uso: el fichero se regenera cada vez
// que cambia el catálogo de recetas, y ordenarlo por uso haría que añadir una
// receta reordenara medio fichero. Por id, el diff es solo lo que cambió.
//
// `recipeCount` / `_needsReview` y demás estadística NO va aquí: churnearía en
// cada regeneración y este fichero es sobre identidad, no sobre uso. Vive en
// output/ingredients-review.csv, que es donde se revisa.
// ─────────────────────────────────────────────────────────────────────────
const allEntries = [...byId.values()];

const catalog = allEntries
  .map((e) => ({
    id: e.id,
    name: e.name,
    aliases: e.aliases,
    aisle: e.aisle,
    category: e.category,
    allergens: e.allergens,
    cookingAllergens: e.cookingAllergens,
    conflictsWith: e.conflictsWith,
    isVegetarian: e.isVegetarian,
    isVegan: e.isVegan,
    defaultUnit: [...e.units.entries()].sort((a, b) => b[1] - a[1])[0][0],
    medianAmount: median(e.amounts),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

// Se valida ANTES de escribir: mejor fallar aquí con el error a la vista que
// dejar en disco un catálogo que reventará en el import del cliente.
const schemaErrors = validateIngredients(catalog);
if (schemaErrors.length > 0) {
  console.error(`❌ El catálogo generado no valida (${schemaErrors.length} error/es):`);
  for (const e of schemaErrors.slice(0, 25)) console.error(`  - ${e}`);
  if (schemaErrors.length > 25) console.error(`  … y ${schemaErrors.length - 25} más`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(ROOT, "src", "data", "ingredients.json"),
  `${JSON.stringify(catalog, null, 2)}\n`,
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────
// 2bis. src/data/ingredientSubstitutions.json (Fase 3)
//
// Las sustituciones se curan a mano en ingredient-substitutions.mjs; aquí solo
// se comprueban contra el catálogo real y se vuelcan. Un id que no exista es
// un error duro: una sustitución que apunta a un ingrediente inexistente no
// falla nunca, simplemente no se aplica — y "no se adapta" pasa desapercibido
// mucho más que "revienta".
// ─────────────────────────────────────────────────────────────────────────
const catalogIds = new Set(catalog.map((i) => i.id));
const subsErrors = [];
for (const sub of INGREDIENT_SUBSTITUTIONS) {
  if (!catalogIds.has(sub.ingredientId)) {
    subsErrors.push(`sustitución para un id inexistente: "${sub.ingredientId}"`);
  }
  if (sub.replacementId && !catalogIds.has(sub.replacementId)) {
    subsErrors.push(`replacementId inexistente: "${sub.replacementId}"`);
  }
}
for (const id of Object.keys(DELIBERATELY_NOT_SUBSTITUTABLE)) {
  if (!catalogIds.has(id)) {
    subsErrors.push(`DELIBERATELY_NOT_SUBSTITUTABLE apunta a un id inexistente: "${id}"`);
  }
}
if (subsErrors.length > 0) {
  console.error(`❌ Sustituciones inválidas (${subsErrors.length}):`);
  for (const e of subsErrors) console.error(`  - ${e}`);
  process.exit(1);
}

writeFileSync(
  join(ROOT, "src", "data", "ingredientSubstitutions.json"),
  `${JSON.stringify(
    [...INGREDIENT_SUBSTITUTIONS].sort(
      (a, b) =>
        a.ingredientId.localeCompare(b.ingredientId) || a.restriction.localeCompare(b.restriction),
    ),
    null,
    2,
  )}\n`,
  "utf8",
);

// La vista con estadística y procedencia, solo para los informes de revisión.
const draft = allEntries
  .sort((a, b) => b.recipeIds.size - a.recipeIds.size || a.id.localeCompare(b.id))
  .map((e) => ({
    id: e.id,
    name: e.name,
    aliases: e.aliases,
    aisle: e.aisle,
    allergens: e.allergens,
    cookingAllergens: e.cookingAllergens,
    isVegetarian: e.isVegetarian,
    isVegan: e.isVegan,
    defaultUnit: [...e.units.entries()].sort((a, b) => b[1] - a[1])[0][0],
    recipeCount: e.recipeIds.size,
    _idSource: e.idSource,
    _needsReview: !e.confident,
  }));

// ─────────────────────────────────────────────────────────────────────────
// 3. output/ingredients-review.csv
// ─────────────────────────────────────────────────────────────────────────
const reviewRows = draft.filter((d) => d._needsReview);
const csvHeader = [
  "id", "name", "aliases", "aisle", "allergens",
  "vegetariano", "vegano", "unidad", "recetas", "origen_id",
];
const csv = [
  csvHeader.join(","),
  ...reviewRows.map((d) =>
    [
      d.id, d.name, d.aliases.join(" | "), d.aisle,
      [...d.allergens, ...d.cookingAllergens.map((a) => `${a}(cocinado)`)].join(" "),
      d.isVegetarian ? "si" : "no", d.isVegan ? "si" : "no",
      d.defaultUnit, d.recipeCount, d._idSource,
    ].map(csvCell).join(","),
  ),
].join("\n");
writeFileSync(join(OUT_DIR, "ingredients-review.csv"), `${csv}\n`, "utf8");

// ─────────────────────────────────────────────────────────────────────────
// 3bis. output/ingredient-merges-review.csv — FUSIONES PELIGROSAS
//
// Un alias que cae en el mismo id canónico que su ingrediente principal PERO
// con alérgenos, pasillo o dieta distintos es casi siempre una fusión mala:
// la cascada de alias de ingredientImages.js está pensada para elegir un
// DIBUJO (un solomillo y un entrecot comparten ilustración), no para decidir
// que son el mismo producto. Ejemplos reales detectados aquí: "Caldo casero
// sin sal" absorbido por "Sal", "Aceite de trufa" por "Aceite de oliva".
//
// Esta lista es independiente de _needsReview: las fusiones peores vienen
// justamente del tramo "confiado" (id de arte), así que hay que mirarla aunque
// el ingrediente no esté marcado para revisión.
// ─────────────────────────────────────────────────────────────────────────
const flatAllergens = (name) => {
  const { hard, cooking } = allergensForIngredientName(name);
  return [...hard, ...cooking.map((a) => `${a}(cocinado)`)].join(" ");
};
const mergeRows = [];
for (const e of byId.values()) {
  const baseAllergens = flatAllergens(e.name);
  const baseAisle = guessShoppingAisle(e.name);
  const baseVeg = !NON_VEGETARIAN_RE.test(normalizeName(e.name));
  for (const alias of e.aliases) {
    const aAllergens = flatAllergens(alias);
    const aAisle = guessShoppingAisle(alias);
    const aVeg = !NON_VEGETARIAN_RE.test(normalizeName(alias));
    const reasons = [];
    if (aAllergens !== baseAllergens) reasons.push(`alergenos: "${aAllergens || "—"}" vs "${baseAllergens || "—"}"`);
    if (aAisle !== baseAisle) reasons.push(`pasillo: ${aAisle} vs ${baseAisle}`);
    if (aVeg !== baseVeg) reasons.push(`vegetariano: ${aVeg} vs ${baseVeg}`);
    if (reasons.length) {
      mergeRows.push({ id: e.id, canonical: e.name, alias, reasons: reasons.join(" · "), lines: e.variants.get(alias) });
    }
  }
}
const mergeCsv = [
  "id_canonico,ingrediente_canonico,alias_absorbido,motivo_sospecha,lineas",
  ...mergeRows
    .sort((a, b) => b.lines - a.lines)
    .map((m) => [m.id, m.canonical, m.alias, m.reasons, m.lines].map(csvCell).join(",")),
].join("\n");
writeFileSync(join(OUT_DIR, "ingredient-merges-review.csv"), `${mergeCsv}\n`, "utf8");

// ─────────────────────────────────────────────────────────────────────────
// 4. output/allergen-reconciliation.md
// ─────────────────────────────────────────────────────────────────────────
const missingByAllergen = new Map();
const cookingByAllergen = new Map();
const extraByAllergen = new Map();
const rows = [];
const cookingRows = [];

for (const recipe of recipes) {
  const declared = new Set((recipe.allergens ?? []).map(normalizeAllergenId));
  const computed = new Set();
  const cookingComputed = new Set();
  const evidence = new Map();
  const noteEvidence = (a, name) => {
    if (!evidence.has(a)) evidence.set(a, new Set());
    evidence.get(a).add(name);
  };
  for (const line of recipe.ingredients ?? []) {
    const { hard, cooking } = allergensForIngredientName(line.name);
    for (const a of hard) { computed.add(a); noteEvidence(a, line.name); }
    for (const a of cooking) { cookingComputed.add(a); noteEvidence(a, line.name); }
  }
  const missing = [...computed].filter((a) => !declared.has(a)).sort();
  const extra = [...declared].filter((a) => !computed.has(a) && !cookingComputed.has(a)).sort();
  // Nivel de cocinado: solo interesa lo que la receta NO declara ya y que
  // tampoco es un hallazgo duro. No es un fallo, es informativo.
  const cookingOnly = [...cookingComputed].filter((a) => !declared.has(a) && !computed.has(a)).sort();

  for (const a of missing) missingByAllergen.set(a, (missingByAllergen.get(a) ?? 0) + 1);
  for (const a of extra) extraByAllergen.set(a, (extraByAllergen.get(a) ?? 0) + 1);
  for (const a of cookingOnly) cookingByAllergen.set(a, (cookingByAllergen.get(a) ?? 0) + 1);

  if (missing.length || extra.length) rows.push({ recipe, missing, extra, evidence });
  if (cookingOnly.length) cookingRows.push({ recipe, cookingOnly, evidence });
}

const label = (id) => EU_ALLERGENS[id]?.label ?? id;
const lines = [];
lines.push("# Reconciliación de alérgenos — declarado vs. computado\n");
lines.push(
  `Generado por \`scripts/build-ingredient-catalog.mjs\` sobre ${recipes.length} recetas del catálogo bundleado.\n`,
);
lines.push("**Declarado** = campo `allergens` de la receta, normalizado con `normalizeAllergenId()`.");
lines.push(
  "**Computado** = unión de los alérgenos deducidos de los nombres de sus ingredientes (tabla `INGREDIENT_ALLERGEN_RULES` del script).\n",
);
lines.push("- **FALTA** = el ingrediente lo delata pero la receta no lo declara → riesgo potencial, es lo que hay que revisar.");
lines.push("- **SOBRA** = la receta lo declara pero ningún ingrediente lo justifica → declaración conservadora, o hueco de la tabla de reglas.\n");
lines.push(`Recetas con alguna discrepancia dura: **${rows.length} / ${recipes.length}**\n`);

lines.push("## Resumen por alérgeno\n");
lines.push("| Alérgeno | FALTA (recetas) | SOBRA (recetas) |");
lines.push("|---|---:|---:|");
const allIds = new Set([...missingByAllergen.keys(), ...extraByAllergen.keys()]);
const byMissing = [...allIds].sort(
  (a, b) => (missingByAllergen.get(b) ?? 0) - (missingByAllergen.get(a) ?? 0),
);
for (const id of byMissing) {
  lines.push(`| ${label(id)} | ${missingByAllergen.get(id) ?? 0} | ${extraByAllergen.get(id) ?? 0} |`);
}

lines.push("\n## Detalle por receta\n");
for (const { recipe, missing, extra, evidence } of rows) {
  lines.push(`### ${recipe.id} — ${recipe.name}`);
  lines.push(`\`${recipe._file}\` · declarado: ${(recipe.allergens ?? []).join(", ") || "—"}`);
  for (const a of missing) {
    const why = [...(evidence.get(a) ?? [])].join(", ");
    lines.push(`- **FALTA ${label(a)}** ← ${why}`);
  }
  for (const a of extra) lines.push(`- SOBRA ${label(a)}`);
  lines.push("");
}

// ── Nivel de cocinado ────────────────────────────────────────────────────
lines.push("## Sulfitos de cocinado\n");
lines.push("Segundo nivel, **no** es una discrepancia a corregir. Son recetas que llevan");
lines.push("vino, vinagre o un destilado de vino como ingrediente de cocinado: el alérgeno");
lines.push("existe, pero entra como un chorrito en un sofrito, no como algo que se coma");
lines.push("tal cual. Mismo tratamiento que `alcohol_cocina` en `intolerances.js` — la");
lines.push("receta no se excluye, se adapta.\n");
lines.push("Los encurtidos y desecados (aceitunas, pasas, pepinillos, conservas) NO están");
lines.push("aquí: en ésos el sulfito es aditivo del producto final y va al nivel duro.\n");
for (const [id, count] of cookingByAllergen) {
  lines.push(`- **${label(id)} de cocinado**: ${count} recetas`);
}
lines.push("");
for (const { recipe, cookingOnly, evidence } of cookingRows) {
  const detail = cookingOnly
    .map((a) => `${label(a)} ← ${[...(evidence.get(a) ?? [])].join(", ")}`)
    .join(" · ");
  lines.push(`- \`${recipe.id}\` ${recipe.name} — ${detail}`);
}
lines.push("");
writeFileSync(join(OUT_DIR, "allergen-reconciliation.md"), `${lines.join("\n")}\n`, "utf8");

// ─────────────────────────────────────────────────────────────────────────
// Resumen en consola
// ─────────────────────────────────────────────────────────────────────────
const totalLines = allEntries.reduce(
  (a, e) => a + [...e.variants.values()].reduce((x, y) => x + y, 0),
  0,
);
console.log(`Recetas leídas ............... ${recipes.length}`);
console.log(`Líneas de ingrediente ........ ${totalLines}`);
console.log(`Nombres crudos distintos ..... ${nameToId.size}`);
console.log(`Ingredientes canónicos ....... ${draft.length}`);
console.log(`  con id de arte curado ...... ${draft.filter((d) => !d._needsReview).length}`);
console.log(`  a revisar .................. ${reviewRows.length}`);
console.log(`Fusiones sospechosas ......... ${mergeRows.length}`);
console.log(`Recetas con discrepancia dura  ${rows.length} / ${recipes.length}`);
console.log(`Recetas con sulfitos cocinado  ${cookingRows.length}`);
console.log("");
console.log("Escritos:");
console.log("  src/data/ingredients.json");
console.log("  src/data/ingredientSubstitutions.json");
console.log("  output/ingredients-review.csv");
console.log("  output/ingredient-merges-review.csv");
console.log("  output/allergen-reconciliation.md");
