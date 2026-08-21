import { normalizeName, guessShoppingAisle } from "./ingredientCategories.js";
import { toCanonicalStockQty } from "./kitchenUnits.js";

/** Container types for packaged grocery items (matches SpendPanel vocabulary). */
export const PACK_KINDS = [
  { value: "bote", label: "bote" },
  { value: "lata", label: "lata" },
  { value: "paquete", label: "paquete" },
  { value: "bolsa", label: "bolsa" },
  { value: "brick", label: "brick" },
  { value: "botella", label: "botella" },
  { value: "carton", label: "cartón" },
];

export const PACK_SIZE_UNITS = ["g", "kg", "ml", "l"];

export const PACK_KIND_LABEL = Object.fromEntries(PACK_KINDS.map((k) => [k.value, k.label]));

const PACK_NAME_RE =
  /de bote|en conserva|conserva|triturado|frito|concentrado|passata|cocid|en lata|\blata\b|atun|sardina|anchoa|mejillon|berberecho|aceite|vinagre|mayonesa|ketchup|mostaza|salsa|nata\b|yogur|leche|harina|arroz|pasta|fideo|macarron|espagueti|congelad|maiz dulce|tomate frito/;

const DRY_LEGUME_RE = /lentejas?|garbanz|alubia|judion|fabes|judias? blanc/;

const COOKED_LEGUME_RE = /cocid|de bote/;

/** Whether the add/edit form should show Envase + contenido fields. */
export function wantsPackFields(name) {
  const n = normalizeName(name);
  if (!n) return false;
  if (PACK_NAME_RE.test(n)) return true;
  const aisle = guessShoppingAisle(name);
  if (aisle === "Aceites y conservas") return true;
  if (aisle === "Legumbres") return true;
  if (aisle === "Pasta y arroz") return true;
  if (aisle === "Lácteos" && /leche|yogur|nata/.test(n)) return true;
  return false;
}

/** Sensible defaults when opening the pack row for a product name. */
export function defaultPackFor(name) {
  const n = normalizeName(name);
  if (/aceite|vinagre/.test(n)) {
    return { kind: "botella", sizeQty: 1, sizeUnit: "l" };
  }
  if (/leche|yogur|nata/.test(n)) {
    return { kind: /yogur/.test(n) ? "paquete" : "brick", sizeQty: 1, sizeUnit: "l" };
  }
  if (/atun|sardina|anchoa/.test(n)) {
    return { kind: "lata", sizeQty: 80, sizeUnit: "g" };
  }
  if (DRY_LEGUME_RE.test(n) && !COOKED_LEGUME_RE.test(n)) {
    return { kind: "bolsa", sizeQty: 500, sizeUnit: "g" };
  }
  if (DRY_LEGUME_RE.test(n) || /cocid|de bote/.test(n)) {
    return { kind: "bote", sizeQty: 570, sizeUnit: "g" };
  }
  if (/harina|arroz|pasta|fideo|macarron|espagueti/.test(n)) {
    return { kind: "paquete", sizeQty: 500, sizeUnit: "g" };
  }
  if (/triturado|frito|passata|salsa|mayonesa|ketchup|mostaza/.test(n)) {
    return { kind: "bote", sizeQty: 400, sizeUnit: "g" };
  }
  return { kind: "bote", sizeQty: 500, sizeUnit: "g" };
}

/**
 * @param {{ count?: number, kind?: string, sizeQty?: number, sizeUnit?: string }} pack
 * @returns {{ qty: number, unit: 'g'|'ml'|'ud', pack: { count: number, kind: string, sizeQty: number, sizeUnit: string } }|null}
 */
export function stockFromPack(pack) {
  const count = Number(pack?.count) > 0 ? Number(pack.count) : 1;
  const sizeQty = Number(pack?.sizeQty);
  const kind = pack?.kind ?? "bote";
  const sizeUnit = pack?.sizeUnit ?? "g";
  if (!(sizeQty > 0)) return null;

  const { qty: perUnit, unit } = toCanonicalStockQty(sizeQty, sizeUnit);
  const canonicalSizeUnit = sizeUnit === "kg" ? "g" : sizeUnit === "l" ? "ml" : sizeUnit;
  const canonicalSizeQty = sizeUnit === "kg" ? sizeQty * 1000 : sizeUnit === "l" ? sizeQty * 1000 : sizeQty;

  return {
    qty: count * perUnit,
    unit,
    pack: {
      count,
      kind,
      sizeQty: canonicalSizeQty,
      sizeUnit: canonicalSizeUnit,
    },
  };
}

/** @param {{ packCount?: number|null, packKind?: string|null, packSize?: number|null, packSizeUnit?: string|null }} item */
export function formatPackLabel(item) {
  const count = Number(item?.packCount) > 0 ? Number(item.packCount) : null;
  const kind = item?.packKind;
  const size = Number(item?.packSize);
  const sizeUnit = item?.packSizeUnit;
  if (!kind || !(size > 0) || !sizeUnit) return null;

  const kindLabel = PACK_KIND_LABEL[kind] ?? kind;
  const n = count ?? 1;
  let sizeText = `${Math.round(size)} ${sizeUnit}`;
  if (sizeUnit === "g" && size >= 1000) {
    sizeText = `${size % 1000 === 0 ? size / 1000 : (size / 1000).toFixed(1).replace(".", ",")} kg`;
  }
  if (sizeUnit === "ml" && size >= 1000) {
    sizeText = `${size % 1000 === 0 ? size / 1000 : (size / 1000).toFixed(1).replace(".", ",")} L`;
  }
  return `${n} ${kindLabel} · ${sizeText}`;
}

export function packFieldsFromRow(row) {
  if (!row?.packKind || !(Number(row.packSize) > 0)) return null;
  return {
    count: Number(row.packCount) > 0 ? Number(row.packCount) : 1,
    kind: row.packKind,
    sizeQty: Number(row.packSize),
    sizeUnit: row.packSizeUnit ?? "g",
  };
}
