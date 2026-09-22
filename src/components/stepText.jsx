/**
 * Resolución de los {{marcadores}} de un paso a lenguaje de cocina.
 *
 * Vive aparte de RecipeSteps.jsx desde que el modo cocina (CookMode.jsx) pinta
 * los mismos pasos: un paso tiene que leerse igual en la ficha y en la guía, y
 * un segundo resolvedor sería la tercera copia del mismo parser en el proyecto
 * (la otra es stripStepMarkers, en lib/recipeSteps.js, que solo los quita).
 */

import { isQualitativeUnit } from "../lib/ingredientCategories.js";
import { kitchenHint } from "../lib/kitchenUnits.js";
import { formatQty, findIngredientForMarker } from "../lib/recipeSteps.js";

function parseQtyMarker(raw) {
  const [name, mode] = raw.split("|").map((s) => s.trim());
  return { name, mode: mode || "auto" };
}

/** Pluralización básica es-ES para piezas ("huevo"→"huevos", "limón"→"limones"). */
function pluralizeEs(word, n) {
  if (n === 1) return word;
  if (/[aeiouáéíóú]$/i.test(word)) return `${word}s`;
  if (/ón$/i.test(word)) return word.replace(/ón$/i, "ones");
  if (/z$/i.test(word)) return word.replace(/z$/i, "ces");
  return `${word}es`;
}

/** Cantidad en lenguaje de cocina para el text del paso (dientes, al gusto, chorrito…). */
function formatStepIngredient(ing, mode = "auto") {
  const qty = ing.qtyScaled ?? ing.qty;
  const name = ing.name.charAt(0).toLowerCase() + ing.name.slice(1);
  const hint = ing.hint ?? kitchenHint(ing.name, qty, ing.unit);

  if (mode === "chorrito") return "un chorrito de aceite de oliva";
  if (mode === "abundante") return "abundante aceite de oliva";
  if (mode === "gusto") return `${name} al gusto`;
  if (mode === "pizca") return `una pizca de ${name}`;

  if (isQualitativeUnit(ing.unit)) return name;

  // Piezas contables ("ud"): "1 huevo", "2 limones" — sin "N ud de …".
  if (ing.unit === "ud") {
    const n = Math.max(1, Math.round(qty));
    return `${n} ${pluralizeEs(name, n)}`;
  }

  if (hint === "al gusto") return `${name} al gusto`;
  if (hint === "pizca") return `una pizca de ${name}`;

  if (hint?.startsWith("≈ ")) {
    const part = hint.slice(2); // p. ej. "2 pechugas"
    // Evita redundancias tipo "2 pechugas de pechuga de pollo": si el nombre
    // empieza por el sustantivo de la pieza, se suelta ese sustantivo.
    const pieceNoun = part.replace(/^[\d.,/\s½¼⅓⅔¾⅛]+/, "").trim();
    const nounSingular = pieceNoun.replace(/s$/, "");
    if (nounSingular && name.startsWith(nounSingular)) {
      const rest = name.slice(nounSingular.length).replace(/^s?\s*/, "").trim();
      return rest ? `${part} ${rest}` : part;
    }
    return `${part} de ${name}`;
  }

  // Aceite en cantidades pequeñas (pintar, aliñar): chorrito antes que cucharadas.
  if (ing.unit === "ml" && /aceite/.test(ing.name.toLowerCase()) && qty <= 25) {
    return "un chorrito de aceite de oliva";
  }

  const label = ing.label ?? formatQty(qty, ing.unit);
  return `${label} de ${name}`;
}

function userHasKitchenTool(name, kitchenTools) {
  const key = name.trim().toLowerCase();
  return (kitchenTools ?? []).some((t) => String(t).trim().toLowerCase() === key);
}

/** Utensilios opcionales: si no están en kitchenTools, cae al fallback (p. ej. plancha → sartén). */
function resolveCookwareMarker(name, kitchenTools) {
  const key = name.trim().toLowerCase();
  if (key === "plancha") {
    return userHasKitchenTool("Plancha", kitchenTools) ? "la plancha" : "la sartén";
  }
  if (key === "sartén" || key === "sarten") return "la sartén";
  return name.trim();
}

/** Sustituye {{@Plancha}} (utensilio), {{Ingrediente}} o {{Ingrediente|modo}}. */
export function renderStepText(text, ingredients, kitchenTools = []) {
  if (!text) return text;
  if (!text.includes("{{")) return text;

  const parts = [];
  const re = /\{\{([^}]+)\}\}/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[1].trim();
    if (raw.startsWith("@")) {
      parts.push(resolveCookwareMarker(raw.slice(1), kitchenTools));
    } else {
      const { name, mode } = parseQtyMarker(raw);
      const ing = findIngredientForMarker(name, ingredients);
      if (ing) {
        parts.push(
          <strong key={`q-${k++}`} style={{ fontWeight: 800, color: "#142f1d" }}>
            {formatStepIngredient(ing, mode)}
          </strong>,
        );
      } else {
        parts.push(name);
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : parts;
}
