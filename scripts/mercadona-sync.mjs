/**
 * Weekly Mercadona catalog sync → public/store/mercadona.json (+ optional Supabase).
 *
 *   node scripts/mercadona-sync.mjs
 *   node scripts/mercadona-sync.mjs --cache   # reuse output/mercadona-catalog.json
 *
 * Env (optional):
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → upsert store_products
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { downloadMercadonaCatalog } from "./lib/mercadonaFetch.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE_PATH = join(ROOT, "output", "mercadona-catalog.json");
const PUBLIC_PATH = join(ROOT, "public", "store", "mercadona.json");
const USE_CACHE = process.argv.includes("--cache");
const BATCH = 500;

function slimCatalog(full) {
  return {
    store: "mercadona",
    fetchedAt: full.fetchedAt,
    productCount: full.productCount ?? full.products?.length ?? 0,
    products: (full.products ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price ?? null,
      unitSize: p.unitSize ?? null,
      unitFormat: p.unitFormat ?? null,
      bulkPrice: p.bulkPrice ?? null,
      section: p.section ?? null,
      category: p.category ?? null,
    })),
  };
}

async function upsertSupabase(catalog) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.log("Supabase: skip (no SUPABASE_URL + SERVICE_ROLE_KEY)");
    return;
  }

  const sb = createClient(url, key);
  const fetchedAt = catalog.fetchedAt;
  const rows = catalog.products.map((p) => ({
    store: "mercadona",
    product_id: p.id,
    name: p.name,
    price: p.price,
    unit_size: p.unitSize,
    unit_format: p.unitFormat,
    bulk_price: p.bulkPrice,
    section: p.section,
    category: p.category,
    subcategory: p.subcategory ?? null,
    fetched_at: fetchedAt,
  }));

  console.log(`Supabase: upserting ${rows.length} rows…`);
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await sb.from("store_products").upsert(chunk, {
      onConflict: "store,product_id",
    });
    if (error) throw new Error(`Supabase upsert: ${error.message}`);
    process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
}

async function main() {
  mkdirSync(join(ROOT, "public", "store"), { recursive: true });
  mkdirSync(join(ROOT, "output"), { recursive: true });

  console.log("Mercadona sync\n");

  let full;
  if (USE_CACHE && existsSync(CACHE_PATH)) {
    full = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    console.log(`Cache: ${full.productCount} products (${full.fetchedAt})`);
  } else {
    console.log("Downloading food catalog…");
    full = await downloadMercadonaCatalog({ foodOnly: true });
    writeFileSync(CACHE_PATH, JSON.stringify(full, null, 2));
    console.log(`Saved cache → ${CACHE_PATH}`);
  }

  const bundle = slimCatalog(full);
  writeFileSync(PUBLIC_PATH, JSON.stringify(bundle));
  const kb = Math.round(readFileSync(PUBLIC_PATH).length / 1024);
  console.log(`Bundle → ${PUBLIC_PATH} (${kb} KB, ${bundle.productCount} products)`);

  await upsertSupabase(full);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
