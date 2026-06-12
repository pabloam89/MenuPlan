// School menu importer.
//
// Supports:
//   - PDF (text-based with coordinate-based table reconstruction, or scanned → OCR)
//   - Images (JPG/PNG/WEBP) via OCR
//   - CSV (Day,Primero,Segundo,Postre rows, transposed, or 15 sequential lines)
//
// All heavy deps (pdfjs/tesseract) are loaded lazily so the main bundle
// stays slim until the user opens the school menu importer.

export const DAY_KEYS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
export const COURSE_KEYS = ["Primero", "Segundo", "Postre"];

const DAY_PATTERNS = [
  { key: "Lun", regex: /\b(lunes)\b|\blun(?:\.|\b)|^l[\s:.-]/i },
  { key: "Mar", regex: /\b(martes)\b|\bmar(?:\.|\b)(?!z)/i },
  { key: "Mié", regex: /\b(mi[eé]rcoles)\b|\bmi[eé](?:\.|\b)|^x[\s:.-]/i },
  { key: "Jue", regex: /\b(jueves)\b|\bjue(?:\.|\b)/i },
  { key: "Vie", regex: /\b(viernes)\b|\bvie(?:\.|\b)|^v[\s:.-]/i },
];

const MONTH_NAMES_RE =
  /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;

const PRIMERO_RE = /^(?:1[ºo°.ªer]?\s*(?:plato)?|primero|primer plato|1\)|1\s*-)\s*[:.\-–]?\s*/i;
const SEGUNDO_RE = /^(?:2[ºo°.ªdo]?\s*(?:plato)?|segundo|segundo plato|2\)|2\s*-)\s*[:.\-–]?\s*/i;
const POSTRE_RE = /^(?:postre|3[ºo°.]?\s*(?:plato)?|postres?|3\)|3\s*-)\s*[:.\-–]?\s*/i;

const POSTRE_KEYWORDS =
  /\b(fruta|yogur|manzana|pl[aá]tano|pera|naranja|mandarina|sand[ií]a|mel[oó]n|kiwi|pi[ñn]a|fresas?|uvas?|cereza|albaricoque|ciruela|melocot[oó]n|nat[ií]llas?|flan|cuajada|requesón|chocolate)\b/i;

const NOISE_PATTERNS = [
  /^men[uú]/i,
  /^semana/i,
  /^pan( y agua)?$/i,
  /^agua$/i,
  /^aceite/i,
  /^p[aá]gina/i,
  /^\d+\s*$/,
  /^[-_=*•·]+$/,
  /^\d+([.,]\d+)?\s*(g|mg|ml|kcal|cal|kj|%)$/i,
  /^kcal/i,
  /kcal\s*\|/i,
  /^[|]?\s*P:\s*HC:/i,
  /\bHC:\s*G:/i,
  /^\d+([.,]\d+)?\s*\|/,
  /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?$/i,
  /^20\d{2}$/,
  /^(del?\s+)?\d{1,2}\s*(al\s+\d{1,2}\s*)?(de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i,
  /^colegio/i,
  /^comedor/i,
  /^al[eé]rgenos?/i,
  /^(desayuno|merienda)s?$/i,
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
  const trimmed = (line ?? "").trim();
  if (!trimmed) return null;
  if (MONTH_NAMES_RE.test(trimmed) && trimmed.split(/\s+/).length <= 3) {
    const withoutMonth = trimmed.replace(MONTH_NAMES_RE, "").trim();
    if (withoutMonth.length < 3 || /^\d{0,4}$/.test(withoutMonth)) return null;
  }
  for (const { key, regex } of DAY_PATTERNS) {
    if (regex.test(trimmed)) return key;
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

function assignCoursesFromLines(textLines) {
  const courses = { Primero: "", Segundo: "", Postre: "" };
  const unlabeled = [];

  for (const line of textLines) {
    const { course, text } = classifyCourseLine(line);
    if (course && text && !courses[course]) {
      courses[course] = text;
    } else if (!course) {
      unlabeled.push(line);
    }
  }

  if (!courses.Postre) {
    const idx = unlabeled.findIndex((l) => POSTRE_KEYWORDS.test(l));
    if (idx >= 0) {
      courses.Postre = unlabeled[idx];
      unlabeled.splice(idx, 1);
    }
  }
  if (!courses.Primero && unlabeled.length > 0) courses.Primero = unlabeled.shift();
  if (!courses.Segundo && unlabeled.length > 0) courses.Segundo = unlabeled.shift();
  if (!courses.Postre && unlabeled.length > 0) courses.Postre = unlabeled.shift();

  return courses;
}

// ---------------------------------------------------------------------------
// Table reconstruction from PDF coordinates
// ---------------------------------------------------------------------------

function clusterByY(items) {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => b.y - a.y);

  const heights = sorted.map((it) => it.height).filter((h) => h > 0);
  const medianHeight =
    heights.length > 0
      ? heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)]
      : 10;
  const tolerance = medianHeight * 0.6;

  const rows = [];
  let currentRow = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - currentY) <= tolerance) {
      currentRow.push(sorted[i]);
    } else {
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
      currentRow = [sorted[i]];
      currentY = sorted[i].y;
    }
  }
  currentRow.sort((a, b) => a.x - b.x);
  rows.push(currentRow);

  return rows;
}

