import { z } from "zod";
import Papa from "papaparse";
import { PARSER_MODEL } from "./aiModels.js";

// ---------------------------------------------------------------------------
// Schema (matches the API prompt's output format)
// ---------------------------------------------------------------------------

const MacrosSchema = z.object({
  p: z.number().nonnegative(),
  hc: z.number().nonnegative(),
  g: z.number().nonnegative(),
});

const DayMenuSchema = z.object({
  dia: z.string(),
  sinClase: z.boolean().default(false),
  primero: z.string().nullable().optional(),
  segundo: z.string().nullable().optional(),
  postre: z.string().nullable().optional(),
  kcal: z.number().nullable().optional(),
  macros: MacrosSchema.nullable().optional(),
});

const WeekSchema = z.object({
  numero: z.number().int().positive(),
  fechaInicio: z.string().nullable().optional(),
  dias: z.array(DayMenuSchema).min(1),
});

export const MenuSchema = z.object({
  semanas: z.array(WeekSchema).min(1),
});

// ---------------------------------------------------------------------------
// PDF → Claude document API
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a school menu extraction tool. Given a document containing a school lunch menu, extract ALL weeks into structured JSON.

CRITICAL RULES:
1. Return ONLY valid JSON. No markdown, no backticks, no text.
2. Extract EVERY week in the document. A typical monthly menu has 4-5 weeks. Do NOT stop after the first week.
3. Each day has 3 items: primero (starter/carb), segundo (protein), postre (dessert/fruit).
4. Keep dish names in the original language of the document.
5. Days without meals (holidays, "sin clase") → sinClase: true, dishes null.
6. The kcal/macros line is metadata, NOT a dish.
7. Concatenate wrapped dish names: "Espinacas salteadas con" + "garbanzos" → "Espinacas salteadas con garbanzos"
8. Do NOT include titles, headers, or school names as dishes.
9. If nutritional info exists, extract kcal and macros {p, hc, g}. Otherwise null.
10. The document may span multiple pages. Extract across all pages.

Day names MUST be in Spanish: lunes, martes, miercoles, jueves, viernes.

Schema:
{
  "semanas": [
    {
      "numero": 1,
      "fechaInicio": "1 Jun" or null,
      "dias": [
        {
          "dia": "lunes",
          "sinClase": false,
          "primero": "Ensalada mixta",
          "segundo": "Pechuga plancha con tomate",
          "postre": "Manzana",
          "kcal": 640,
          "macros": {"p": 28, "hc": 72, "g": 20}
        },
        {
          "dia": "martes",
          "sinClase": false,
          "primero": "Crema de calabaza",
          "segundo": "Merluza al horno con patata",
          "postre": "Yogur natural",
          "kcal": 620,
          "macros": {"p": 30, "hc": 65, "g": 18}
        }
      ]
    },
    {
      "numero": 2,
      "fechaInicio": "8 Jun",
      "dias": [...]
    }
  ]
}

