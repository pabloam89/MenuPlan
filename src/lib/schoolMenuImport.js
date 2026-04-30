// School menu importer.
//
// Supports:
//   - PDF (text-based or scanned → OCR)
//   - Images (JPG/PNG/WEBP) via OCR
//   - CSV (Day,Primero,Segundo,Postre rows or 15 lines)
//
// All heavy deps (pdfjs/tesseract) are loaded lazily so the main bundle
// stays slim until the user opens the school menu importer.

export const DAY_KEYS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
export const COURSE_KEYS = ["Primero", "Segundo", "Postre"];

const DAY_PATTERNS = [
  { key: "Lun", regex: /\b(lunes|lun\.?|^l[\s:.-])/i },
  { key: "Mar", regex: /\b(martes|mar\.?|^m[\s:.-])/i },
  { key: "Mié", regex: /\b(mi[eé]rcoles|mi[eé]\.?|^x[\s:.-])/i },
  { key: "Jue", regex: /\b(jueves|jue\.?|^j[\s:.-])/i },
  { key: "Vie", regex: /\b(viernes|vie\.?|^v[\s:.-])/i },
];

// Course markers: the labels usually found at the start of a dish line.
const PRIMERO_RE = /^(?:1[ºo°.]?|primero|primer plato|1\)|1\s*-)\s*[:.\-–]?\s*/i;
const SEGUNDO_RE = /^(?:2[ºo°.]?|segundo|segundo plato|2\)|2\s*-)\s*[:.\-–]?\s*/i;
const POSTRE_RE = /^(?:postre|3[ºo°.]?|postres?|3\)|3\s*-)\s*[:.\-–]?\s*/i;

// Things that look like postre (used when no explicit label is present).
const POSTRE_KEYWORDS =
  /\b(fruta|yogur|manzana|pl[aá]tano|pera|naranja|mandarina|sand[ií]a|mel[oó]n|kiwi|pi[ñn]a|fresas?|uvas?|cereza|albaricoque|ciruela|melocot[oó]n|nat[ií]llas?|flan|cuajada|requesón|chocolate)\b/i;

const NOISE_PATTERNS = [
  /^men[uú]/i,
  /^semana/i,
  /^pan( y agua)?$/i,
  /^agua$/i,
  /^aceite/i,
  /^kcal/i,
  /^\d+\s*kcal/i,
  /^p[aá]gina/i,
  /^\d+\s*$/,
  /^[-_=*•·]+$/,
];

function normalizeLine(line) {
  return line.replace(/\s+/g, " ").trim();
}

function isNoise(line) {
  if (!line) return true;
  if (line.length < 3) return true;
  return NOISE_PATTERNS.some((re) => re.test(line));
}

function detectDay(line) {
  for (const { key, regex } of DAY_PATTERNS) {
    if (regex.test(line)) return key;
  }
  return null;
}

function stripBullets(line) {
  return line.replace(/^[-•·*▪►◦●○]+\s*/, "").trim();
}

function classifyCourseLine(line) {
  const cleaned = stripBullets(line);
  if (PRIMERO_RE.test(cleaned)) {
    return { course: "Primero", text: cleaned.replace(PRIMERO_RE, "").trim() };
  }
  if (SEGUNDO_RE.test(cleaned)) {
    return { course: "Segundo", text: cleaned.replace(SEGUNDO_RE, "").trim() };
  }
  if (POSTRE_RE.test(cleaned)) {
    return { course: "Postre", text: cleaned.replace(POSTRE_RE, "").trim() };
  }
  return { course: null, text: cleaned };
}

/**
 * Parse free text (from OCR or PDF) into:
 *   { "Lun-Primero": "...", "Lun-Segundo": "...", "Lun-Postre": "...", ... }
 *
 * Strategy:
 *  - Walk lines. When a line marks a day, accumulate dish lines until the
 *    next day marker.
 *  - Within a day's bucket, classify each line as Primero / Segundo / Postre
 *    using explicit markers (1º / 2º / Postre).
 *  - Fallback: if no markers, take the first three dish-like lines and assign
 *    Primero / Segundo / Postre by position; if a line clearly looks like a
 *    fruit/yogur, it is forced to Postre.
 */
