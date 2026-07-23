-- Catches up the Supabase catalog schema with two additions already live in
-- the bundled JSON catalog (src/data/recipes/*.json + recipeSchema.js) that
-- Supabase's `recipe_category` / `meal_role` enums never learned about:
--
-- 1. The "desayunos"/"meriendas"/"postres" categories and their matching
--    "desayuno"/"merienda"/"postre" roles (added when breakfast/snack/
--    dessert support was wired up). Until this runs, syncing the current
--    catalog to Supabase (scripts/generate-supabase-seed.mjs) — or a user
--    saving a custom recipe of one of these categories to `user_recipes` —
--    would fail outright: Postgres rejects any value outside an enum's
--    fixed list. The app has been silently safe so far only because
--    catalog_meta.version has stayed behind BUNDLED_CATALOG_VERSION, which
--    makes the client always fall back to the bundled JSON (see
--    src/data/recipeCatalog.js) — this migration removes that landmine so
--    the remote catalog can be re-enabled later without breaking on these
--    recipes.
--
-- 2. `product_aliases`, mirroring the new optional `productAliases` field on
--    RecipeSchema: names a dish is also commonly sold as a ready-made
--    product under (e.g. "Natillas caseras" -> "Natillas"), so the receipt/
--    pantry ingredient dictionary (lib/priceHistory.js) can recognise the
--    store-bought version of a dish that's normally only ever cooked from
--    scratch. Nullable/defaulted — existing rows are unaffected.
--
-- Run this in: Supabase Dashboard → SQL Editor → staging project → Run.
-- IMPORTANT: run the ALTER TYPE statements as plain top-level statements
-- (no surrounding BEGIN/COMMIT) — Postgres forbids using a brand-new enum
-- value inside the same transaction that added it, and the SQL editor runs
-- pasted scripts un-wrapped (autocommit per statement) by default, so this
-- is safe as-is; just don't paste it inside an explicit transaction block.

alter type recipe_category add value if not exists 'desayunos';
alter type recipe_category add value if not exists 'meriendas';
alter type recipe_category add value if not exists 'postres';

alter type meal_role add value if not exists 'desayuno';
alter type meal_role add value if not exists 'merienda';
alter type meal_role add value if not exists 'postre';

alter table recipes add column if not exists product_aliases text[];
alter table user_recipes add column if not exists product_aliases text[];