IMPORTANT: The semanas array must contain ALL weeks, not just week 1.`;

function extractJson(text) {
  const trimmed = String(text ?? "").trim();
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Try to find JSON object or array in the response
    const objStart = trimmed.indexOf("{");
    const objEnd = trimmed.lastIndexOf("}");
    if (objStart !== -1 && objEnd > objStart) {
      parsed = JSON.parse(trimmed.slice(objStart, objEnd + 1));
    } else {
      const arrStart = trimmed.indexOf("[");
      const arrEnd = trimmed.lastIndexOf("]");
      if (arrStart !== -1 && arrEnd > arrStart) {
        parsed = JSON.parse(trimmed.slice(arrStart, arrEnd + 1));
      } else {
        throw new Error("La respuesta no contiene JSON válido.");
      }
    }
  }

  // Handle both {semanas:[...]} wrapper and bare array
  if (Array.isArray(parsed)) {
    return { semanas: parsed };
  }
  return parsed;
}

async function callClaude(messages, { system } = {}) {
  const body = {
    model: PARSER_MODEL,
    max_tokens: 32000,
    system,
    messages,
  };

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error("[menuParser] API error response:", JSON.stringify(err, null, 2));
    throw new Error(err.error?.message ?? `API error ${response.status}`);
  }

  const payload = await response.json();
  return payload?.content?.[0]?.text ?? "";
}

// Chunked base64 — avoids the O(n²) char-by-char reduce on multi-MB files.
async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Send a document/image content block to Claude and validate the JSON,
// retrying once with the validation errors fed back.
async function parseDocumentMenu(userContent) {
  const rawText = await callClaude(
    [{ role: "user", content: userContent }],
    { system: SYSTEM_PROMPT }
  );

  const parsed = extractJson(rawText);
  const result = MenuSchema.safeParse(parsed);
  if (result.success) return result.data;

  const errorMsg = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("\n");

  const retryText = await callClaude(
    [
      { role: "user", content: userContent },
      { role: "assistant", content: rawText },
      {
        role: "user",
        content: `The JSON has validation errors:\n${errorMsg}\n\nFix them and return ONLY the corrected complete JSON.`,
      },
    ],
    { system: SYSTEM_PROMPT }
  );

  const retryParsed = extractJson(retryText);
  const retryResult = MenuSchema.safeParse(retryParsed);
  if (retryResult.success) return retryResult.data;

  const failedField = retryResult.error.issues[0];
  throw new Error(
    `Validación fallida tras reintento: ${failedField.path.join(".")} — ${failedField.message}`
  );
}

async function parsePdfMenu(file) {
  const base64 = await fileToBase64(file);
  return parseDocumentMenu([
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    },
    {
      type: "text",
      text: "Extract the complete school menu from this PDF. Return ONLY the JSON.",
    },
  ]);
}

async function parseImageMenu(file) {
  const base64 = await fileToBase64(file);
  const mediaType = (file.type || "").startsWith("image/") ? file.type : "image/jpeg";
  return parseDocumentMenu([
    {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: base64 },
    },
    {
      type: "text",
      text: "Extract the complete school menu from this image. Return ONLY the JSON.",
    },
  ]);
}

// ---------------------------------------------------------------------------
// CSV → papaparse
// ---------------------------------------------------------------------------

const DAY_ALIASES = {
  lunes: /^(lunes|lun\.?)(\s|$)/i,
  martes: /^(martes|mar\.?)(\s|$)(?!z)/i,
  miercoles: /^(mi[eé]rcoles|mi[eé]\.?)(\s|$)/i,
  jueves: /^(jueves|jue\.?)(\s|$)/i,
  viernes: /^(viernes|vie\.?)(\s|$)/i,
};

function matchDay(val) {
  const trimmed = String(val ?? "").trim();
  for (const [day, re] of Object.entries(DAY_ALIASES)) {
    if (re.test(trimmed)) return day;
  }
  return null;
}

const HEADER_ALIASES = {
  semana: /^(semana|week|sem)/i,
  dia: /^(d[ií]a|day)/i,
  primero: /^(primero|1[ºo°.]?\s*(plato)?|primer\s*plato|first)/i,
  segundo: /^(segundo|2[ºo°.]?\s*(plato)?|segundo\s*plato|second)/i,
  postre: /^(postre|3[ºo°.]?\s*(plato)?|dessert)/i,
  kcal: /^(kcal|energ[ií]a|calories)/i,
  protein: /^(prote[ií]nas?|protein|P\b)/i,
  carbs: /^(hidratos|carboh|HC\b|carbs)/i,
  fat: /^(grasas?|fat|G\b|l[ií]pidos)/i,
};

function matchHeader(header) {
  const trimmed = header.trim();
  for (const [key, re] of Object.entries(HEADER_ALIASES)) {
    if (re.test(trimmed)) return key;
  }
  return null;
}

function parseNumOrNull(val) {
  if (val == null || val === "") return null;
  const n = parseFloat(String(val).replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const DAY_ORDER = ["lunes", "martes", "miercoles", "jueves", "viernes"];

export function parseCsvMenu(text) {
  const { data, meta } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  if (!data || data.length === 0) {
    throw new Error("CSV vacío o sin datos.");
  }

  const colMap = {};
  for (const field of meta.fields ?? []) {
    const alias = matchHeader(field);
    if (alias) colMap[alias] = field;
  }

  if (!colMap.dia) {
    throw new Error(
      "No se encontró columna de día. Cabeceras esperadas: día, primero, segundo, postre."
    );
  }

  const weekGroups = new Map();

  for (const row of data) {
    const weekNum = colMap.semana ? Number(row[colMap.semana]) || 1 : 1;
    const dayKey = matchDay(row[colMap.dia]);
    if (!dayKey) continue;

    const sinClaseVal = String(row[colMap.primero] ?? "").trim().toLowerCase();
    const sinClase =
      sinClaseVal === "" ||
      /sin clase|festivo|no lectivo/i.test(sinClaseVal);

    const dayMenu = {
      dia: dayKey,
      sinClase,
      primero: sinClase
        ? null
        : String(row[colMap.primero] ?? "").trim() || null,
      segundo: sinClase
        ? null
        : String(row[colMap.segundo] ?? "").trim() || null,
      postre: sinClase
        ? null
        : String(row[colMap.postre] ?? "").trim() || null,
      kcal: colMap.kcal ? parseNumOrNull(row[colMap.kcal]) : null,
      macros:
        colMap.protein && colMap.carbs && colMap.fat
          ? {
              p: parseNumOrNull(row[colMap.protein]) ?? 0,
              hc: parseNumOrNull(row[colMap.carbs]) ?? 0,
              g: parseNumOrNull(row[colMap.fat]) ?? 0,
            }
          : null,
    };

    if (!weekGroups.has(weekNum)) weekGroups.set(weekNum, []);
    weekGroups.get(weekNum).push(dayMenu);
  }

  const semanas = [...weekGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([num, dias]) => ({
      numero: num,
      fechaInicio: null,
      dias: DAY_ORDER.map(
        (d) =>
          dias.find((dd) => dd.dia === d) ?? {
            dia: d,
            sinClase: true,
            primero: null,
            segundo: null,
            postre: null,
            kcal: null,
            macros: null,
          }
      ),
    }));

  const result = MenuSchema.safeParse({ semanas });
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `CSV inválido: ${issue.path.join(".")} — ${issue.message}`
    );
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Bridge: MenuSchema → existing weeks format for the UI
// ---------------------------------------------------------------------------

const DAY_MAP = {
  lunes: "Lun",
  martes: "Mar",
  miercoles: "Mié",
  jueves: "Jue",
  viernes: "Vie",
};

export function menuToWeeksFormat(menu) {
  const semanas = menu.semanas ?? menu;

  return (Array.isArray(semanas) ? semanas : []).map((week) => {
    const entries = {};

    for (const dayData of week.dias ?? []) {
      const prefix = DAY_MAP[dayData.dia];
      if (!prefix || dayData.sinClase) continue;
      if (dayData.primero) entries[`${prefix}-Primero`] = dayData.primero;
      if (dayData.segundo) entries[`${prefix}-Segundo`] = dayData.segundo;
      if (dayData.postre) entries[`${prefix}-Postre`] = dayData.postre;
    }

    return {
      weekLabel: week.fechaInicio
        ? `Semana ${week.numero} (${week.fechaInicio})`
        : `Semana ${week.numero}`,
      entries,
    };
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function parseMenu(file, type) {
  if (type === "csv") {
    const text = typeof file === "string" ? file : await file.text();
    return parseCsvMenu(text);
  }
  if (type === "pdf") {
    return parsePdfMenu(file);
  }
  if (type === "image") {
    return parseImageMenu(file);
  }
  throw new Error("Tipo no soportado. Usa 'pdf', 'image' o 'csv'.");
}