export function parseSchoolMenuText(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const result = {};
  let currentDay = null;
  let currentLines = [];

  const flush = () => {
    if (!currentDay) return;
    const usable = currentLines
      .filter((l) => !isNoise(l))
      .map(stripBullets)
      .filter(Boolean);

    const courses = { Primero: "", Segundo: "", Postre: "" };
    const unlabeled = [];

    for (const line of usable) {
      const { course, text } = classifyCourseLine(line);
      if (course && text && !courses[course]) {
        courses[course] = text;
      } else if (!course) {
        unlabeled.push(line);
      }
    }

    // Fill missing courses from unlabeled lines.
    if (!courses.Postre) {
      const idx = unlabeled.findIndex((l) => POSTRE_KEYWORDS.test(l));
      if (idx >= 0) {
        courses.Postre = unlabeled[idx];
        unlabeled.splice(idx, 1);
      }
    }
    if (!courses.Primero && unlabeled.length > 0) {
      courses.Primero = unlabeled.shift();
    }
    if (!courses.Segundo && unlabeled.length > 0) {
      courses.Segundo = unlabeled.shift();
    }
    if (!courses.Postre && unlabeled.length > 0) {
      courses.Postre = unlabeled.shift();
    }

    for (const course of COURSE_KEYS) {
      if (courses[course]) result[`${currentDay}-${course}`] = courses[course];
    }
    currentLines = [];
  };

  for (const line of lines) {
    const day = detectDay(line);
    if (day) {
      flush();
      currentDay = day;
      // Capture trailing dish on the same line (e.g. "LUNES — Lentejas").
      const trailing = line
        .replace(/^(lunes|martes|mi[eé]rcoles|jueves|viernes|lun|mar|mi[eé]|jue|vie|l|m|x|j|v)[\s:.\-–]*/i, "")
        .trim();
      if (trailing && trailing.length > 3) currentLines.push(trailing);
      continue;
    }
    if (currentDay) currentLines.push(line);
  }
  flush();

  return result;
}

/**
 * Parse CSV with two shapes:
 *   1. "Day,Primero,Segundo,Postre" rows (header optional)
 *   2. 15 lines: 3 per day, in L-V order (P1, S1, Postre1, P2, S2, ...)
 */
export function parseSchoolMenuCsv(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  if (lines.length === 0) return {};

  const out = {};
  // Strip a header row if it starts with a non-day token.
  const dataLines = detectDay(lines[0]) ? lines : lines.slice(1).length === 0 ? lines : lines.slice(detectDay(lines[0]) ? 0 : 1);

  // CSV with day-keyed rows
  if (dataLines.every((l) => l.includes(","))) {
    for (const line of dataLines) {
      const cells = line.split(",").map((c) => c.trim());
      const dayKey = detectDay(cells[0] ?? "");
      if (!dayKey) continue;
      if (cells[1]) out[`${dayKey}-Primero`] = cells[1];
      if (cells[2]) out[`${dayKey}-Segundo`] = cells[2];
      if (cells[3]) out[`${dayKey}-Postre`] = cells[3];
    }
    if (Object.keys(out).length > 0) return out;
  }

  // Fallback: 15 sequential lines, P/S/Postre per day in L-V order.
  let i = 0;
  for (const day of DAY_KEYS) {
    for (const course of COURSE_KEYS) {
      if (i < lines.length && lines[i]) out[`${day}-${course}`] = lines[i];
      i += 1;
    }
  }
  return out;
}

/**
 * Try native PDF text extraction first; if pages are mostly empty (scanned
 * documents), fall back to rasterising and running OCR on each page.
 */
export async function extractTextFromPdf(file, { onProgress } = {}) {
  const pdfjs = await import("pdfjs-dist");
  // Vite-friendly worker setup using the bundled .mjs worker.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const workerUrl = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;

  let textParts = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    onProgress?.({ stage: "pdf-text", page: i, total: pdf.numPages });
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines = content.items.map((it) => ("str" in it ? it.str : "")).filter(Boolean);
    textParts.push(lines.join("\n"));
  }

  let joined = textParts.join("\n").trim();
  if (joined.length >= 40) {
    return joined;
  }

  // Fallback: rasterize each page → OCR.
  onProgress?.({ stage: "ocr-fallback", page: 0, total: pdf.numPages });
  const tesseract = await import("tesseract.js");
  const ocrParts = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    onProgress?.({ stage: "ocr-page", page: i, total: pdf.numPages });
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const { data } = await tesseract.recognize(canvas, "spa", {
      logger: (m) => onProgress?.({ stage: "ocr-progress", ...m, page: i, total: pdf.numPages }),
    });
    ocrParts.push(data.text);
  }
  return ocrParts.join("\n");
}

export async function extractTextFromImage(file, { onProgress } = {}) {
  const tesseract = await import("tesseract.js");
  const { data } = await tesseract.recognize(file, "spa", {
    logger: (m) => onProgress?.({ stage: "ocr-progress", ...m }),
  });
  return data.text;
}

export async function extractTextFromCsv(file) {
  return await file.text();
}

/**
 * High-level entry point used by the UI. Returns:
 *   { rawText: string, entries: { "Lun-Primero": "...", "Lun-Segundo": "...", ... } }
 */
export async function importSchoolMenuFile(file, { onProgress } = {}) {
  const name = (file.name ?? "").toLowerCase();
  const type = (file.type ?? "").toLowerCase();

  let rawText;
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    rawText = await extractTextFromPdf(file, { onProgress });
  } else if (type.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(name)) {
    rawText = await extractTextFromImage(file, { onProgress });
  } else if (type === "text/csv" || name.endsWith(".csv")) {
    const csvText = await extractTextFromCsv(file);
    return { rawText: csvText, entries: parseSchoolMenuCsv(csvText) };
  } else {
    throw new Error("Formato no soportado. Usa PDF, JPG/PNG o CSV.");
  }

  return { rawText, entries: parseSchoolMenuText(rawText) };
}
