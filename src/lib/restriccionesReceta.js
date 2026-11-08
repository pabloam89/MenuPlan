/**
 * Qué choca de una receta con la gente de la casa, persona a persona.
 *
 * El motor ya excluye todo esto al generar el menú (filterRecipes.js), pero
 * cuando Lola ENSEÑA recetas (buscar_recetas) se saltaba el filtro y solo
 * avisaba de los alérgenos: una receta con jamón serrano salía sin aviso para
 * una casa con una embarazada, y unas croquetas de bebé para un bebé que aún
 * toma cremas. Aquí se comprueba con las MISMAS reglas que el motor
 * (allergens.js, intolerances.js, substitutions.js, babyStage.js), para que
 * enseñar y generar no tengan dos ideas distintas de qué es seguro.
 *
 * Distingue lo que se ADAPTA (lactosa fina, alcohol de cocina: el motor lo
 * cambia por la versión sin) de lo que excluye: decir «no apta» de algo que el
 * menú sí pondría adaptado asustaría sin motivo.
 */

import { EU_ALLERGENS, normalizeAllergenId, recipeIngredientsHitAllergens } from "./allergens.js";
import { INTOLERANCE_RULES, DIET_RULES, recipeHitsIntolerances, recipeViolatesDiet } from "./intolerances.js";
import { isAdaptableRestriction } from "./substitutions.js";
import { puedeContenerDe } from "../utils/filterRecipes.js";
import { etapaBebeDe } from "./babyStage.js";

const ESTADOS_CON_ALCOHOL = new Set(["embarazo", "lactancia"]);

/**
 * @returns {{ motivo: "alergia"|"puede_contener"|"intolerancia"|"dieta"|"estado"|"alcohol"|"etapa",
 *   id: string, etiqueta: string, adapta: boolean, quien: string[] }[]}
 *   un choque por motivo e id, con las personas a las que afecta
 */
export function choquesDeReceta(receta, data) {
  if (!receta) return [];
  const porClave = new Map();
  const apunta = (motivo, id, etiqueta, adapta, quien) => {
    const k = `${motivo}|${id}|${adapta}`;
    if (!porClave.has(k)) porClave.set(k, { motivo, id, etiqueta, adapta, quien: [] });
    if (quien && !porClave.get(k).quien.includes(quien)) porClave.get(k).quien.push(quien);
  };

  const lleva = new Set((receta.allergens ?? []).map(normalizeAllergenId));
  const puede = new Set(puedeContenerDe(receta).map(normalizeAllergenId));
  const ingredientes = (receta.ingredients ?? []).map((i) => i?.name).filter(Boolean);

  for (const p of data?.members ?? []) {
    const nombre = p.name || "alguien";
    for (const raw of p.allergies ?? []) {
      const id = normalizeAllergenId(raw);
      const etiqueta = EU_ALLERGENS[id]?.label ?? String(raw);
      if (lleva.has(id) || recipeIngredientsHitAllergens(ingredientes, new Set([id]))) apunta("alergia", id, etiqueta, false, nombre);
      else if (puede.has(id)) apunta("puede_contener", id, etiqueta, false, nombre);
    }
    for (const id of p.intolerances ?? []) {
      if (DIET_RULES[id]) {
        if (recipeViolatesDiet(receta, [id])) apunta("dieta", id, DIET_RULES[id].label, false, nombre);
      } else if (INTOLERANCE_RULES[id] && recipeHitsIntolerances(receta, [id])) {
        apunta("intolerancia", id, INTOLERANCE_RULES[id].label, isAdaptableRestriction(id), nombre);
      }
    }
    for (const id of p.dietaryStates ?? []) {
      if (INTOLERANCE_RULES[id] && recipeHitsIntolerances(receta, [id])) apunta("estado", id, INTOLERANCE_RULES[id].label, false, nombre);
      if (ESTADOS_CON_ALCOHOL.has(id) && recipeHitsIntolerances(receta, ["alcohol_cocina"])) {
        apunta("alcohol", "alcohol_cocina", INTOLERANCE_RULES.alcohol_cocina.label, isAdaptableRestriction("alcohol_cocina"), nombre);
      }
    }
  }

  // Un plato de bebé de sólidos para un bebé que aún toma cremas.
  if (receta.category === "bebes" && etapaBebeDe(data) === "cremas" && (receta.etapaBebe ?? "cremas") === "solidos") {
    apunta("etapa", "solidos", "Sólidos", false, null);
  }
  return [...porClave.values()];
}

/** Una línea por choque, para enseñarla junto a la receta. */
export function textoDeChoque(c) {
  const quien = c.quien.length ? ` (${c.quien.join(", ")})` : "";
  switch (c.motivo) {
    case "alergia": return `⚠️ lleva ${c.etiqueta.toLowerCase()}${quien}`;
    case "puede_contener": return `⚠️ puede contener ${c.etiqueta.toLowerCase()}${quien}`;
    case "dieta": return `⚠️ no es ${c.etiqueta.toLowerCase()}${quien}`;
    case "estado": return `⚠️ no apta en ${c.etiqueta.toLowerCase()}${quien}`;
    case "etapa": return "⚠️ aún no: el bebé toma cremas";
    default:
      return c.adapta
        ? `se adapta: sin ${c.id === "alcohol_cocina" ? "alcohol" : c.etiqueta.toLowerCase().replace(/^intolerancia a la /, "")}${quien}`
        : `⚠️ no apta: ${c.etiqueta.toLowerCase()}${quien}`;
  }
}
