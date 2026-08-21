/**
 * Fetch Mercadona food catalog from tienda.mercadona.es (unofficial API).
 * Shared by mercadona-sync.mjs and mercadona-ingredient-map.mjs.
 */

const API = "https://tienda.mercadona.es/api";

export const NON_FOOD_TOP_IDS = new Set([
  21, 20, 23, 26, 22, 25,
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MenuPlan-StoreSync/1.0" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function extractProducts(node, ctx, out) {
  for (const p of node?.products ?? []) {
    if (!p?.id || !p?.display_name) continue;
    const pi = p.price_instructions ?? {};
    out.push({
      id: String(p.id),
      name: p.display_name,
      slug: p.slug ?? null,
      price: pi.unit_price ?? null,
      unitSize: pi.unit_size ?? null,
      unitFormat: pi.size_format ?? null,
      bulkPrice: pi.bulk_price ?? null,
      section: ctx.section,
      category: ctx.category,
      subcategory: ctx.subcategory,
    });
  }
  for (const sub of node?.categories ?? []) {
    extractProducts(sub, { ...ctx, subcategory: sub.name }, out);
  }
}

/**
 * @param {{ foodOnly?: boolean }} [opts]
 */
export async function downloadMercadonaCatalog({ foodOnly = true } = {}) {
  const top = await fetchJson(`${API}/categories/`);
  const leafIds = [];
  const sectionByLeaf = new Map();

  for (const section of top.results ?? []) {
    if (foodOnly && NON_FOOD_TOP_IDS.has(section.id)) continue;
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
      batch.map((id) => fetchJson(`${API}/categories/${id}/`).catch(() => null)),
    );
    for (let j = 0; j < pages.length; j++) {
      const page = pages[j];
      if (!page) continue;
      extractProducts(page, sectionByLeaf.get(batch[j]) ?? {}, products);
    }
    if (i + concurrency < leafIds.length) await sleep(120);
  }

  const byId = new Map();
  for (const p of products) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }

  return {
    store: "mercadona",
    fetchedAt: new Date().toISOString(),
    leafCategories: leafIds.length,
    productCount: byId.size,
    products: [...byId.values()],
  };
}
