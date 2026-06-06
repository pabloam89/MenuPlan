import { RECIPES_BY_ID } from "../data/recipes.js";
import { membersOfGroup } from "./groups.js";
import { DAYS, getMeals } from "./planner.js";
import { formatWeekRangeLabel, getWeekDates } from "./weekCalendar.js";

export function formatMenuText(data, menuPlan, groups) {
  const dates = getWeekDates();
  const weekLabel = formatWeekRangeLabel(dates);
  const meals = getMeals(data);
  const lines = [`Menú semanal (${weekLabel})`, ""];

  for (const day of DAYS) {
    const dayNum = dates[day]?.getDate();
    const header = dayNum ? `${day} ${dayNum}` : day;
    const dayLines = [];

    for (const meal of meals) {
      for (const group of groups) {
        const slot = menuPlan[group.id]?.[`${day}-${meal}`];
        if (!slot?.recipeId) continue;
        const prefix = groups.length > 1 ? `[${group.label}] ` : "";
        const mode = slot.mode === "tupper" ? " · tupper" : "";
        if (slot.firstRecipeId) {
          const first = RECIPES_BY_ID[slot.firstRecipeId];
          if (first) dayLines.push(`  ${meal}: ${prefix}1º ${first.name}${mode}`);
        }
        const recipe = RECIPES_BY_ID[slot.recipeId];
        if (recipe) {
          const label = slot.firstRecipeId ? "2º " : "";
          dayLines.push(`  ${meal}: ${prefix}${label}${recipe.name}${mode}`);
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
    lines.push("Familia:", data.members.map((m) => m.name).join(", "));
  }

  return lines.join("\n").trim();
}

export async function shareMenu(data, menuPlan, groups) {
  const text = formatMenuText(data, menuPlan, groups);

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: "Menú semanal", text });
      return { method: "share" };
    } catch (err) {
      if (err?.name === "AbortError") return { method: "cancelled" };
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return { method: "clipboard" };
  }

  return downloadMenu(data, menuPlan, groups);
}

export async function downloadMenu(data, menuPlan, groups) {
  const text = formatMenuText(data, menuPlan, groups);
  const filename = `menu-${formatWeekRangeLabel(getWeekDates()).replace(/\s+/g, "")}.txt`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { method: "download" };
}

export async function exportMenu(data, menuPlan, groups) {
  return shareMenu(data, menuPlan, groups);
}
