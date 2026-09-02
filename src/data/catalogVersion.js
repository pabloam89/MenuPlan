// Bundled catalog version — the anti-degradation "gate".
//
// The reviewed JSON in src/data/recipes/*.json is versioned by this integer.
// Supabase's `recipes` table is allowed to override the bundled catalog ONLY
// when its stored version (catalog_meta.version) is >= this number. If the DB
// is behind (an older seed that predates, say, an allergen fix), the app falls
// back to the bundled JSON instead of silently serving stale, medically
// relevant data. See src/data/recipeCatalog.js.
//
// BUMP THIS whenever you change src/data/recipes/*.json in a way that must
// reach production, then regenerate + apply the seed
// (scripts/generate-supabase-seed.mjs) so Supabase's catalog_meta.version
// matches. Forgetting to push just means the app keeps using the (correct)
// bundled JSON — safe by design.
// v19 (2026-09-01): 63 alérgenos añadidos a 60 recetas por
// scripts/apply-allergen-findings.mjs — gluten de la salsa de soja, sulfitos de
// encurtidos y desecados, huevo de la pasta al huevo, apio, mostaza, pescado y
// lactosa. Médicamente relevante: hasta que la seed llegue a Supabase, este
// número es lo único que impide que la BD sirva las declaraciones viejas.
export const BUNDLED_CATALOG_VERSION = 19;
