/**
 * Fase 8 — backfill de `user_pantry.ingredient_id` (migración 0039) para filas
 * de despensa creadas ANTES de que `addPantryItems`/`addLocalPantryItems`
 * empezaran a resolverlo en escritura. Idempotente: solo toca filas con
 * `ingredient_id is null`, así que relanzarlo tras uno interrumpido o tras
 * nuevas altas es seguro.
 *
 *   node --env-file=.env.local scripts/backfill-pantry-ingredient-ids.mjs [--dry-run] [--limit N]
 *
 * Env: SUPABASE_URL (o VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY (o
 * SUPABASE_SECRET_KEY) — RLS de user_pantry es por owner, así que un backfill
 * multi-usuario necesita el rol de servicio.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { createIngredientResolver } from "../src/lib/ingredientResolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const catalog = JSON.parse(readFileSync(join(ROOT, "src", "data", "ingredients.json"), "utf8"));
const { resolveIngredientId } = createIngredientResolver(catalog);

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit"));
const LIMIT = limitArg ? Number(limitArg.split("=")[1] ?? process.argv[process.argv.indexOf(limitArg) + 1]) : Infinity;
const PAGE = 500;

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("❌  Falta SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (pasa --env-file=.env.local)");
  process.exit(1);
}
const sb = createClient(url, key);

let scanned = 0, resolved = 0, unresolved = 0, updated = 0;
let from = 0;

console.log(`🔎  Backfill de ingredient_id en user_pantry${DRY_RUN ? " (--dry-run, sin escribir)" : ""}…\n`);

while (scanned < LIMIT) {
  const pageSize = Math.min(PAGE, LIMIT - scanned);
  const { data: rows, error } = await sb
    .from("user_pantry")
    .select("id, ingredient_name")
    .is("ingredient_id", null)
    .eq("item_type", "ingredient")
    .range(from, from + pageSize - 1);

  if (error) {
    console.error("❌  Lectura fallida:", error.message);
    process.exit(1);
  }
  if (!rows.length) break;

  const updates = [];
  for (const row of rows) {
    scanned++;
    const id = resolveIngredientId(row.ingredient_name);
    if (id) {
      resolved++;
      updates.push({ id: row.id, ingredient_id: id });
    } else {
      unresolved++;
    }
  }

  if (!DRY_RUN && updates.length) {
    // Una fila a la vez: son ids de filas distintas, no hay un upsert masivo
    // sensato sin arriesgar pisar otras columnas.
    for (const u of updates) {
      const { error: updErr } = await sb.from("user_pantry").update({ ingredient_id: u.ingredient_id }).eq("id", u.id);
      if (updErr) console.error(`❌  Fila ${u.id}:`, updErr.message);
      else updated++;
    }
  }

  console.log(`  … ${scanned} revisadas, ${resolved} resueltas, ${unresolved} sin match${DRY_RUN ? "" : `, ${updated} guardadas`}`);
  from += rows.length;
  if (rows.length < pageSize) break;
}

console.log(`\n✨  Hecho. revisadas=${scanned} resueltas=${resolved} sin_match=${unresolved}${DRY_RUN ? " (dry-run, nada escrito)" : ` guardadas=${updated}`}`);
