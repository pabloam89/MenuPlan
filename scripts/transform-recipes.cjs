const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join('C:', 'Users', 'alvar', 'UsersalvarMenuPlan', 'src', 'data', 'recipes');

// ── Type assignment ──────────────────────────────────────────────────────────
const ALWAYS_COMPLETO = new Set([
  'sopas_cremas', 'ensaladas_verduras', 'platos_unicos',
  'cenas_rapidas', 'legumbres', 'pasta_arroces',
]);

function hasStarchyIngredient(recipe) {
  return recipe.ingredients.some(i => {
    const n = i.name.toLowerCase();
    return (
      n.includes('patata') ||
      n === 'papa' ||
      n.startsWith('papa ') ||
      n.includes('pan de hamburguesa')
    );
  });
}

// Only huevos_002 (tortilla francesa) is principal among huevos
const EXPLICIT_PRINCIPAL = new Set(['huevos_002']);

function getType(recipe) {
  if (EXPLICIT_PRINCIPAL.has(recipe.id)) return 'principal';
  if (ALWAYS_COMPLETO.has(recipe.category)) return 'completo';
  if (hasStarchyIngredient(recipe)) return 'completo';
  // plato_unico without "segundo" means self-contained (e.g., fideuá, paella)
  if (recipe.mealRole.includes('plato_unico') && !recipe.mealRole.includes('segundo')) return 'completo';
  return 'principal';
}

// ── Required appliance ───────────────────────────────────────────────────────
const APPLIANCE_MAP = {
  // carnes
  carnes_001: 'horno', carnes_011: 'horno', carnes_013: 'horno', carnes_019: 'horno',
  // pescados
  pescados_002: 'horno', pescados_005: 'horno', pescados_008: 'horno',
  pescados_013: 'horno', pescados_018: 'horno', pescados_022: 'horno', pescados_024: 'horno',
  // huevos
  huevos_009: 'horno', huevos_013: 'horno',
  // legumbres
  legumbres_010: 'batidora',
  // pasta_arroces
  pasta_arroces_004: 'horno', pasta_arroces_010: 'batidora',
  pasta_arroces_017: 'horno', pasta_arroces_018: 'horno',
  // sopas_cremas — cremas need batidora; sopa de cebolla needs horno for gratinado
  sopas_cremas_001: 'batidora', sopas_cremas_003: 'batidora',
  sopas_cremas_004: 'batidora', sopas_cremas_005: 'batidora',
  sopas_cremas_006: 'batidora', sopas_cremas_008: 'batidora',
  sopas_cremas_009: 'batidora', sopas_cremas_010: 'horno',
  sopas_cremas_011: 'batidora', sopas_cremas_012: 'batidora',
  sopas_cremas_014: 'batidora', sopas_cremas_015: 'batidora',
  sopas_cremas_016: 'batidora', sopas_cremas_017: 'batidora',
  sopas_cremas_020: 'batidora',
  // ensaladas_verduras
  ensaladas_verduras_004: 'horno', ensaladas_verduras_006: 'horno',
  ensaladas_verduras_007: 'horno', ensaladas_verduras_009: 'horno',
  ensaladas_verduras_011: 'horno', ensaladas_verduras_017: 'horno',
  // platos_unicos
  platos_unicos_002: 'horno', platos_unicos_004: 'horno',
  platos_unicos_007: 'horno', platos_unicos_008: 'horno',
  platos_unicos_012: 'horno', platos_unicos_013: 'horno',
};

// ── mealRole fix ─────────────────────────────────────────────────────────────
// Legumbres: never "cena"
// Carnes pesadas (guisos/estofados): never "cena"
const HEAVY_STEW_RE = /guiso|guisad|estofado|ragú|ragu|fricandó|fricando|redondo de|magro con/i;

function fixMealRole(recipe) {
  const roles = [...recipe.mealRole];
  if (recipe.category === 'legumbres') {
    const filtered = roles.filter(r => r !== 'cena');
    return filtered.length ? filtered : roles;
  }
  if (recipe.category === 'carnes' && HEAVY_STEW_RE.test(recipe.name)) {
    const filtered = roles.filter(r => r !== 'cena');
    return filtered.length ? filtered : roles;
  }
  return roles;
}

// ── Transform ────────────────────────────────────────────────────────────────
function transformRecipe(recipe) {
  const type = getType(recipe);
  const appliance = APPLIANCE_MAP[recipe.id];
  const newMealRole = fixMealRole(recipe);

  // Rebuild preserving key order, inserting type (+ requiredAppliance) right after mealRole
  const result = {};
  for (const [k, v] of Object.entries(recipe)) {
    if (k === 'mealRole') {
      result.mealRole = newMealRole;
      result.type = type;
      if (appliance) result.requiredAppliance = appliance;
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ── Run ──────────────────────────────────────────────────────────────────────
const FILES = [
  'carnes.json', 'pescados.json', 'huevos.json',
  'pasta_arroces.json', 'sopas_cremas.json', 'ensaladas_verduras.json',
  'platos_unicos.json', 'cenas_rapidas.json', 'legumbres.json',
];

let total = 0;
const report = [];
for (const file of FILES) {
  const filePath = path.join(DATA_DIR, file);
  const recipes = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const updated = recipes.map(transformRecipe);
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
  total += updated.length;

  // Summary stats
  const principals = updated.filter(r => r.type === 'principal').length;
  const completos = updated.filter(r => r.type === 'completo').length;
  const withAppliance = updated.filter(r => r.requiredAppliance).length;
  const mealRoleFixed = updated.filter((r, i) => {
    return JSON.stringify(r.mealRole) !== JSON.stringify(recipes[i].mealRole);
  }).length;
  report.push(`  ${file.padEnd(28)} ${updated.length} recipes | principal:${principals} completo:${completos} appliance:${withAppliance} mealRoleFix:${mealRoleFixed}`);
}

console.log('\nTransformation complete:');
report.forEach(l => console.log(l));
console.log(`\nTotal: ${total} recipes updated`);
