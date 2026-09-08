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
// v20 (2026-09-03): campo `occasion` en 15 platos de ocasión (marisco de
// ración, arroces de bogavante, paella de marisco, ragú de pato) y las dos
// recetas de orzo fuera del Recetario Estrella. Sin subir este número no
// habrían llegado a producción: Supabase estaba ya en 19, o sea EMPATADO con
// el bundle, así que la nube ganaba y el JSON editado no se leía. Es
// exactamente el caso para el que existe esta puerta.
// v21 (2026-09-04): cuatro ejes rellenados. `mainIngredients` pasa de 6
// recetas a 398 con verdura, 279 con lácteo, 67 fruta, 52 frutos secos, 45
// setas y 32 encurtidos — derivado de la cantidad POR RACIÓN de cada
// ingrediente, no de su presencia (scripts/derive-main-ingredients.mjs).
// `montaje` 58 → 110, `occasion` 15 → 45, y tres ejes nuevos: `kidFavourite`
// (62), `tecnica` (olla 298 / sartén 225 / horno 156 / crudo 110 / plancha 82)
// y `cocina` (italiana 74, mediterránea 20, mexicana 9, asiática 8; ausente =
// española). Ver scripts/mark-catalog-axes.mjs y, para saber si cada eje da
// para servir una petición sin repetir plato, scripts/axis-coverage.mjs.
// v26 (2026-09-07): `estrella: true` en los 20 sólidos de bebé. Entraron en
// v25 sin la marca, y el Recetario Estrella es el único catálogo elegible
// (ver onlyPrimaryCatalog en CatalogBrowserSheet y isPrimaryCatalog en
// filterRecipes), así que la teja "Sólidos de bebé" salía a CERO en
// producción con las 20 recetas ahí, empaquetadas y sin poder verse.
//
// Que solo lleguen a los bebés que ya comen sólido lo garantiza el filtro por
// etapa (filterRecipes.js:252), no la estrella: son dos puertas distintas y
// esta solo abre la de "existe en el catálogo".
//
// v27 (2026-09-08): segunda tanda de sólidos de bebé (bebes_043 → bebes_062),
// con `estrella: true` puesta DESDE EL PRINCIPIO — el fallo de v25/v26 fue
// justo ese, y repetirlo habría vuelto a dejar la teja a cero.
//
// Además, `methods[]` en las 59 recetas de bebé, que estaban a cero mientras
// carnes iba 140/159. Los aparatos se reparten como tienen que repartirse:
// airfryer 0 en cremas y 29 en sólidos, thermomix y olla exprés al revés.
// El prompt de bebés es propio (gen-appliance-methods.mjs): el genérico dice
// "chef experto en cocina española" y devolvía "salpimentar" en el resumen
// que lee un padre.
//
// Sin subir este número no llegan a producción: Supabase está en 26 y empate
// significa que gana la nube.
export const BUNDLED_CATALOG_VERSION = 27;
