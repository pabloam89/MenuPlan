/**
 * generate-supabase-seed.mjs
 *
 * Reads the JSON recipe catalog (src/data/recipes/*.json), the dish image
 * manifest (src/assets/dishes/dishImages.json), and BUNDLED_CATALOG_VERSION
 * (src/data/catalogVersion.js) and generates two files — INSERT ... ON
 * CONFLICT DO UPDATE statements matching the schema in supabase/migrations/,
 * batched so each statement pastes cleanly into the Supabase SQL Editor
 * (which rejects very long single queries):
 *   - supabase/seed_recipes.sql — recipes + catalog_meta version bump
 *   - supabase/seed_dish_images.sql — dish_images
 * Two separate files (not two sections of one file) so they're easy to find
 * and can be run independently.
 *
 * This script does NOT connect to Supabase. It only writes .sql files for a
 * human to paste into the Supabase SQL Editor, so no DB credentials are ever
 * needed here.
 *
 * Usage:  node scripts/generate-supabase-seed.mjs
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
const IMAGES_PATH = join(ROOT, "src", "assets", "dishes", "dishImages.json");
const CATALOG_VERSION_PATH = join(ROOT, "src", "data", "catalogVersion.js");
const OUT_SETUP_PATH = join(ROOT, "supabase", "seed_0_setup.sql");
const OUT_RECIPES_PATH = join(ROOT, "supabase", "seed_recipes.sql");
const OUT_IMAGES_PATH = join(ROOT, "supabase", "seed_dish_images.sql");

// Cada INSERT reescribe filas ya existentes (re-seed, no solo alta inicial),
// así que va con ON CONFLICT DO UPDATE columna a columna — y en lotes de
// BATCH_SIZE filas por sentencia, porque una sola sentencia con las ~900
// recetas es demasiado larga para el editor SQL de Supabase.
const BATCH_SIZE = 10;

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlTextArray(arr) {
  if (!arr || arr.length === 0) return "'{}'";
  const escaped = arr.map((v) => String(v).replace(/"/g, '\\"').replace(/'/g, "''"));
  return `'{${escaped.map((v) => `"${v}"`).join(",")}}'`;
}

function sqlEnumArray(arr, castType) {
  if (!arr || arr.length === 0) return `'{}'::${castType}[]`;
  return `ARRAY[${arr.map((v) => sqlString(v)).join(",")}]::${castType}[]`;
}

function sqlJsonb(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

function sqlNumber(value) {
  if (value === null || value === undefined) return "NULL";
  return String(value);
}

function sqlBool(value) {
  return value ? "true" : "false";
}

function sqlNullableBool(value) {
  if (value === null || value === undefined) return "NULL";
  return sqlBool(value);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Sentencias INSERT ... ON CONFLICT (pk) DO UPDATE en lotes — cada lote es
// una sentencia completa e independiente, así que se puede pegar y ejecutar
// por partes en el editor SQL si hace falta.
function batchedUpsert({ rows, table, columns, pk, updateCols, batchSize = BATCH_SIZE }) {
  const out = [];
  for (const batch of chunk(rows, batchSize)) {
    out.push(`insert into ${table} (\n  ${columns.join(", ")}\n) values`);
    out.push(batch.join(",\n") + "");
    out.push(
      `on conflict (${pk}) do update set\n  ` +
        updateCols.map((c) => `${c} = excluded.${c}`).join(",\n  ") +
        ";",
    );
    out.push("");
  }
  return out;
}

const catalogVersionSrc = readFileSync(CATALOG_VERSION_PATH, "utf8");
const versionMatch = catalogVersionSrc.match(/BUNDLED_CATALOG_VERSION\s*=\s*(\d+)/);
const CATALOG_VERSION = versionMatch ? Number(versionMatch[1]) : 0;
if (!CATALOG_VERSION) {
  console.error("❌ No se pudo leer BUNDLED_CATALOG_VERSION de catalogVersion.js");
  process.exit(1);
}

const recipes = [];
for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const entries = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"));
  for (const r of entries) recipes.push(r);
}

// base_dish_id es una FK a la propia tabla, y el seed va partido en varios
// archivos que se ejecutan por separado: si una variante cayera en un archivo
// ANTERIOR al de su plato base, la FK fallaría. Los platos base primero lo
// garantiza (un plato base nunca tiene base_dish_id propio).
recipes.sort((a, b) => Number(Boolean(a.baseDishId)) - Number(Boolean(b.baseDishId)));
const recipeIndex = new Map(recipes.map((r, i) => [r.id, i]));
for (const r of recipes) {
  if (!r.baseDishId) continue;
  const baseIdx = recipeIndex.get(r.baseDishId);
  if (baseIdx === undefined) {
    console.error(`❌ "${r.id}" apunta a base_dish_id "${r.baseDishId}", que no existe en el catálogo.`);
    process.exit(1);
  }
  if (baseIdx > recipeIndex.get(r.id)) {
    console.error(`❌ "${r.id}" se emite antes que su base "${r.baseDishId}" — la FK fallaría.`);
    process.exit(1);
  }
}

// Los 4 enums que el catálogo alimenta, DERIVADOS DE LOS DATOS en vez de
// escritos a mano: cualquier valor nuevo en los JSON aparece aquí solo, así
// que el setup no puede volver a quedarse corto. Hace falta porque el estado
// real de la BD no coincide con las migraciones: la 0008 (desayunos/meriendas/
// postres, desayuno/merienda/postre) puede no haberse aplicado, y las salsas
// ('salsas' en recipe_category, 'salsa' en meal_role y recipe_type) no están
// en NINGUNA migración.
const ENUM_VALUES = {
  recipe_category: new Set(),
  main_protein: new Set(),
  meal_role: new Set(),
  recipe_type: new Set(),
  difficulty_level: new Set(),
  recipe_season: new Set(),
};
for (const r of recipes) {
  if (r.category) ENUM_VALUES.recipe_category.add(r.category);
  if (r.mainProtein) ENUM_VALUES.main_protein.add(r.mainProtein);
  for (const v of r.mealRole ?? []) ENUM_VALUES.meal_role.add(v);
  if (r.type) ENUM_VALUES.recipe_type.add(r.type);
  if (r.difficulty) ENUM_VALUES.difficulty_level.add(r.difficulty);
  if (r.season) ENUM_VALUES.recipe_season.add(r.season);
}

const recipeLines = [];
recipeLines.push("-- Auto-generated by scripts/generate-supabase-seed.mjs — do not edit by hand.");
recipeLines.push("-- Regenerate after changing src/data/recipes/*.json or catalogVersion.js.");
recipeLines.push("-- Idempotent: safe to re-run against a DB that already has this data (upsert by id).");
recipeLines.push("-- Run seed_0_setup.sql FIRST, as its own separate paste/Run in the SQL Editor —");
recipeLines.push("-- Postgres needs new enum values committed before a later query can use them,");
recipeLines.push("-- and the SQL Editor treats one whole paste as a single transaction, so the fix");
recipeLines.push("-- has to be a fully separate Run, not just earlier text in this same file.");
recipeLines.push("");
recipeLines.push("begin;");
recipeLines.push("");

const RECIPE_COLUMNS = [
  "id", "name", "category", "main_protein", "main_base", "meal_roles", "type",
  "base_dish_id", "required_appliance", "time_minutes", "difficulty", "season",
  "kcal", "protein_g", "carbs_g", "fat_g", "base_servings", "kid_friendly",
  "tupper_friendly", "allergens", "ingredients", "steps", "description", "methods",
  "product_aliases",
  // Ejes nuevos (supabase/migrations/0023_recipe_axes.sql) — antes no se
  // escribían aquí, así que el seed nunca los llevaba a producción aunque
  // ya estuvieran bien en el JSON del bundle.
  "apetecible", "montaje", "can_be_garnish", "main_ingredients", "sauce_id",
  // Se quedaron fuera de la migración 0023 y del seed hasta ahora (ver
  // 0024_recipe_extra_fields.sql) — rowToRecipe() las perdía en silencio para
  // cualquier receta servida desde Supabase.
  "extra_proteins", "freezable", "steps_rich",
];
const RECIPE_UPDATE_COLUMNS = RECIPE_COLUMNS.filter((c) => c !== "id");

// Tipo Postgres de cada columna (salvo id, ya existe como PK). No todas las
// migraciones que las añaden se han aplicado siempre a todos los entornos
// (se vio con product_aliases, de la migración 0008) — en vez de perseguir
// cuál falta cada vez que cambia el error, el seed se auto-repara: añade
// cualquier columna que falte con IF NOT EXISTS antes de insertar.
// Tipos EXACTOS de supabase/migrations/0001_recipe_catalog.sql — las columnas
// de enum son su enum, no text, y los nutricionales son numeric, no integer.
const RECIPE_COLUMN_TYPES = {
  name: "text", category: "recipe_category", main_protein: "main_protein",
  main_base: "text", meal_roles: "meal_role[]", type: "recipe_type",
  base_dish_id: "text", required_appliance: "text", time_minutes: "integer",
  difficulty: "difficulty_level", season: "recipe_season",
  kcal: "numeric", protein_g: "numeric", carbs_g: "numeric", fat_g: "numeric",
  base_servings: "integer", kid_friendly: "boolean",
  tupper_friendly: "boolean", allergens: "text[]", ingredients: "jsonb",
  steps: "text[]", description: "text", methods: "jsonb",
  product_aliases: "text[]", apetecible: "boolean", montaje: "boolean",
  can_be_garnish: "boolean", main_ingredients: "text[]", sauce_id: "text",
  extra_proteins: "main_protein[]", freezable: "boolean", steps_rich: "jsonb",
};

const recipeRows = recipes.map((r) => {
  return `  (${sqlString(r.id)}, ${sqlString(r.name)}, ${sqlString(r.category)}, ${sqlString(r.mainProtein)}, ` +
    `${sqlString(r.mainBase)}, ${sqlEnumArray(r.mealRole, "meal_role")}, ${sqlString(r.type)}, ` +
    `${sqlString(r.baseDishId)}, ${sqlString(r.requiredAppliance)}, ${sqlNumber(r.time)}, ${sqlString(r.difficulty)}, ` +
    `${sqlString(r.season)}, ${sqlNumber(r.kcal)}, ${sqlNumber(r.protein_g)}, ${sqlNumber(r.carbs_g)}, ` +
    `${sqlNumber(r.fat_g)}, ${sqlNumber(r.baseServings)}, ${sqlBool(r.kidFriendly)}, ${sqlBool(r.tupperFriendly)}, ` +
    `${sqlTextArray(r.allergens)}, ${sqlJsonb(r.ingredients)}, ${sqlTextArray(r.steps)}, ${sqlString(r.description)}, ` +
    `${sqlJsonb(r.methods)}, ${sqlTextArray(r.productAliases)}, ` +
    `${sqlNullableBool(r.apetecible)}, ${sqlNullableBool(r.montaje)}, ${sqlNullableBool(r.canBeGarnish)}, ` +
    `${sqlTextArray(r.mainIngredients)}, ${sqlString(r.sauceId)}, ` +
    `${sqlEnumArray(r.extraProteins, "main_protein")}, ${sqlNullableBool(r.freezable)}, ${sqlJsonb(r.stepsRich)})`;
});

// Setup: un archivo APARTE que hay que pegar y ejecutar solo, ANTES que los
// 4 de recetas — no como texto anterior en el mismo archivo. El SQL Editor
// de Supabase corre todo lo pegado de una vez como una única transacción, así
// que un `alter type ... add value` seguido de un INSERT que ya use ese valor
// en el MISMO pegado revienta con "unsafe use of new value ... must be
// committed before they can be used" aunque el ALTER esté antes en el texto.
// Separándolo en su propio Run, Postgres lo confirma de verdad antes de que
// las inserciones (en otro Run posterior) lo necesiten.
const setupLines = [];
setupLines.push("-- Auto-generated by scripts/generate-supabase-seed.mjs — do not edit by hand.");
setupLines.push("-- RUN THIS FILE FIRST, on its own — paste it and click Run by itself, before");
setupLines.push("-- any of the seed_recipes_N_de_4.sql files. Idempotent, safe to re-run.");
setupLines.push("");
setupLines.push("-- Enums: TODOS los valores que usa el catálogo, derivados de los propios");
setupLines.push("-- JSON. El estado real de la BD no coincide con las migraciones — la 0008");
setupLines.push("-- (desayunos/meriendas/postres) puede no estar aplicada, y las salsas no");
setupLines.push("-- están en ninguna migración.");
for (const [enumName, values] of Object.entries(ENUM_VALUES)) {
  for (const v of [...values].sort()) {
    setupLines.push(`alter type ${enumName} add value if not exists '${v}';`);
  }
}
setupLines.push("");
setupLines.push("-- recipes: columnas de migraciones que este entorno puede no tener aplicadas");
setupLines.push("-- (se vio con product_aliases, de la 0008) — no toca las que ya existen.");
for (const col of RECIPE_UPDATE_COLUMNS) {
  setupLines.push(`alter table recipes add column if not exists ${col} ${RECIPE_COLUMN_TYPES[col]};`);
}
setupLines.push("");
writeFileSync(OUT_SETUP_PATH, setupLines.join("\n"), "utf8");
console.log(`✅ Generado ${OUT_SETUP_PATH} — ejecútalo solo, primero, antes de los seed_recipes_*`);

// 4 archivos en vez de 1 — cada uno se pega y ejecuta entero de una sola vez
// en el SQL Editor (dentro lleva sus propias sentencias pequeñas por lote,
// así que sigue sin chocar con el límite de tamaño por sentencia), pero solo
// son 4 copiar-pegar en vez de una tabla gigante o decenas de bloques sueltos.
const RECIPE_PARTS = 4;
const recipeRowParts = chunk(recipeRows, Math.ceil(recipeRows.length / RECIPE_PARTS));

recipeRowParts.forEach((partRows, i) => {
  const partLines = [...recipeLines];
  partLines.push(
    ...batchedUpsert({
      rows: partRows,
      table: "recipes",
      columns: RECIPE_COLUMNS,
      pk: "id",
      updateCols: RECIPE_UPDATE_COLUMNS,
    }),
  );
  // La versión de catálogo se sube solo en la última parte, para que no
  // quede marcada como "lista" hasta que las 4 se hayan ejecutado.
  if (i === recipeRowParts.length - 1) {
    partLines.push("insert into catalog_meta (id, version) values");
    partLines.push(`  ('recipes', ${CATALOG_VERSION})`);
    partLines.push("on conflict (id) do update set version = excluded.version, updated_at = now();");
    partLines.push("");
  }
  partLines.push("commit;");
  partLines.push("");

  const partPath = OUT_RECIPES_PATH.replace(/\.sql$/, `_${i + 1}_de_${recipeRowParts.length}.sql`);
  writeFileSync(partPath, partLines.join("\n"), "utf8");
  console.log(`✅ Generado ${partPath} (${partRows.length} recetas)`);
});
console.log(`   ${recipes.length} recetas en total, versión de catálogo: v${CATALOG_VERSION}, ${RECIPE_PARTS} archivos`);

let imageCount = 0;
if (existsSync(IMAGES_PATH)) {
  const manifest = JSON.parse(readFileSync(IMAGES_PATH, "utf8"));
  const entries = Object.entries(manifest);
  imageCount = entries.length;
  if (entries.length > 0) {
    const imageLines = [];
    imageLines.push("-- Auto-generated by scripts/generate-supabase-seed.mjs — do not edit by hand.");
    imageLines.push("-- Regenerate after changing src/assets/dishes/dishImages.json.");
    imageLines.push("-- Idempotent: safe to re-run against a DB that already has this data (upsert by combo_id).");
    imageLines.push("-- RUN THIS LAST, after the 4 seed_recipes files: dish_images.recipe_id and");
    imageLines.push("-- .garnish_id are foreign keys to recipes(id), so las recetas tienen que");
    imageLines.push("-- existir ya o la FK falla.");
    imageLines.push("");
    imageLines.push("begin;");
    imageLines.push("");

    const imageRows = entries.map(([comboId, url]) => {
      const plus = comboId.indexOf("+");
      const recipeId = plus === -1 ? comboId : comboId.slice(0, plus);
      const garnishId = plus === -1 ? null : comboId.slice(plus + 1);
      return `  (${sqlString(comboId)}, ${sqlString(recipeId)}, ${sqlString(garnishId)}, ${sqlString(url)})`;
    });
    imageLines.push(
      ...batchedUpsert({
        rows: imageRows,
        table: "dish_images",
        columns: ["combo_id", "recipe_id", "garnish_id", "image_url"],
        pk: "combo_id",
        updateCols: ["recipe_id", "garnish_id", "image_url"],
      }),
    );

    imageLines.push("commit;");
    imageLines.push("");

    writeFileSync(OUT_IMAGES_PATH, imageLines.join("\n"), "utf8");
    console.log(`✅ Generado ${OUT_IMAGES_PATH}`);
    console.log(`   ${imageCount} imágenes, ${Math.ceil(imageCount / BATCH_SIZE)} sentencias`);
  }
}
