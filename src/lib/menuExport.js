import { RECIPES_BY_ID } from "../data/recipes.js";
import { DAYS, getDayMeals } from "./planner.js";
import { formatWeekRangeLabel, getWeekDates } from "./weekCalendar.js";
import {
  enrichItem,
  isPantryItem,
  itemsByAisle,
  mergeShoppingItems,
} from "./shoppingListUtils.js";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function longDate(date) {
  if (!date) return "";
  return `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;
}

const DAY_FULL = {
  Lun: "Lunes", Mar: "Martes", Mié: "Miércoles", Jue: "Jueves",
  Vie: "Viernes", Sáb: "Sábado", Dom: "Domingo",
};

export function formatMenuText(data, menuPlan, groups) {
  const dates = getWeekDates();
  const weekLabel = formatWeekRangeLabel(dates);
  // getDayMeals (not getMeals): getMeals only ever returns the two main meals
  // the AI planner budgets for (Comida/Cena) — desayuno/merienda/postre are
  // planned separately (see planExtraMealsForGroup) and were silently dropped
  // from the exported/shared text even when active and shown on screen.
  const meals = getDayMeals(data);
  const multiGroup = groups.length > 1;

  const lines = [`MENÚ SEMANAL — ${weekLabel}`, ""];

  for (const day of DAYS) {
    const date = dates[day];
    const header = date
      ? `${DAY_FULL[day] ?? day}, ${longDate(date)}`
      : (DAY_FULL[day] ?? day);

    const dayLines = [];

    for (const meal of meals) {
      for (const group of groups) {
        const slot = menuPlan[group.id]?.[`${day}-${meal}`];
        if (!slot?.recipeId) continue;

        const groupLabel = multiGroup ? ` [${group.label}]` : "";
        const tupper = slot.mode === "tupper" ? " (tupper)" : "";

        const dishes = [];
        if (slot.firstRecipeId) {
          const first = RECIPES_BY_ID[slot.firstRecipeId];
          if (first) dishes.push(first.name);
        }
        const recipe = RECIPES_BY_ID[slot.recipeId];
        if (recipe) dishes.push(recipe.name);

        if (dishes.length > 0) {
          // Padded to the widest label ("Desayuno"/"Merienda", 8 chars) so every
          // row's colon lines up regardless of which meals are active.
          const mealPad = "  " + meal.padEnd(8);
          dayLines.push(`${mealPad}:${groupLabel} ${dishes.join(" · ")}${tupper}`);
        }
      }
    }

    if (dayLines.length > 0) {
      lines.push(header);
      lines.push(...dayLines);
      lines.push("");
    }
  }

  if (data.members?.length) {
    lines.push(`Familia: ${data.members.map((m) => m.name).join(", ")}`);
  }

  return lines.join("\n").trim();
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/**
 * Printable HTML for the weekly menu — same content as formatMenuText, laid
 * out for a real PDF via the browser's own print pipeline (see
 * downloadMenuPdf) rather than a raw text dump saved with a .txt extension.
 */
export function buildMenuPrintHtml(data, menuPlan, groups) {
  const dates = getWeekDates();
  const weekLabel = formatWeekRangeLabel(dates);
  const meals = getDayMeals(data);
  const multiGroup = groups.length > 1;

  const dayBlocks = [];
  for (const day of DAYS) {
    const date = dates[day];
    const header = date
      ? `${DAY_FULL[day] ?? day}, ${longDate(date)}`
      : (DAY_FULL[day] ?? day);

    const rows = [];
    for (const meal of meals) {
      for (const group of groups) {
        const slot = menuPlan[group.id]?.[`${day}-${meal}`];
        if (!slot?.recipeId) continue;

        const dishes = [];
        if (slot.firstRecipeId) {
          const first = RECIPES_BY_ID[slot.firstRecipeId];
          if (first) dishes.push(first.name);
        }
        const recipe = RECIPES_BY_ID[slot.recipeId];
        if (recipe) dishes.push(recipe.name);
        if (dishes.length === 0) continue;

        const groupTag = multiGroup ? `<span class="tag">${escapeHtml(group.label)}</span>` : "";
        const tupperTag = slot.mode === "tupper" ? `<span class="tag">tupper</span>` : "";
        rows.push(
          `<div class="row"><span class="meal">${escapeHtml(meal)}</span>` +
          `<span class="dishes">${escapeHtml(dishes.join(" · "))}</span>` +
          `${groupTag}${tupperTag}</div>`,
        );
      }
    }

    if (rows.length > 0) {
      dayBlocks.push(`<section class="day"><h2>${escapeHtml(header)}</h2>${rows.join("")}</section>`);
    }
  }

  const familyLine = data.members?.length
    ? `<p class="family">Familia: ${escapeHtml(data.members.map((m) => m.name).join(", "))}</p>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Menú semanal — ${escapeHtml(weekLabel)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #142f1d; margin: 0; padding: 28px 32px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .week { font-size: 13px; color: #5a6a5f; margin: 0 0 20px; }
  .day { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; }
  .day h2 { font-size: 14px; margin: 0 0 6px; padding-bottom: 4px; border-bottom: 1.5px solid #2d5a3d; color: #1a3a24; }
  .row { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; font-size: 12.5px; }
  .meal { flex: 0 0 68px; font-weight: 700; color: #2d5a3d; }
  .dishes { flex: 1; }
  .tag { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #7a8a7f; border: 1px solid #d5ddd7; border-radius: 999px; padding: 1px 7px; }
  .family { margin-top: 18px; font-size: 12px; color: #5a6a5f; }
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
  <h1>Menú semanal</h1>
  <p class="week">${escapeHtml(weekLabel)}</p>
  ${dayBlocks.join("")}
  ${familyLine}
</body>
</html>`;
}

export function formatShoppingText(shopping) {
  const rawItems = shopping?.items ?? [];
  if (!rawItems.length) return "La lista de la compra está vacía.";

  const merged = mergeShoppingItems(rawItems);
  const shoppingItems = merged.filter((it) => !isPantryItem(it)).map(enrichItem);
  const pantryItems = merged
    .filter(isPantryItem)
    .sort((a, b) => a.name.localeCompare(b.name));
  const groups = itemsByAisle(shoppingItems);

  const lines = ["LISTA DE LA COMPRA", ""];

  for (const { aisle, items } of groups) {
    if (!items?.length) continue;
    lines.push(aisle.toUpperCase());
    for (const it of items) {
      const check = it.have || it.atHome ? "✓" : "·";
      lines.push(`  ${check} ${it.name} — ${it.displayQty ?? it.qty}`);
    }
    lines.push("");
  }

  if (pantryItems.length > 0) {
    lines.push("YA LO TIENES EN CASA");
    for (const it of pantryItems) {
      lines.push(`  · ${it.name} — ${it.displayQty ?? it.qty}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

async function shareText(title, text) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text });
      return { method: "share" };
    } catch (err) {
      if (err?.name === "AbortError") return { method: "cancelled" };
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return { method: "clipboard" };
  }

  return { method: "none" };
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareMenu(data, menuPlan, groups) {
  const text = formatMenuText(data, menuPlan, groups);
  const result = await shareText("Menú semanal", text);
  if (result.method !== "none") return result;
  return downloadMenu(data, menuPlan, groups);
}

export async function downloadMenu(data, menuPlan, groups) {
  const text = formatMenuText(data, menuPlan, groups);
  const filename = `menu-${formatWeekRangeLabel(getWeekDates()).replace(/\s+/g, "")}.txt`;
  downloadText(text, filename);
  return { method: "download" };
}

/**
 * A real PDF, not a .txt with the wrong extension: opens the printable HTML
 * (buildMenuPrintHtml) in a new tab and triggers the browser's own print
 * dialog, where "Guardar como PDF" produces an actual PDF file — no new
 * client-side PDF-generation dependency needed. window.open is called
 * synchronously (before any await) so it fires within the same click-driven
 * task as the button press and isn't caught by popup blockers; if a blocker
 * (or an embedded/sandboxed webview) still refuses the window, this falls
 * back to the plain-text download so the action does something rather than
 * silently failing.
 */
export async function downloadMenuPdf(data, menuPlan, groups) {
  const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
  if (!win) return downloadMenu(data, menuPlan, groups);

  const html = buildMenuPrintHtml(data, menuPlan, groups);
  win.document.open();
  win.document.write(html);
  win.document.close();

  await new Promise((resolve) => {
    if (win.document.readyState === "complete") resolve();
    else win.addEventListener("load", resolve, { once: true });
  });

  win.focus();
  win.print();
  return { method: "print" };
}

export async function shareShoppingList(shopping) {
  const text = formatShoppingText(shopping);
  const result = await shareText("Lista de la compra", text);
  if (result.method !== "none") return result;
  const filename = `lista-compra.txt`;
  downloadText(text, filename);
  return { method: "download" };
}

export async function exportMenu(data, menuPlan, groups) {
  return shareMenu(data, menuPlan, groups);
}
