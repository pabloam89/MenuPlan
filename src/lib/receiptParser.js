import { FAST_MODEL } from "./aiModels.js";
import { imageFileToVisionPayload } from "./visionImage.js";

function extractJson(text) {
  const trimmed = String(text ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Sin JSON");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

async function postVisionGenerate(body, { signal, failLabel } = {}) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message || errBody?.error || "";
    } catch {
      // ignore
    }
    if (response.status === 413) {
      throw new Error("La foto es demasiado grande. Inténtalo con otra más ligera.");
    }
    if (typeof detail === "string" && /image|media|base64|type/i.test(detail)) {
      throw new Error("No se pudo procesar la imagen. Prueba con JPG o PNG.");
    }
    throw new Error(failLabel || "No se pudo leer la foto");
  }

  return response.json();
}

/**
 * Extract product names from a receipt photo via Claude vision.
 * @returns {Promise<string[]>}
 */
export async function extractReceiptProducts(file, { signal } = {}) {
  const { base64, mediaType } = await imageFileToVisionPayload(file);

  const body = {
    model: FAST_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Lee este ticket de supermercado y extrae los nombres de productos alimenticios comprados.
Ignora totales, IVA, fecha y forma de pago.
Responde SOLO JSON: {"products":["nombre1","nombre2"]}`,
          },
        ],
      },
    ],
  };

  const data = await postVisionGenerate(body, {
    signal,
    failLabel: "No se pudo leer el ticket",
  });
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  const parsed = extractJson(text);
  const products = Array.isArray(parsed.products) ? parsed.products : [];
  return products.map((p) => String(p).trim()).filter(Boolean);
}

/**
 * Structured receipt read for the price history: each line with name, price,
 * quantity and a coarse kind so the caller can drop non-food and flag prefab
 * meals (which don't map to a single ingredient). Also pulls store + date from
 * the header when present.
 *
 * @returns {Promise<{ store: string|null, date: string|null, lines: Array<{
 *   name: string, price: number|null, qty: number, unit: string, kind: string
 * }> }>}
 */
export async function extractReceiptDetail(file, { signal } = {}) {
  const { base64, mediaType } = await imageFileToVisionPayload(file);

  const body = {
    model: FAST_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Lee este ticket de supermercado español y extrae cada línea de producto.
Para cada línea da:
- "name": nombre del producto tal cual (mantén la marca si aparece).
- "price": importe TOTAL de la línea en euros (número, punto decimal). null si no lo ves.
- "qty": cantidad TOTAL comprada, ya multiplicada si el producto viene en pack. Si la línea indica un formato tipo "6x1,5L" o "pack 6 x 330ml", NO pongas el número de envases (6) como qty en unidades — multiplica envases × tamaño y da el total en la unidad de "unit" (ej. "AGUA 6x1,5L" -> qty=9, unit="l"; "YOGUR PACK 4x125G" -> qty=500, unit="g"). Si el producto se cuenta por piezas sin tamaño propio (huevos, latas, piezas de fruta...), qty sí es el nº de piezas y unit="ud". 1 si no se indica cantidad.
- "unit": "ud", "g", "kg", "ml" o "l" según corresponda; "ud" por defecto.
- "kind": "food" para alimentos crudos o básicos — incluye productos envasados/de marca que se siguen usando como INGREDIENTE de una receta o del desayuno (pan de molde, patatas para freír, pasta, arroz, conservas, embutido, queso...); "prefab" SOLO para platos ya cocinados y listos para calentar o comer tal cual, sin ser ingrediente de nada más (croquetas, pizza, lasaña precocinada, sushi, tortilla de patata ya hecha, ensaladilla rusa envasada, sopa de sobre); "nonfood" para TODO lo que no sea alimentación: limpieza y droguería, higiene personal, bolsas, y también ropa/textil (pijama, camiseta, calcetines...), juguetes, menaje, pilas, etc. Ante la duda entre "food" y "prefab", elige "food" — un producto envasado casi siempre es también un ingrediente.
Extrae también "store" (nombre del súper) y "date" (fecha del ticket en formato YYYY-MM-DD) si aparecen; null si no. Para "store" usa el nombre comercial del rótulo/cabecera, NO la razón social del pie. Importante: "Hipercor" y "Supercor" son marcas propias con su propio nombre — si ves "HIPERCOR" o "SUPERCOR" en el ticket, usa ese, aunque el ticket también mencione "El Corte Inglés" (su empresa matriz).
Ignora subtotales, IVA, total y forma de pago.
Responde SOLO JSON:
{"store":"...","date":"YYYY-MM-DD","lines":[{"name":"...","price":0.00,"qty":1,"unit":"ud","kind":"food"}]}`,
          },
        ],
      },
    ],
  };

  const data = await postVisionGenerate(body, {
    signal,
    failLabel: "No se pudo leer el ticket",
  });
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  const parsed = extractJson(text);
  const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const lines = rawLines
    .map((l) => {
      const name = String(l?.name ?? "").trim();
      let kind = ["food", "prefab", "nonfood"].includes(l?.kind) ? l.kind : "food";
      // Safety net for obvious non-food the vision model sometimes tags as
      // "food" (clothing, toys, drugstore...) — e.g. "PIJAMA DE BEBE". These
      // must never reach the food clarify/pantry flow.
      if (kind !== "nonfood" && isObviousNonFood(name)) kind = "nonfood";
      return {
        name,
        price: numOrNull(l?.price),
        qty: Number(l?.qty) > 0 ? Number(l.qty) : 1,
        unit: normUnit(l?.unit),
        kind,
      };
    })
    .filter((l) => l.name.length > 0);

  return {
    store: parsed.store ? String(parsed.store).trim() : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
    lines,
  };
}