function detectTableColumns(headerRow) {
  const dayItems = [];
  for (const item of headerRow) {
    const day = detectDay(item.text);
    if (day && !dayItems.some((d) => d.day === day)) {
      dayItems.push({ day, x: item.x });
    }
  }

  if (dayItems.length < 3) return [];
  dayItems.sort((a, b) => a.x - b.x);

  const columns = [];
  for (let i = 0; i < dayItems.length; i++) {
    let xStart, xEnd;
    if (i === 0) {
      const gap = dayItems.length > 1 ? dayItems[1].x - dayItems[0].x : 100;
      xStart = dayItems[0].x - gap * 0.35;
    } else {
      xStart = (dayItems[i - 1].x + dayItems[i].x) / 2;
    }
    if (i === dayItems.length - 1) {
      const gap =
        dayItems.length > 1
          ? dayItems[i].x - dayItems[i - 1].x
          : 100;
      xEnd = dayItems[i].x + gap;
    } else {
      xEnd = (dayItems[i].x + dayItems[i + 1].x) / 2;
    }
    columns.push({ day: dayItems[i].day, xStart, xEnd });
  }

  return columns;
}

function findWeekLabel(rows, headerIdx) {
  if (headerIdx === 0) return "";
  const prevRow = rows[headerIdx - 1];
  const text = prevRow.map((it) => it.text).join(" ").trim();
  if (/semana/i.test(text) || /\d{1,2}\s*(de|al)\s/i.test(text)) return text;
  return "";
}

function isNutritionalRow(items) {
  const texts = items.map((it) => normalizeLine(it.text));
  return texts.every(
    (t) =>
      /^[\d.,\s|]+$/.test(t) || /kcal|HC:|[PG]:/i.test(t) || isNoise(t)
  );
}

function findWeekLabelInRow(row, leftBound) {
  const labelItems = row.filter((it) => it.x < leftBound);
  if (labelItems.length === 0) return "";
  const text = labelItems.map((it) => it.text).join(" ").trim();
  if (/semana|sem\b/i.test(text) || /\d{1,2}\s*(de|al)\s/i.test(text))
    return text;
  return "";
}

