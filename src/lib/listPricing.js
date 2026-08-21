/**
 * Estimate shopping-list prices from bundled store catalog + user priceObs fallback.
 */

import { estimateListCost } from "./priceHistory.js";
import { matchProductForIngredient, MATCH_HIGH } from "./productMatcher.js";
import { isMercadonaStore, loadStoreCatalog } from "./storeCatalog.js";
import { PACK_KIND_LABEL, wantsPackFields } from "./packUnits.js";
import { guessShoppingAisle } from "./ingredientCategories.js";
import { gramsPerPiece } from "./kitchenUnits.js";

function roundQty(n, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(Number(n) * factor) / factor;
}

function formatQtyNum(n, decimals = 1) {
  return roundQty(n, decimals).toLocaleString("es-ES", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
}

/** @param {number} unitSize @param {string} unitFormat */
export function formatSkuSize(unitSize, unitFormat) {
  const n = Number(unitSize);
  const fmt = String(unitFormat ?? "ud").toLowerCase();
  if (!(n > 0)) return null;
  if (fmt === "kg") return `${formatQtyNum(n, 1)} kg`;
  if (fmt === "g") {
    if (n >= 1000) return `${formatQtyNum(n / 1000, 1)} kg`;
    return `${formatQtyNum(n, 1)} g`;
  }
  if (fmt === "l") return `${formatQtyNum(n, 1)} L`;
  if (fmt === "ml") {
    if (n >= 1000) return `${formatQtyNum(n / 1000, 1)} L`;
    return `${formatQtyNum(n, 1)} ml`;
  }
  if (fmt === "cl") return `${formatQtyNum(n, 1)} cl`;
  if (fmt === "ud" || fmt === "uds") return n === 1 ? "1 ud" : `${Math.round(n)} uds`;
  return `${formatQtyNum(n, 1)} ${fmt}`;
}

function shoppingItemQtyText(item) {
  const qty = Number(item?.qty);
  if (!(qty > 0)) return null;
  const unit = (item?.unit ?? "ud").toLowerCase();
  if (unit === "ud") return qty === 1 ? "1 ud" : `${Math.round(qty)} uds`;
  if (unit === "g" || unit === "kg") {
    const g = unit === "kg" ? qty * 1000 : qty;
    return formatSkuSize(g, "g");
  }
  if (unit === "ml" || unit === "l" || unit === "cl") {
    const ml = unit === "l" ? qty * 1000 : unit === "cl" ? qty * 10 : qty;
    return formatSkuSize(ml, "ml");
  }
  return `${formatQtyNum(qty, 1)} ${unit}`;
}

/** Guess container word from product + ingredient names. */
function inferPackKind(productName, ingredientName, unitFormat) {
  const n = `${productName ?? ""} ${ingredientName ?? ""}`.toLowerCase();
  const fmt = String(unitFormat ?? "ud").toLowerCase();
  if (/lata|atun|sardina|anchoa|conserva/.test(n)) return "lata";
  if (/brick|leche|nata|yogur/.test(n)) return "brick";
  if (/cocid|de bote|triturado|frito|salsa|mayonesa|ketchup/.test(n)) return "bote";
  if (/bolsa|arroz|pasta|harina|legumb|lentej|garbanz|alubia/.test(n)) return "bolsa";
  if (fmt === "l" || fmt === "ml" || fmt === "cl" || /aceite|vinagre|leche|nata/.test(n)) return "botella";
  return "ud";
}

/** Fresh / piece-sold items — never label as bote/bolsa in Compra. */
function isPieceSoldFresh(name) {
  const aisle = guessShoppingAisle(name);
  return (
    aisle === "Verduras" ||
    aisle === "Frutas" ||
    aisle === "Huevos" ||
    aisle === "Carne" ||
    aisle === "Pescado" ||
    aisle === "Panadería"
  );
}

function pluralKind(kind, count) {
  const label = PACK_KIND_LABEL[kind] ?? kind;
  if (count === 1) return label;
  if (kind === "lata") return "latas";
  if (kind === "bolsa") return "bolsas";
  if (kind === "botella") return "botellas";
  if (kind === "bote") return "botes";
  if (kind === "paquete") return "paquetes";
  if (kind === "carton") return "cartones";
  return label;
}

/** How many units you take home (packs × SKU size). */
function totalQtyText(product, packs, item) {
  const packSize = Number(product?.unitSize);
  const packFmt = String(product?.unitFormat ?? "ud").toLowerCase();
  const itemUnit = (item?.unit ?? "ud").toLowerCase();
  const itemQty = Number(item?.qty);

  if (!(packs > 0)) return shoppingItemQtyText(item);

  if (
    itemUnit === "ud" &&
    (packFmt === "kg" || packFmt === "g") &&
    itemQty > 0
  ) {
    const gpp = gramsPerPiece(item?.name);
    if (gpp) return formatSkuSize(itemQty * gpp, "g");
    if (packSize > 0 && packs === itemQty && packSize <= 2) {
      return formatSkuSize(packs * packSize, packFmt);
    }
    return shoppingItemQtyText(item);
  }

  if (
    (packFmt === "ud" || packFmt === "uds") &&
    (itemUnit === "g" || itemUnit === "kg" || itemUnit === "ml" || itemUnit === "l" || itemUnit === "cl")
  ) {
    return shoppingItemQtyText(item);
  }

  if (!(packSize > 0)) return shoppingItemQtyText(item);

  if (packFmt === "ud" || packFmt === "uds") {
    const total = packs * packSize;
    return total === 1 ? "1 ud" : `${Math.round(total)} uds`;
  }
  return formatSkuSize(packs * packSize, packFmt);
}

/** Envases / uds to buy (for € breakdown column). */
function packLabelForLine(item, product, packs) {
  const packSize = Number(product?.unitSize) || 1;
  const packFmt = String(product?.unitFormat ?? "ud").toLowerCase();
  const unit = (item?.unit ?? "ud").toLowerCase();

  if (wantsPackFields(item?.name) && !isPieceSoldFresh(item?.name)) {
    const kind = inferPackKind(product?.name, item?.name, product?.unitFormat);
    return `${packs} ${pluralKind(kind, packs)}`;
  }

  if (packFmt === "ud" || packFmt === "uds") {
    const totalUds = packs * packSize;
    return totalUds === 1 ? "1 ud" : `${Math.round(totalUds)} uds`;
  }

  if (unit === "ud" && (packFmt === "kg" || packFmt === "g")) {
    return packs === 1 ? "1 ud" : `${packs} uds`;
  }

  if (["kg", "g", "ml", "l", "cl"].includes(packFmt)) {
    if (isPieceSoldFresh(item?.name) || unit === "ud") {
      return packs === 1 ? "1 ud" : `${packs} uds`;
    }
    const kind = inferPackKind(product?.name, item?.name, product?.unitFormat);
    return `${packs} ${pluralKind(kind, packs)}`;
  }

  return packs === 1 ? "1 ud" : `${packs} uds`;
}

/**
 * Packs needed for a list line given a Mercadona SKU.
 * @param {{ qty?: number|null, unit?: string }} item
 * @param {{ price?: number|null, unitSize?: number|null, unitFormat?: string|null }} product
 */
export function packsForLine(item, product) {
  const price = Number(product?.price);
  if (!(price > 0)) return null;

  const qty = Number(item.qty);
  if (!(qty > 0)) return 1;

  const unit = (item.unit ?? "ud").toLowerCase();
  const packSize = Number(product.unitSize) || 1;
  const packFmt = String(product.unitFormat ?? "ud").toLowerCase();

  if (unit === "ud" && (packFmt === "ud" || packFmt === "uds")) {
    return Math.max(1, Math.ceil(qty / packSize));
  }

  if ((unit === "g" || unit === "kg") && (packFmt === "g" || packFmt === "kg")) {
    const needG = unit === "kg" ? qty * 1000 : qty;
    const packG = packFmt === "kg" ? packSize * 1000 : packSize;
    if (packG > 0) return Math.max(1, Math.ceil(needG / packG));
  }

  if ((unit === "ml" || unit === "l" || unit === "cl") && ["ml", "l", "cl"].includes(packFmt)) {
    const needMl = unit === "l" ? qty * 1000 : unit === "cl" ? qty * 10 : qty;
    const packMl = packFmt === "l" ? packSize * 1000 : packFmt === "cl" ? packSize * 10 : packSize;
    if (packMl > 0) return Math.max(1, Math.ceil(needMl / packMl));
  }

  // Recipe asks for pieces; Mercadona SKU is weight-per-piece (e.g. aguacate 0,33 kg).
  if (unit === "ud" && (packFmt === "g" || packFmt === "kg")) {
    if (packFmt === "kg" && packSize > 0 && packSize <= 2) {
      return Math.max(1, Math.ceil(qty));
    }
    const gpp = gramsPerPiece(item?.name);
    if (gpp && packSize > 0) {
      const needG = qty * gpp;
      const packG = packFmt === "kg" ? packSize * 1000 : packSize;
      if (packG > 0) return Math.max(1, Math.ceil(needG / packG));
    }
  }

  return 1;
}

/**
 * @param {{ qty?: number|null, unit?: string, name: string }} item
 * @param {import('./productMatcher.js').StoreProduct} product
 */
export function linePriceFromProduct(item, product) {
  const packs = packsForLine(item, product);
  const price = Number(product?.price);
  if (packs == null || !(price > 0)) return null;
  return Math.round(packs * price * 100) / 100;
}

/**
 * Buy-oriented line for Compra + €: whole packs from the matched SKU, not loose grams.
 * @returns {{ packs: number, buyDisplay: string|null, packLabel: string, totalQtyText: string|null, unitSizeText: string|null, linePrice: number, productName: string }|null}
 */
export function buyLineFromProduct(item, product) {
  const packs = packsForLine(item, product);
  const price = Number(product?.price);
  if (packs == null || !(price > 0)) return null;

  const unitSizeText = formatSkuSize(product?.unitSize, product?.unitFormat);
  const packLabel = packLabelForLine(item, product, packs);
  const totalQty = totalQtyText(product, packs, item);

  // Legacy one-line label (packaged goods only).
  let buyDisplay = null;
  if (wantsPackFields(item?.name) && !isPieceSoldFresh(item?.name)) {
    buyDisplay = unitSizeText ? `${packLabel} · ${unitSizeText}` : packLabel;
  }

  return {
    packs,
    buyDisplay,
    packLabel,
    totalQtyText: totalQty,
    unitSizeText,
    linePrice: Math.round(packs * price * 100) / 100,
    productName: product?.name ?? "",
  };
}

/**
 * @param {string} storeName e.g. "Mercadona"
 * @param {object[]} items shopping list rows
 * @param {object[]} [priceObs] user-recorded prices
 */
export async function estimateShoppingList(storeName, items = [], priceObs = []) {
  if (!isMercadonaStore(storeName)) {
    const obs = estimateListCost(items, priceObs);
    return {
      store: storeName,
      total: obs.total,
      matched: obs.matched,
      count: obs.count,
      source: "obs",
      catalogFetchedAt: null,
    };
  }

  let catalog;
  try {
    catalog = await loadStoreCatalog("mercadona");
  } catch {
    const obs = estimateListCost(items, priceObs);
    return {
      store: "Mercadona",
      total: obs.total,
      matched: obs.matched,
      count: obs.count,
      source: "obs",
      catalogFetchedAt: null,
    };
  }

  let total = 0;
  let matched = 0;
  const lines = [];

  for (const item of items) {
    const match = matchProductForIngredient(item.name, catalog.products);
    if (match && match.confidence >= MATCH_HIGH) {
      const buy = buyLineFromProduct(item, match.product);
      if (buy) {
        total += buy.linePrice;
        matched++;
        lines.push({
          name: item.name,
          productName: buy.productName,
          price: buy.linePrice,
          buyDisplay: buy.buyDisplay,
          packs: buy.packs,
          confidence: match.confidence,
          source: "mercadona",
        });
        continue;
      }
    }

    const obsLine = estimateListCost([item], priceObs);
    if (obsLine.matched > 0) {
      total += obsLine.total;
      matched++;
      lines.push({ name: item.name, price: obsLine.total, source: "obs", confidence: 1 });
    } else {
      lines.push({ name: item.name, price: null, source: "none", confidence: 0 });
    }
  }

  return {
    store: "Mercadona",
    total: Math.round(total * 100) / 100,
    matched,
    count: items.length,
    source: "mercadona",
    catalogFetchedAt: catalog.fetchedAt,
    lines,
  };
}

/**
 * @param {string} storeName
 * @param {object[]} items
 * @param {object[]} [priceObs]
 * @returns {Promise<Map<string, { storePrice: number|null, storeProductName?: string, storeConfidence?: number, storePriceSource: string }>>}
 */
export async function priceMapForItems(storeName, items = [], priceObs = []) {
  const map = new Map();
  if (!isMercadonaStore(storeName)) return map;

  let catalog;
  try {
    catalog = await loadStoreCatalog("mercadona");
  } catch {
    return map;
  }

  for (const item of items) {
    const key = item.id ?? `${item.name}|${item.unit ?? "ud"}`;
    const match = matchProductForIngredient(item.name, catalog.products);
    if (match && match.confidence >= MATCH_HIGH) {
      const buy = buyLineFromProduct(item, match.product);
      if (buy) {
        map.set(key, {
          storePrice: buy.linePrice,
          storeProductName: buy.productName,
          storeBuyDisplay: buy.buyDisplay,
          storePackLabel: buy.packLabel,
          storeTotalQty: buy.totalQtyText,
          storeUnitSize: buy.unitSizeText,
          storePacks: buy.packs,
          storeConfidence: match.confidence,
          storePriceSource: "mercadona",
        });
        continue;
      }
    }
    const obsLine = estimateListCost([item], priceObs);
    if (obsLine.matched > 0) {
      map.set(key, {
        storePrice: obsLine.total,
        storePriceSource: "obs",
        storeConfidence: 1,
      });
    }
  }

  return map;
}
