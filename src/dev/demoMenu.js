/**
 * El menú de la demo (`?demo=1`, `npm run dev:menu`): una semana fija de platos
 * REALES del catálogo, todos Estrella (el Recetario). «Paella mixta» está aquí
 * a propósito: el menú viejo, con ids de prototipo, enseñaba 4 pasos genéricos
 * en vez de los 16 reales.
 *
 * Es una lista fija y no un planificador a propósito: el menú de la demo tiene
 * que ser el mismo cada vez que se regenera `demoState.json`. Cada id tiene que
 * existir en el catálogo y ser Estrella (lo vigila demoMenu.test.js).
 */

/** [segundo plato (o plato único), primer plato | null] por hueco `día-comida`. */
export const DEMO_MENU_SLOTS = {
  "Lun-Comida": ["pescados_032", "sopas_cremas_011"],
  "Lun-Cena": ["huevos_018", null],
  "Mar-Comida": ["legumbres_025", null],
  "Mar-Cena": ["pasta_arroces_028", null],
  "Mié-Comida": ["pasta_arroces_077", null],
  "Mié-Cena": ["ensaladas_verduras_024", null],
  "Jue-Comida": ["carnes_045", "ensaladas_verduras_015"],
  "Jue-Cena": ["pescados_030", null],
  "Vie-Comida": ["pasta_arroces_027", null],
  "Vie-Cena": ["huevos_017", null],
  "Sáb-Comida": ["pasta_arroces_030", null],
  "Sáb-Cena": ["ensaladas_verduras_035", null],
  "Dom-Comida": ["carnes_047", "sopas_cremas_024"],
  "Dom-Cena": ["pescados_026", null],
};

/** Los ids distintos del menú demo, en orden de aparición. */
export const DEMO_MENU_IDS = [...new Set(Object.values(DEMO_MENU_SLOTS).flat().filter(Boolean))];

/** El plan en el formato de `menuPlan`: { _warnings, [grupo]: { [hueco]: { recipeId, firstRecipeId, mode, eaters, warnings } } }. */
export function planDemo(groupId, eaters = 3) {
  const slots = {};
  for (const [hueco, [recipeId, firstRecipeId]] of Object.entries(DEMO_MENU_SLOTS)) {
    slots[hueco] = { recipeId, firstRecipeId, mode: "casa", eaters, warnings: [] };
  }
  return { _warnings: [], [groupId]: slots };
}
