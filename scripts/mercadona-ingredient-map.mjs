/**
 * PoC: map MenuPlan ingredients ↔ Mercadona food catalog (~4.5k SKUs).
 *
 *   node scripts/mercadona-ingredient-map.mjs
 *   node scripts/mercadona-ingredient-map.mjs --cache   # reuse output/mercadona-catalog.json
 *   node scripts/mercadona-ingredient-map.mjs --all     # include non-food aisles too
 *
 * Output:
 *   output/mercadona-catalog.json
 *   output/mercadona-ingredient-map.json
 *   summary printed to stdout
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "output");
const CATALOG_PATH = join(OUT_DIR, "mercadona-catalog.json");
const MAP_PATH = join(OUT_DIR, "mercadona-ingredient-map.json");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");

const API = "https://tienda.mercadona.es/api";
const USE_CACHE = process.argv.includes("--cache");
const ALL_CATEGORIES = process.argv.includes("--all");

// Mercadona top-level sections that are not grocery / cooking ingredients.
const NON_FOOD_TOP_IDS = new Set([
  21, // Cuidado del cabello
  20, // Cuidado facial y corporal
  23, // Fitoterapia y parafarmacia
  26, // Limpieza y hogar
  22, // Maquillaje
  25, // Mascotas
]);

const FOOD_TOP_IDS = null; // filled after first fetch when --all

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function tokenize(s) {
  return new Set(
    String(s ?? "")
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ""))
      .filter((t) => t.length > 1)
  );
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function tokensNear(a, b) {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  const lenDiff = Math.abs(a.length - b.length);
  if (maxLen < 4) return false;
  if (maxLen < 7) return lenDiff === 0 && levenshtein(a, b) <= 1;
  if (lenDiff > 1) return false;
  return levenshtein(a, b) <= 2;
}

function tokenOverlap(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of a) {
    if (b.has(t)) {
      hit++;
      continue;
    }
    for (const bt of b) {
      if (tokensNear(t, bt)) {
        hit++;
        break;
      }
    }
  }
  return (2 * hit) / (a.size + b.size);
}

function containsWholePhrase(haystack, needle) {
  if (!needle) return false;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(haystack);
}

function matchLine(rawName, dict) {
  const norm = normalizeName(rawName);
  if (!norm) return { ingredientId: null, name: null, confidence: 0 };

  const exact = dict.find((d) => d.id === norm);
  if (exact) return { ingredientId: exact.id, name: exact.name, confidence: 1 };

  const lineTokens = tokenize(norm);
  let best = null;
  let bestScore = 0;
  for (const d of dict) {
    let score = tokenOverlap(lineTokens, d.tokens);
    if (containsWholePhrase(norm, d.id) || containsWholePhrase(d.id, norm)) {
      score = Math.max(score, 0.75);
    }
    if (
      score > bestScore ||
      (score === bestScore && score > 0 && d.tokens.size > (best?.tokens.size ?? 0))
    ) {
      bestScore = score;
      best = d;
    }
  }
  if (best && bestScore >= 0.4) {
    return {
      ingredientId: best.id,
      name: best.name,
      confidence: Math.min(0.95, bestScore),
    };
  }
  return { ingredientId: null, name: null, confidence: 0 };
}

function loadSupplementalIngredients() {
  const ph = readFileSync(join(ROOT, "src", "lib", "priceHistory.js"), "utf8");
  const block = ph.split("const SUPPLEMENTAL_INGREDIENTS = [")[1]?.split("];")[0] ?? "";
  return [...block.matchAll(/^\s*"([^"]+)"/gm)].map((m) => m[1]);
}

// Extra search terms when matching recipe ingredient → Mercadona product name.
const MERCADONA_SEARCH_ALIASES = {
  boniato: ["batata"],
  espaguetis: ["spaghetti"],
  cuscus: ["cous cous"],
  calamares: ["calamar"],
  gambas: ["gamba"],
  judiones: ["alubia grande", "alubia blanca"],
  fabes: ["alubia grande", "fabada"],
  "fideos n°2": ["fideo mediano", "fideo grueso"],
  "escalopines de ternera": ["escalopin de vacuno", "escalopin"],
  "pescadilla en lomos": ["pescadilla de merluza", "pescadilla"],
  "rosada en lomos": ["merluza en lomos", "lomo de merluza"],
  lombarda: ["col lombarda", "repollo morado"],
  maicena: ["fecula de maiz", "maizena"],
  "alubias de bote": ["alubia cocida blanca", "alubia cocida"],
  tirabuzones: ["fusilli", "helices", "espiral"],
  nabo: ["nabo"],
};

function loadMenuPlanIngredients() {
  const map = new Map();
  for (const file of readdirSync(RECIPES_DIR)) {
    if (!file.endsWith(".json")) continue;
    const entries = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"));
    for (const recipe of entries) {
      for (const ing of recipe?.ingredients ?? []) {
        const id = normalizeName(ing.name);
        if (id && !map.has(id)) map.set(id, ing.name);
      }
      for (const alias of recipe?.productAliases ?? []) {
        const id = normalizeName(alias);
        if (id && !map.has(id)) map.set(id, alias);
      }
    }
  }
  for (const name of loadSupplementalIngredients()) {
    const id = normalizeName(name);
    if (id && !map.has(id)) map.set(id, name);
  }
  return [...map.entries()].map(([id, name]) => ({
    id,
    name,
    tokens: tokenize(id),
  }));
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MenuPlan-PoC/1.0" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function extractProducts(node, ctx, out) {
  for (const p of node?.products ?? []) {
    if (!p?.id || !p?.display_name) continue;
    const price = p.price_instructions?.unit_price ?? null;
    const unitSize = p.price_instructions?.unit_size ?? null;
    const unitFormat = p.price_instructions?.size_format ?? null;
    out.push({
      id: String(p.id),
      name: p.display_name,
      slug: p.slug ?? null,
      price,
      unitSize,
      unitFormat,
      bulkPrice: p.price_instructions?.bulk_price ?? null,
      section: ctx.section,
      category: ctx.category,
      subcategory: ctx.subcategory,
    });
  }
  for (const sub of node?.categories ?? []) {
    extractProducts(sub, { ...ctx, subcategory: sub.name }, out);
  }
}

async function downloadCatalog() {
  const top = await fetchJson(`${API}/categories/`);
  const leafIds = [];
  const sectionByLeaf = new Map();

  for (const section of top.results ?? []) {
    if (!ALL_CATEGORIES && NON_FOOD_TOP_IDS.has(section.id)) continue;
    for (const cat of section.categories ?? []) {
      leafIds.push(cat.id);
      sectionByLeaf.set(cat.id, {
        section: section.name,
        category: cat.name,
      });
    }
  }

  const products = [];
  const concurrency = 8;
  for (let i = 0; i < leafIds.length; i += concurrency) {
    const batch = leafIds.slice(i, i + concurrency);
    const pages = await Promise.all(
      batch.map((id) => fetchJson(`${API}/categories/${id}/`).catch(() => null))
    );
    for (let j = 0; j < pages.length; j++) {
      const page = pages[j];
      if (!page) continue;
      const ctx = sectionByLeaf.get(batch[j]) ?? {};
      extractProducts(page, ctx, products);
    }
    if (i + concurrency < leafIds.length) await sleep(120);
    process.stdout.write(`\r  Descargando categorías… ${Math.min(i + concurrency, leafIds.length)}/${leafIds.length}`);
  }
  process.stdout.write("\n");

  const byId = new Map();
  for (const p of products) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  return {
    fetchedAt: new Date().toISOString(),
    leafCategories: leafIds.length,
    productCount: byId.size,
    products: [...byId.values()],
  };
}

function bestProductsForIngredient(ingredient, products, limit = 3) {
  const searchNames = [
    ingredient.name,
    ...(MERCADONA_SEARCH_ALIASES[ingredient.id] ?? []),
  ];
  const hits = [];
  const seen = new Set();
  for (const term of searchNames) {
    const probe = {
      id: normalizeName(term),
      name: term,
      tokens: tokenize(normalizeName(term)),
    };
    for (const p of products) {
      if (seen.has(p.id)) continue;
      const m = matchLine(p.name, [probe]);
      if (m.confidence >= 0.4) {
        seen.add(p.id);
        hits.push({ product: p, confidence: m.confidence, via: term });
      }
    }
  }
  hits.sort((a, b) => b.confidence - a.confidence || (a.product.price ?? 999) - (b.product.price ?? 999));
  return hits.slice(0, limit);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log("MenuPlan ↔ Mercadona — mapeo PoC\n");

  const ingredients = loadMenuPlanIngredients();
  console.log(`Ingredientes MenuPlan (catálogo JSON): ${ingredients.length}`);

  let catalog;
  if (USE_CACHE && existsSync(CATALOG_PATH)) {
    catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
    console.log(`Catálogo Mercadona (cache): ${catalog.productCount} productos (${catalog.fetchedAt})`);
  } else {
    console.log("Descargando catálogo Mercadona (solo alimentación)…");
    catalog = await downloadCatalog();
    writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
    console.log(`Guardado → ${CATALOG_PATH}`);
  }

  const products = catalog.products;

  // Product → ingredient (same logic as receipt OCR)
  const productMatches = [];
  let auto = 0;
  let weak = 0;
  let none = 0;
  for (const p of products) {
    const m = matchLine(p.name, ingredients);
    if (m.confidence >= 0.7) auto++;
    else if (m.confidence >= 0.4) weak++;
    else none++;
    productMatches.push({
      productId: p.id,
      productName: p.name,
      price: p.price,
      section: p.section,
      ingredientId: m.ingredientId,
      ingredientName: m.name,
      confidence: m.confidence,
    });
  }

  // Ingredient → best Mercadona SKU(s)
  const ingredientMatches = ingredients.map((ing) => {
    const picks = bestProductsForIngredient(ing, products);
    return {
      ingredientId: ing.id,
      ingredientName: ing.name,
      matchCount: picks.length,
      best: picks[0]
        ? {
            productId: picks[0].product.id,
            productName: picks[0].product.name,
            price: picks[0].product.price,
            confidence: picks[0].confidence,
          }
        : null,
      alternatives: picks.slice(1).map((h) => ({
        productId: h.product.id,
        productName: h.product.name,
        price: h.product.price,
        confidence: h.confidence,
      })),
    };
  });

  const withMatch = ingredientMatches.filter((r) => r.best);
  const noMatch = ingredientMatches.filter((r) => !r.best);

  const report = {
    generatedAt: new Date().toISOString(),
    catalogFetchedAt: catalog.fetchedAt,
    stats: {
      mercadonaProducts: products.length,
      menuPlanIngredients: ingredients.length,
      productsAutoMatched: auto,
      productsWeakMatched: weak,
      productsUnmatched: none,
      ingredientsWithSku: withMatch.length,
      ingredientsWithoutSku: noMatch.length,
      ingredientCoveragePct: Math.round((withMatch.length / ingredients.length) * 1000) / 10,
      productMatchPct: Math.round(((auto + weak) / products.length) * 1000) / 10,
    },
    unmatchedIngredients: noMatch.map((r) => r.ingredientName).sort(),
    sampleUnmatchedProducts: productMatches
      .filter((r) => r.confidence < 0.4)
      .slice(0, 40)
      .map((r) => r.productName),
    ingredientMatches,
    productMatches,
  };

  writeFileSync(MAP_PATH, JSON.stringify(report, null, 2));

  const s = report.stats;
  console.log("\n── Resultados ──");
  console.log(`Productos Mercadona (alimentación): ${s.mercadonaProducts}`);
  console.log(`Producto → ingrediente ≥0.7: ${s.productsAutoMatched} (${Math.round((s.productsAutoMatched / s.mercadonaProducts) * 100)}%)`);
  console.log(`Producto → ingrediente 0.4–0.7: ${s.productsWeakMatched}`);
  console.log(`Producto sin match: ${s.productsUnmatched}`);
  console.log(`Ingrediente → al menos 1 SKU: ${s.ingredientsWithSku}/${s.menuPlanIngredients} (${s.ingredientCoveragePct}%)`);
  console.log(`\nJSON completo → ${MAP_PATH}`);

  console.log("\n── Ingredientes sin SKU (primeros 25) ──");
  for (const name of report.unmatchedIngredients.slice(0, 25)) {
    console.log(`  · ${name}`);
  }

  console.log("\n── Ejemplos de match (ingrediente → producto más barato) ──");
  for (const row of withMatch.slice(0, 12)) {
    const b = row.best;
    console.log(`  ${row.ingredientName} → ${b.productName} (${b.price ?? "?"} €, conf ${b.confidence.toFixed(2)})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