function parseTableContent(columns, contentRows) {
  const allWeeks = [];
  let currentEntries = {};
  let courseIdx = 0;
  let currentWeekLabel = "";
  const leftBound = columns[0].xStart;
  const filledCourses = new Set();

  for (const row of contentRows) {
    const labelItems = row.filter((it) => it.x < leftBound);
    const contentItems = row.filter((it) => it.x >= leftBound);

    if (isNutritionalRow(contentItems)) continue;

    const meaningful = contentItems.filter(
      (it) => !isNoise(normalizeLine(it.text))
    );
    if (meaningful.length === 0) continue;

    let course = null;
    if (labelItems.length > 0) {
      const labelText = labelItems.map((it) => it.text).join(" ").trim();
      const c = classifyCourseLine(labelText);
      if (c.course) course = c.course;
      if (!course && /semana|sem\b/i.test(labelText) && !currentWeekLabel) {
        currentWeekLabel = labelText;
      }
    }
    if (!course) {
      for (const item of meaningful) {
        const c = classifyCourseLine(normalizeLine(item.text));
        if (c.course) {
          course = c.course;
          break;
        }
      }
    }
    if (!course) {
      course = COURSE_KEYS[courseIdx % COURSE_KEYS.length];
    }

    if (filledCourses.has(course)) {
      if (Object.keys(currentEntries).length > 0) {
        allWeeks.push({ weekLabel: currentWeekLabel, entries: currentEntries });
      }
      currentEntries = {};
      courseIdx = 0;
      filledCourses.clear();
      currentWeekLabel = findWeekLabelInRow(row, leftBound);
    }

    filledCourses.add(course);

    for (const item of meaningful) {
      const text = normalizeLine(item.text);
      const colIdx = columns.findIndex(
        (col) => item.x >= col.xStart && item.x < col.xEnd
      );
      if (colIdx < 0) continue;

      const day = columns[colIdx].day;
      const key = `${day}-${course}`;

      const { course: marker, text: cleaned } = classifyCourseLine(text);
      const finalText = (marker ? cleaned : text).trim();
      if (!finalText || isNoise(finalText)) continue;

      if (!currentEntries[key]) currentEntries[key] = finalText;
      else currentEntries[key] += " " + finalText;
    }

    courseIdx++;
  }

  if (Object.keys(currentEntries).length > 0) {
    allWeeks.push({ weekLabel: currentWeekLabel, entries: currentEntries });
  }

  return allWeeks;
}

function reconstructTable(allPageItems) {
  const weeks = [];

  const pages = {};
  for (const item of allPageItems) {
    (pages[item.page] ??= []).push(item);
  }

  for (const pageNum of Object.keys(pages).sort((a, b) => a - b)) {
    const pageItems = pages[pageNum];
    const rows = clusterByY(pageItems);

    const headerIndices = [];
    for (let i = 0; i < rows.length; i++) {
      const dayMatches = new Set();
      for (const item of rows[i]) {
        const d = detectDay(item.text);
        if (d) dayMatches.add(d);
      }
      if (dayMatches.size >= 3) headerIndices.push(i);
    }

    if (headerIndices.length === 0) continue;

    for (let h = 0; h < headerIndices.length; h++) {
      const headerIdx = headerIndices[h];
      const nextHeaderIdx =
        h + 1 < headerIndices.length ? headerIndices[h + 1] : rows.length;

      const headerRow = rows[headerIdx];
      const contentRows = rows.slice(headerIdx + 1, nextHeaderIdx);
      if (contentRows.length === 0) continue;

      const columns = detectTableColumns(headerRow);
      if (columns.length < 3) continue;

      const headerWeekLabel = findWeekLabel(rows, headerIdx);
      const parsed = parseTableContent(columns, contentRows);

      for (const w of parsed) {
        if (Object.keys(w.entries).length > 0) {
          weeks.push({
            weekLabel: w.weekLabel || headerWeekLabel,
            entries: w.entries,
          });
        }
      }
    }
  }

  return weeks.length > 0 ? weeks : null;
}

// ---------------------------------------------------------------------------
// Free-text parser (OCR / flat PDF fallback)
// ---------------------------------------------------------------------------

