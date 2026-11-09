/**
 * Fetch Mercadona food catalog from tienda.mercadona.es (unofficial API).
 * La usa mercadona-sync.mjs (el catálogo semanal).
 */

const API = "https://tienda.mercadona.es/api";

export const NON_FOOD_TOP_IDS = new Set([
  21, 20, 23, 26, 22, 25,
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// De dos en dos y con pausas: con 8 a la vez cortaba categorías enteras.
const CONCURRENCIA = 2;
const PAUSA_MS = 300;
const INTENTOS = 4;
const ESPERA_BASE_MS = 2000;

/**
 * Baja cada categoría, con reintentos y esperas crecientes. Si alguna sigue
 * fallando, lanza: un catálogo incompleto parece bueno y borra productos.
 * @param {(id: number) => Promise<any>} leer
 * @returns {Promise<Map<number, any>>} id → página, con todas las pedidas
 */
export async function bajarCategorias(ids, leer, { pausa = sleep, esperaBaseMs = ESPERA_BASE_MS } = {}) {
  const paginas = new Map();
  const leerConReintentos = async (id) => {
    for (let intento = 1; ; intento++) {
      try {
        paginas.set(id, await leer(id));
        return null;
      } catch (e) {
        if (intento === INTENTOS) return `${id}: ${e.message}`;
        await pausa(esperaBaseMs * 2 ** (intento - 1));
      }
    }
  };
  const fallos = [];
  for (let i = 0; i < ids.length; i += CONCURRENCIA) {
    const tanda = await Promise.all(ids.slice(i, i + CONCURRENCIA).map(leerConReintentos));
    fallos.push(...tanda.filter(Boolean));
    if (i + CONCURRENCIA < ids.length) await pausa(PAUSA_MS);
  }
  if (fallos.length) throw new Error(`catálogo incompleto, ${fallos.length} categorías sin bajar: ${fallos.join("; ")}`);
  return paginas;
}

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

  const paginas = await bajarCategorias(leafIds, (id) => fetchJson(`${API}/categories/${id}/`));
  const products = [];
  for (const id of leafIds) extractProducts(paginas.get(id), sectionByLeaf.get(id) ?? {}, products);

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
