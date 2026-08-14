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