export function parseSchoolMenuText(rawText) {
  const lines = rawText.split(/\r?\n/).map(normalizeLine).filter(Boolean);

  const result = {};
  let currentDay = null;
  let currentLines = [];

  const flush = () => {
    if (!currentDay) return;
    const usable = currentLines
      .filter((l) => !isNoise(l))
      .map(stripBullets)
      .filter(Boolean);

    const courses = assignCoursesFromLines(usable);

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
      const trailing = line
        .replace(
          /^(lunes|martes|mi[eé]rcoles|jueves|viernes|lun|mar|mi[eé]|jue|vie|l|m|x|j|v)[\s:.\-–]*/i,
          ""
        )
        .trim();
      if (trailing && trailing.length > 3) currentLines.push(trailing);
      continue;
    }
    if (currentDay) currentLines.push(line);
  }
  flush();

  return result;
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

export function parseSchoolMenuCsv(rawText) {
  const lines = rawText.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  if (lines.length === 0) return {};

  const out = {};

  const firstCell = (lines[0].split(",")[0] ?? "").trim();
  const dataLines = detectDay(firstCell) ? lines : lines.slice(1);

  if (dataLines.length > 0 && dataLines[0].includes(",")) {
    const headerCells = dataLines[0].split(",").map((c) => c.trim());
    const dayColumns = headerCells.map((c) => detectDay(c));
    const dayMatchCount = dayColumns.filter(Boolean).length;

    if (dayMatchCount >= 3) {
      for (let r = 1; r < dataLines.length; r++) {
        const cells = dataLines[r].split(",").map((c) => c.trim());
        const rowLabel = classifyCourseLine(cells[0] ?? "");
        const course =
          rowLabel.course ?? COURSE_KEYS[(r - 1) % COURSE_KEYS.length];
        for (let c = 1; c < cells.length && c < dayColumns.length; c++) {
          if (dayColumns[c] && cells[c]) {
            out[`${dayColumns[c]}-${course}`] = cells[c];
          }
        }
      }
      if (Object.keys(out).length > 0) return out;
    }
  }

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

  let i = 0;
  for (const day of DAY_KEYS) {
    for (const course of COURSE_KEYS) {
      if (i < dataLines.length && dataLines[i]) {
        out[`${day}-${course}`] = dataLines[i];
      }
      i += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// PDF extraction with coordinate-based table reconstruction
// ---------------------------------------------------------------------------

export async function extractTextFromPdf(file, { onProgress } = {}) {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const workerUrl = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;

  const allItems = [];
  const textParts = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    onProgress?.({ stage: "pdf-text", page: i, total: pdf.numPages });
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const pageItems = content.items
      .filter((it) => "str" in it && it.str.trim())
      .map((it) => ({
        text: it.str.trim(),
        x: it.transform?.[4] ?? 0,
        y: it.transform?.[5] ?? 0,
        width: it.width ?? 0,
        height: Math.abs(it.transform?.[3] ?? 0) || it.height || 10,
        page: i,
      }));

    allItems.push(...pageItems);
    textParts.push(pageItems.map((it) => it.text).join("\n"));
  }

  const rawText = textParts.join("\n").trim();

  // No usable text layer → scanned PDF. OCR every page as a local fallback.
  if (rawText.length < 40) {
    onProgress?.({ stage: "ocr-fallback", page: 0, total: pdf.numPages });
    // One worker for the whole document — tesseract.recognize() spins up and
    // tears down a worker (re-loading ~15 MB of language data) on every call.
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("spa");
    const ocrParts = [];
    try {
      for (let i = 1; i <= pdf.numPages; i += 1) {
        onProgress?.({ stage: "ocr-page", page: i, total: pdf.numPages });
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const { data } = await worker.recognize(canvas);
        ocrParts.push(data.text);
      }
    } finally {
      await worker.terminate();
    }
    return { rawText: ocrParts.join("\n"), weeks: [] };
  }

  const weeks = reconstructTable(allItems);
  return { rawText, weeks: weeks ?? [] };
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

// ---------------------------------------------------------------------------
// Week selection helper
// ---------------------------------------------------------------------------

export function selectBestWeek(weeks) {
  if (!weeks || weeks.length <= 1) return 0;

  const now = new Date();
  const todayDow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((todayDow + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const MONTH_NAMES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];

  for (let i = 0; i < weeks.length; i++) {
    const label = weeks[i].weekLabel ?? "";
    const match = label.match(
      /(\d{1,2})\s*(al\s+(\d{1,2}))?\s*(de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i
    );
    if (match) {
      const dayNum = parseInt(match[1]);
      const monthName = match[5].toLowerCase();
      const monthIdx = MONTH_NAMES.indexOf(monthName);
      if (monthIdx >= 0) {
        const weekDate = new Date(now.getFullYear(), monthIdx, dayNum);
        if (Math.abs(weekDate - monday) < 7 * 24 * 60 * 60 * 1000) return i;
      }
    }
  }

  let bestIdx = 0;
  let bestCount = 0;
  for (let i = 0; i < weeks.length; i++) {
    const count = Object.keys(weeks[i].entries).length;
    if (count > bestCount) {
      bestCount = count;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ---------------------------------------------------------------------------
// High-level entry point
// ---------------------------------------------------------------------------

async function aiParseWeeks(file, type) {
  const { parseMenu, menuToWeeksFormat } = await import("./menuParser.js");
  const menu = await parseMenu(file, type);
  return menuToWeeksFormat(menu);
}

// PDF: the vision model handles multi-week detection and dish placement far
// more reliably than the local coordinate parser across the varied layouts
// schools use, so it leads. Local text/coordinate extraction and tesseract OCR
// are the fallbacks when the model is unavailable or returns nothing.
async function importPdfMenu(file, { onProgress } = {}) {
  try {
    onProgress?.({ stage: "ai-parse" });
    const weeks = await aiParseWeeks(file, "pdf");
    if (weeks.length > 0) return { rawText: "", weeks };
  } catch {
    // fall through to local extraction / OCR
  }

  const result = await extractTextFromPdf(file, { onProgress });
  const weeks =
    result.weeks && result.weeks.length > 0
      ? result.weeks
      : [{ weekLabel: "", entries: parseSchoolMenuText(result.rawText) }];
  return { rawText: result.rawText, weeks };
}

export async function importSchoolMenuFile(file, { onProgress } = {}) {
  const name = (file.name ?? "").toLowerCase();
  const type = (file.type ?? "").toLowerCase();

  let rawText = "";
  let weeks = [];

  const isPdf = type === "application/pdf" || name.endsWith(".pdf");
  const isImage =
    type.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(name);
  const isCsv = type === "text/csv" || name.endsWith(".csv");

  if (isPdf) {
    ({ rawText, weeks } = await importPdfMenu(file, { onProgress }));
  } else if (isCsv) {
    // CSV is parsed locally (papaparse) — no network round-trip.
    try {
      weeks = await aiParseWeeks(file, "csv");
    } catch {
      rawText = await extractTextFromCsv(file);
      weeks = [{ weekLabel: "", entries: parseSchoolMenuCsv(rawText) }];
    }
  } else if (isImage) {
    // Vision model first (more accurate on photos than tesseract); OCR fallback.
    try {
      onProgress?.({ stage: "ai-parse" });
      weeks = await aiParseWeeks(file, "image");
      if (weeks.length === 0) throw new Error("empty");
    } catch {
      rawText = await extractTextFromImage(file, { onProgress });
      weeks = [{ weekLabel: "", entries: parseSchoolMenuText(rawText) }];
    }
  } else {
    throw new Error("Formato no soportado. Usa PDF, JPG/PNG o CSV.");
  }

  const bestIdx = selectBestWeek(weeks);
  const entries = weeks[bestIdx]?.entries ?? {};

  return { rawText, weeks, entries };
}