/**
 * Reads a photo of a fridge/pantry/shelf and extracts the food items visible
 * in it, each with a best-guess quantity in the SAME closed unit set the
 * despensa itself stores (g / ml / ud — see kitchenUnits.js), so the result
 * can be inserted straight into user_pantry with no conversion step. Amounts
 * are necessarily rough guesses from a photo — the caller lets the user
 * correct them before saving (see PantryInput.jsx's Foto tab).
 *
 * @returns {Promise<{ name: string, qty: number, unit: 'g'|'ml'|'ud' }[]>}
 */
export async function extractPantryPhoto(file, { signal } = {}) {
  const { base64, mediaType } = await imageFileToVisionPayload(file);

  const body = {
    model: FAST_MODEL,
    max_tokens: 1536,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Esta es una foto de una nevera, despensa o alacena. Identifica cada alimento o ingrediente visible por separado (ignora envases vacíos, utensilios y cosas no alimenticias).
Para cada uno da:
- "name": nombre corto del ingrediente en español (ej. "Arroz", "Leche", "Huevos", "Tomates").
- "qty": cantidad estimada visible (número).
- "unit": "g" para alimentos sólidos a granel o en paquete (estima el peso del paquete/cantidad), "ml" para líquidos, "ud" para piezas contables (huevos, piezas de fruta, yogures, latas...).
Si no estás seguro de la cantidad exacta, da tu mejor estimación razonable en vez de omitirla.
Responde SOLO JSON: {"items":[{"name":"...","qty":1,"unit":"ud"}]}`,
          },
        ],
      },
    ],
  };

  const data = await postVisionGenerate(body, {
    signal,
    failLabel: "No se pudo leer la foto",
  });
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  const parsed = extractJson(text);
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  return rawItems
    .map((it) => {
      const rawQty = Number(it?.qty) > 0 ? Number(it.qty) : 1;
      const unitGuess = normUnit(it?.unit);
      // The prompt only asks for g/ml/ud, but scale defensively in case the
      // model answers in kg/l anyway — despensa storage is g/ml/ud only.
      const scaled = unitGuess === "kg" || unitGuess === "l" ? rawQty * 1000 : rawQty;
      const unit = unitGuess === "kg" ? "g" : unitGuess === "l" ? "ml" : unitGuess;
      return { name: String(it?.name ?? "").trim(), qty: scaled, unit };
    })
    .filter((it) => it.name.length > 0);
}

function numOrNull(v) {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isNaN(n) ? null : n;
}

// Keyword guard for clearly non-food lines the vision model occasionally
// mislabels as "food" (clothing/textile, toys, drugstore, household). Kept
// conservative — only unambiguous non-food words — so it never drops an
// actual grocery item.
const NON_FOOD_RE = /\b(pijama|camiset|calcetin|calzoncill|braga|pantalon|sujetador|bufanda|guante|gorro|zapatilla|calzado|toalla|sabana|manta|juguete|pila\b|pilas\b|bombilla|detergent|suavizant|lejia|amoniaco|friegasuelos|lavavajill|estropajo|bayeta|papel higienic|servilleta|panuelo|panal|compresa|tampon|champu|gel de bano|jabon|desodorante|maquinilla|cuchilla|pasta de dient|cepillo|colonia|perfume|maquillaje|crema hidratante|bolsa reutiliz)/i;

function isObviousNonFood(name) {
  const n = String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return NON_FOOD_RE.test(n);
}

function normUnit(u) {
  const s = String(u ?? "").toLowerCase().trim();
  if (s === "kg") return "kg";
  if (s === "g" || s === "gr") return "g";
  if (s === "l" || s === "lt") return "l";
  if (s === "ml") return "ml";
  return "ud";
}
