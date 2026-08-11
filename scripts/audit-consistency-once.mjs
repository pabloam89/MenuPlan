/**
 * One-off cross-catalog consistency audit (read-only).
 * Usage: node scripts/audit-consistency-once.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");

const VALID_APPLIANCES = new Set([
  "airfryer", "horno", "thermomix", "vaporera", "olla_express", "microondas",
]);
const VALID_DIFFICULTIES = new Set(["elaborada", "facil", "normal"]);
const VALID_ALLERGENS = new Set([
  "frutos_secos", "gluten", "huevo", "lactosa", "marisco", "moluscos",
  "pescado", "sesamo", "cacahuetes", "soja", "apio", "mostaza", "sulfitos", "altramuces",
]);
const OFF_MENU_CATEGORIES = new Set(["desayunos", "meriendas", "postres", "bebes"]);
const OFF_MENU_ROLES = new Set(["desayuno", "merienda", "postre"]);

// --- helpers ---
function norm(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function tokens(text) {
  return norm(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_TOKENS.has(t));
}

const STOP_TOKENS = new Set([
  "de", "con", "al", "la", "el", "los", "las", "y", "en", "a", "del", "para",
  "sin", "casero", "casera", "caseros", "caseras", "tradicional", "clasico",
  "clasica", "facil", "rapido", "rapida", "casero", "estilo", "tipo",
]);

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function fmt(recipe, detail) {
  return `${recipe.id} "${recipe.name}" · ${detail}`;
}

function loadAllRecipes() {
  const recipes = [];
  const byFile = new Map();
  for (const file of readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const fileKey = basename(file, ".json");
    const entries = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"));
    byFile.set(fileKey, entries);
    for (const r of entries) {
      recipes.push({ ...r, _file: fileKey });
    }
  }
  return { recipes, byFile };
}

// Ingredient -> expected allergens (catalog vocabulary)
const INGREDIENT_ALLERGEN_RULES = [
  { allergen: "gluten", patterns: [
    /\bharina\b/, /\bpan\b/, /\bpasta\b/, /\bmacarron/, /\bespaguet/, /\bfideo/,
    /\bcuscus\b/, /\bcous ?cous\b/, /\brebozad/, /\bempanad/, /\bgallet/,
    /\btortilla de trigo\b/, /\btortilla\b.*\btrigo\b/, /\bnoodle/,
    /\blasañ/, /\braviol/, /\btallarin/, /\bspaghetti\b/, /\bpenne\b/,
    /\bfusilli\b/, /\brigatoni\b/, /\btortellini\b/, /\bgnocchi\b/,
  ]},
  { allergen: "lactosa", patterns: [
    /\bleche\b/, /\bnata\b/, /\bqueso\b/, /\bmantequilla\b/, /\bbechamel\b/,
    /\byogur/, /\byoghurt\b/, /\bkefir\b/, /\bcrema\b.*\bnata\b/, /\bnata\b.*\bcrema\b/,
    /\bfromage\b/, /\brequeson\b/, /\bricotta\b/, /\bmozzarella\b/, /\bgrana\b/,
    /\bcheddar\b/, /\bmanzana\b.*\bqueso\b/,
  ]},
  { allergen: "huevo", patterns: [
    /\bhuev/, /\byema\b/, /\bclara\b/, /\bmerengue\b/, /\bmayonesa\b/,
  ]},
  { allergen: "pescado", patterns: [
    /\batun\b/, /\bsalmon\b/, /\bbacalao\b/, /\bmerluza\b/, /\bdorada\b/,
    /\blubina\b/, /\bsardina\b/, /\barenque\b/, /\btrucha\b/, /\bpez\b/,
    /\bpescad/, /\bcolin\b/, /\brape\b/, /\bboqueron/, /\banchoa\b/,
    /\bsurimi\b/, /\bbonito\b/, /\bcaballa\b/,
  ]},
  { allergen: "marisco", patterns: [
    /\bgamb/, /\blangostin/, /\bcamar/, /\bcigala\b/, /\bcentolla\b/,
    /\bmarisco\b/, /\bcrevet/, /\bscampi\b/,
  ]},
  { allergen: "moluscos", patterns: [
    /\bcalamar/, /\bsepia\b/, /\bpulpo\b/, /\bmejillon/, /\bmejill/,
    /\balmeja\b/, /\bostra\b/, /\bberberecho\b/, /\bnavaja\b/, /\bchipiron/,
  ]},
  { allergen: "frutos_secos", patterns: [
    /\bnuez\b/, /\bnueces\b/, /\balmendr/, /\bpino\b/, /\bpiñon/, /\bpinon/,
    /\bavellana/, /\bpistach/, /\bmacadamia\b/, /\bnuez\b/, /\bcashew\b/,
    /\bcastañ/, /\bcastan/,
  ]},
  { allergen: "sesamo", patterns: [/\bsesam/, /\bajonjol/] },
  { allergen: "soja", patterns: [
    /\bsoja\b/, /\btofu\b/, /\bedamame\b/, /\btempeh\b/, /\btamari\b/, /\bmiso\b/,
    /\bsalsa de soja\b/,
  ]},
  { allergen: "cacahuetes", patterns: [/\bcacahuet/, /\bcacahuate\b/, /\bmani\b/] },
  { allergen: "apio", patterns: [/\bapio\b/] },
  { allergen: "mostaza", patterns: [/\bmostaza\b/] },
  { allergen: "sulfitos", patterns: [/\bsulfito\b/, /\bvino\b/, /\bvinagre\b/] },
  { allergen: "altramuces", patterns: [/\baltramuz/, /\blupino\b/] },
];

function deriveAllergensFromIngredients(ingredientNames) {
  const hay = ingredientNames.map(norm).join(" | ");
  const found = new Set();
  for (const { allergen, patterns } of INGREDIENT_ALLERGEN_RULES) {
    if (patterns.some((p) => p.test(hay))) found.add(allergen);
  }
  return found;
}

// Protein detection from ingredients
const PROTEIN_HINTS = {
  pollo: [/\bpollo\b/, /\bcontramuslo/, /\bpechuga\b.*\bpollo\b/, /\bpollo\b.*\bpechuga\b/],
  ternera: [/\bternera\b/, /\bcarne\b.*\bvaca\b/, /\bvaca\b/, /\bcerdo\b/, /\bcochinillo\b/],
  cerdo: [/\bcerdo\b/, /\blomo\b.*\bcerdo\b/, /\bcochinillo\b/],
  pavo: [/\bpavo\b/, /\bpavo\b.*\bindia\b/],
  pescado_azul: [/\bsalmon\b/, /\batun\b/, /\bcaballa\b/, /\bsardina\b/, /\banchoa\b/, /\bbonito\b/],
  pescado_blanco: [/\bmerluza\b/, /\bbacalao\b/, /\bdorada\b/, /\blubina\b/, /\bcolin\b/, /\brape\b/],
  marisco: [/\bgamb/, /\blangostin/, /\bcalamar/, /\bsepia\b/, /\bpulpo\b/, /\bmejillon/],
  huevo: [/\bhuev/],
  legumbre: [/\blenteja/, /\bgarbanzo/, /\balubia/, /\bhaba\b/, /\bjudia\b/, /\bsoja\b/],
};

function detectProteinsFromIngredients(ingredientNames) {
  const hay = ingredientNames.map(norm).join(" | ");
  const hits = [];
  for (const [protein, patterns] of Object.entries(PROTEIN_HINTS)) {
    if (patterns.some((p) => p.test(hay))) hits.push(protein);
  }
  return hits;
}

// Common ingredient keywords for prepSummary scan
const PREP_INGREDIENT_KEYWORDS = [
  "espinaca", "espinacas", "nata", "queso", "vino", "leche", "mantequilla",
  "ajo", "cebolla", "tomate", "pimiento", "patata", "patatas", "arroz",
  "pasta", "pollo", "ternera", "cerdo", "pescado", "salmon", "atun", "merluza",
  "huevo", "huevos", "yogur", "yogurt", "limon", "limón", "naranja", "manzana",
  "plátano", "platano", "champiñon", "champiñones", "champinon", "seta", "setas",
  "calabacin", "calabacín", "zanahoria", "perejil", "albahaca", "romero", "tomillo",
  "jamon", "jamón", "bacon", "bechamel", "harina", "pan", "aceite", "vinagre",
  "mostaza", "miel", "azucar", "azúcar", "chocolate", "almendra", "nuez", "nueces",
  "gambas", "langostinos", "calamar", "pulpo", "mejillones", "lentejas", "garbanzos",
  "judias", "judías", "alubias", "crema", "mantequilla", "bacalao", "gambas",
  "pavo", "pechuga", "muslos", "contramuslos", "bonito", "sardinas", "anchoas",
  "chocolate", "cacao", "vainilla", "canela", "curry", "comino", "pimenton", "pimentón",
  "guisantes", "maiz", "maíz", "trigo", "avena", "kefir", "tofu", "soja",
  "coliflor", "brocoli", "brócoli", "lechuga", "rucula", "rúcula", "aguacate",
  "pepino", "sandia", "sandía", "melón", "melon", "fresa", "fresas", "arándanos",
];

function ingredientHaystack(names) {
  return norm(names.join(" "));
}

function keywordInHaystack(keyword, hay) {
  const k = norm(keyword);
  if (k.length < 3) return false;
  const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  return re.test(hay);
}

function ingredientSetSimilarity(a, b) {
  const na = a.map((i) => norm(i.name)).sort();
  const nb = b.map((i) => norm(i.name)).sort();
  return jaccard(na, nb);
}

// --- load ---
const { recipes, byFile } = loadAllRecipes();
console.error(`Loaded ${recipes.length} recipes from ${byFile.size} files`);

const results = {};

function report(checkId, title, items) {
  results[checkId] = { title, count: items.length, items };
}

// ========== CHECK 1: IDs ==========
{
  const items = [];
  const idMap = new Map();
  for (const r of recipes) {
    if (!idMap.has(r.id)) idMap.set(r.id, []);
    idMap.get(r.id).push(r);
  }
  for (const [id, group] of idMap) {
    if (group.length > 1) {
      const files = group.map((r) => r._file).join(", ");
      items.push(`${id} · DUPLICADO en archivos: ${files}`);
    }
  }
  for (const r of recipes) {
    const expectedPrefix = r._file;
    if (r.category !== expectedPrefix) {
      items.push(fmt(r, `category "${r.category}" ≠ archivo "${expectedPrefix}.json"`));
    }
    const idMatch = /^([a-z_]+)_(\d+)$/.exec(r.id);
    if (!idMatch) {
      items.push(fmt(r, `id no sigue patrón {categoria}_{NNN}: "${r.id}"`));
    } else {
      const [, prefix, num] = idMatch;
      if (prefix !== r.category) {
        items.push(fmt(r, `prefijo id "${prefix}" ≠ category "${r.category}"`));
      }
      if (prefix !== r._file) {
        items.push(fmt(r, `prefijo id "${prefix}" ≠ archivo "${r._file}"`));
      }
      if (num.length !== 3) {
        items.push(fmt(r, `sufijo numérico no es 3 dígitos: "${num}"`));
      }
    }
  }
  report(1, "IDs duplicados o formato inconsistente", items);
}

// ========== CHECK 2: Near-dupes ==========
{
  const items = [];

  // Exact name duplicates
  const nameMap = new Map();
  for (const r of recipes) {
    const key = norm(r.name);
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key).push(r);
  }
  for (const [, group] of nameMap) {
    if (group.length > 1) {
      const ids = group.map((r) => r.id).join(", ");
      items.push(`NOMBRE EXACTO duplicado: "${group[0].name}" · ${ids}`);
    }
  }

  // Near-dup names (token jaccard >= 0.75, different ids)
  for (let i = 0; i < recipes.length; i++) {
    for (let j = i + 1; j < recipes.length; j++) {
      const a = recipes[i];
      const b = recipes[j];
      if (norm(a.name) === norm(b.name)) continue;
      const sim = jaccard(tokens(a.name), tokens(b.name));
      if (sim >= 0.75) {
        items.push(
          `NOMBRE near-dupe (sim=${sim.toFixed(2)}): ${a.id} "${a.name}" ↔ ${b.id} "${b.name}"`,
        );
      }
    }
  }

  // Ingredient similarity without baseDishId
  for (let i = 0; i < recipes.length; i++) {
    for (let j = i + 1; j < recipes.length; j++) {
      const a = recipes[i];
      const b = recipes[j];
      const sim = ingredientSetSimilarity(a.ingredients, b.ingredients);
      if (sim < 0.85) continue;
      const linked =
        a.baseDishId === b.id ||
        b.baseDishId === a.id ||
        (a.baseDishId && a.baseDishId === b.baseDishId);
      if (linked) continue;
      if (a.category !== b.category && sim < 0.95) continue;
      items.push(
        `INGREDIENTES near-dupe (sim=${sim.toFixed(2)}) sin baseDishId: ${a.id} "${a.name}" ↔ ${b.id} "${b.name}"`,
      );
    }
  }

  report(2, "Nombres/ingredientes duplicados o near-dupes sin enlace", items);
}

// ========== CHECK 3: Appliances, time, difficulty ==========
{
  const items = [];
  const EXCLUDE_THERMOMIX = /revuelto|ensalada.*fria|ensalada fria/i;
  const EXCLUDE_OLLA = /pasta_arroces/; // user said 10 pastas already fixed

  for (const r of recipes) {
    if (!VALID_DIFFICULTIES.has(r.difficulty)) {
      items.push(fmt(r, `difficulty inválida en receta: "${r.difficulty}"`));
    }
    for (const [idx, m] of (r.methods ?? []).entries()) {
      if (!VALID_APPLIANCES.has(m.appliance)) {
        items.push(fmt(r, `methods[${idx}].appliance inválido: "${m.appliance}"`));
      }
      if (m.time <= 0) {
        items.push(fmt(r, `methods[${idx}].time <= 0: ${m.time}`));
      }
      if (!VALID_DIFFICULTIES.has(m.difficulty)) {
        items.push(fmt(r, `methods[${idx}].difficulty inválida: "${m.difficulty}"`));
      }
      // Exclude known fixes
      if (m.appliance === "thermomix" && EXCLUDE_THERMOMIX.test(r.name + " " + r.description)) {
        // skip - already fixed per user
      }
    }
    // Filter out excluded items post-hoc for thermomix/olla in known cases
  }

  // Re-run with exclusions for reporting
  const filtered = [];
  for (const r of recipes) {
    if (!VALID_DIFFICULTIES.has(r.difficulty)) {
      filtered.push(fmt(r, `difficulty inválida en receta: "${r.difficulty}"`));
    }
    for (const [idx, m] of (r.methods ?? []).entries()) {
      if (!VALID_APPLIANCES.has(m.appliance)) {
        filtered.push(fmt(r, `methods[${idx}].appliance inválido: "${m.appliance}"`));
      }
      if (m.time <= 0) {
        filtered.push(fmt(r, `methods[${idx}].time <= 0: ${m.time}`));
      }
      if (!VALID_DIFFICULTIES.has(m.difficulty)) {
        filtered.push(fmt(r, `methods[${idx}].difficulty inválida: "${m.difficulty}"`));
      }
    }
  }

  // Remove false positives user said are fixed - check if any remain
  report(3, "Appliances/métodos/difficulty inválidos", filtered);
}

// ========== CHECK 4: Allergens ==========
{
  const items = [];
  for (const r of recipes) {
    const declared = new Set((r.allergens ?? []).filter((a) => VALID_ALLERGENS.has(a)));
    const invalidDeclared = (r.allergens ?? []).filter((a) => !VALID_ALLERGENS.has(a));
    if (invalidDeclared.length) {
      items.push(fmt(r, `alérgeno inválido declarado: ${invalidDeclared.join(", ")}`));
    }
    if ((r.allergens ?? []).includes("leche")) {
      items.push(fmt(r, `usa "leche" en allergens (debe ser "lactosa")`));
    }

    const ingNames = (r.ingredients ?? []).map((i) => i.name);
    const expected = deriveAllergensFromIngredients(ingNames);

    for (const allergen of expected) {
      if (!declared.has(allergen)) {
        const triggers = INGREDIENT_ALLERGEN_RULES.find((x) => x.allergen === allergen);
        const matched = ingNames.filter((n) => triggers.patterns.some((p) => p.test(norm(n))));
        items.push(fmt(r, `FALTA alérgeno "${allergen}" · ingredientes: ${matched.join("; ")}`));
      }
    }

    for (const allergen of declared) {
      if (!expected.has(allergen)) {
        // sulfitos from vino/vinagre may be intentional over-declaration - still report per user request
        items.push(fmt(r, `SOBRA alérgeno "${allergen}" sin ingrediente que lo justifique`));
      }
    }
  }
  report(4, "Incoherencia alérgenos ↔ ingredientes", items);
}

// ========== CHECK 5: mainProtein vs ingredients/category ==========
{
  const items = [];
  const FISH_CATS = new Set(["pescados"]);
  const MEAT_MAP = {
    pollo: "pollo", ternera: "ternera", cerdo: "cerdo", pavo: "pavo",
    pescado_azul: "pescados", pescado_blanco: "pescados", marisco: "pescados",
    huevo: "huevos", legumbre: "legumbres",
  };

  for (const r of recipes) {
    const ingNames = (r.ingredients ?? []).map((i) => i.name);
    const detected = detectProteinsFromIngredients(ingNames);

    if (r.mainProtein === "none" && detected.length > 0) {
      const significant = detected.filter((p) => p !== "legumbre" || r.category === "legumbres");
      if (significant.length > 0) {
        items.push(fmt(r, `mainProtein "none" pero ingredientes sugieren: ${significant.join(", ")}`));
      }
    }

    if (r.mainProtein !== "none" && detected.length > 0) {
      const mp = r.mainProtein;
      const mismatch = detected.filter((d) => {
        if (mp === d) return false;
        if (mp === "pescado_azul" && (d === "pescado_blanco" || d === "marisco")) return false;
        if (mp === "pescado_blanco" && (d === "pescado_azul" || d === "marisco")) return false;
        if (mp === "marisco" && (d === "pescado_azul" || d === "pescado_blanco")) return false;
        if (mp === "ternera" && d === "cerdo") return true;
        if (mp === "pollo" && ["ternera", "cerdo", "pavo", "pescado_azul", "pescado_blanco", "marisco"].includes(d)) return true;
        if (mp === "legumbre" && ["pollo", "ternera", "cerdo", "pavo", "marisco", "pescado_azul", "pescado_blanco"].includes(d)) return true;
        return ["pollo", "ternera", "cerdo", "pavo"].includes(mp) && ["pescado_azul", "pescado_blanco", "marisco"].includes(d);
      });
      if (mismatch.length) {
        items.push(fmt(r, `mainProtein "${mp}" vs ingredientes: ${detected.join(", ")}`));
      }
    }

    if (FISH_CATS.has(r.category) && ["pollo", "ternera", "cerdo", "pavo", "legumbre", "huevo"].includes(r.mainProtein)) {
      items.push(fmt(r, `category "pescados" con mainProtein "${r.mainProtein}"`));
    }
    if (r.category === "carnes" && ["pescado_azul", "pescado_blanco", "marisco"].includes(r.mainProtein)) {
      items.push(fmt(r, `category "carnes" con mainProtein "${r.mainProtein}"`));
    }
    if (r.category === "huevos" && r.mainProtein !== "huevo" && r.mainProtein !== "none") {
      items.push(fmt(r, `category "huevos" con mainProtein "${r.mainProtein}"`));
    }
    if (r.category === "legumbres" && r.mainProtein !== "legumbre" && !["none"].includes(r.mainProtein)) {
      if (!["pollo", "ternera", "cerdo", "pavo", "marisco", "pescado_azul", "pescado_blanco"].includes(r.mainProtein)) {
        // legumbres with meat protein might be intentional stew
      } else {
        items.push(fmt(r, `category "legumbres" con mainProtein "${r.mainProtein}" (proteína animal)`));
      }
    }
  }
  report(5, "mainProtein vs ingredientes/category", items);
}

// ========== CHECK 6: mealRole vs category vs type ==========
{
  const items = [];
  for (const r of recipes) {
    const roles = r.mealRole ?? [];

    if (r.type === "guarnicion") {
      if (roles.length !== 1 || roles[0] !== "guarnicion") {
        items.push(fmt(r, `type "guarnicion" requiere mealRole ["guarnicion"], tiene [${roles.join(", ")}]`));
      }
    } else if (roles.includes("guarnicion")) {
      items.push(fmt(r, `mealRole incluye "guarnicion" pero type="${r.type}"`));
    }

    if (r.category === "legumbres" && roles.includes("cena") && !roles.includes("primero") && !roles.includes("segundo") && !roles.includes("plato_unico")) {
      items.push(fmt(r, `legumbres con mealRole "cena" · roles=[${roles.join(", ")}]`));
    }

    if (OFF_MENU_CATEGORIES.has(r.category)) {
      const expectedRole = r.category === "desayunos" ? "desayuno"
        : r.category === "meriendas" ? "merienda"
        : r.category === "postres" ? "postre"
        : null;
      if (expectedRole && !roles.every((ro) => OFF_MENU_ROLES.has(ro) || ro === expectedRole)) {
        if (!roles.includes(expectedRole)) {
          items.push(fmt(r, `off-menu category "${r.category}" sin mealRole "${expectedRole}" · [${roles.join(", ")}]`));
        }
      }
      const badRoles = roles.filter((ro) => ["cena", "primero", "segundo", "plato_unico"].includes(ro));
      if (badRoles.length && r.category !== "bebes") {
        items.push(fmt(r, `off-menu "${r.category}" con roles de comida/cena: [${badRoles.join(", ")}]`));
      }
    }

    if (["desayunos", "meriendas", "postres"].includes(r.category)) {
      const ok = roles.every((ro) => OFF_MENU_ROLES.has(ro));
      if (!ok) {
        items.push(fmt(r, `category "${r.category}" con mealRole no off-menu: [${roles.join(", ")}]`));
      }
    }
  }
  report(6, "mealRole vs category vs type", items);
}

// ========== CHECK 7: Macros ==========
{
  const items = [];
  for (const r of recipes) {
    const { kcal, protein_g, carbs_g, fat_g } = r;
    const computed = 4 * protein_g + 4 * carbs_g + 9 * fat_g;
    if (kcal === 0 || protein_g === 0 && r.mainProtein !== "none" && !OFF_MENU_CATEGORIES.has(r.category)) {
      if (kcal === 0) items.push(fmt(r, `kcal=0`));
    }
    if (protein_g === 0 && ["pollo", "ternera", "cerdo", "pavo", "pescado_azul", "pescado_blanco", "marisco", "huevo", "legumbre"].includes(r.mainProtein)) {
      items.push(fmt(r, `protein_g=0 con mainProtein "${r.mainProtein}"`));
    }
    if (computed > 0 && kcal > 0) {
      const dev = Math.abs(kcal - computed) / kcal;
      if (dev > 0.35) {
        items.push(fmt(r, `kcal=${kcal} vs 4P+4C+9G=${Math.round(computed)} · desviación ${(dev * 100).toFixed(0)}%`));
      }
    }
    if (kcal === 0 && (protein_g > 0 || carbs_g > 0 || fat_g > 0)) {
      items.push(fmt(r, `kcal=0 pero macros >0: P=${protein_g} C=${carbs_g} G=${fat_g}`));
    }
  }
  report(7, "Macros kcal incoherentes o sospechosos", items);
}

// ========== CHECK 8: productAliases ==========
{
  const items = [];
  for (const r of recipes) {
    for (const alias of r.productAliases ?? []) {
      if (norm(alias) === norm(r.name)) {
        items.push(fmt(r, `productAlias igual al nombre: "${alias}"`));
      }
      if (alias.length < 3) {
        items.push(fmt(r, `productAlias demasiado corto: "${alias}"`));
      }
      if (/^\d+$/.test(alias)) {
        items.push(fmt(r, `productAlias numérico: "${alias}"`));
      }
      if (norm(alias).includes(norm(r.name)) && norm(alias) !== norm(r.name) && alias.length > norm(r.name).length + 5) {
        // ok - longer variant
      }
    }
  }
  report(8, "productAliases sospechosos", items);
}

// ========== CHECK 9: prepSummary vs ingredients ==========
{
  const items = [];
  for (const r of recipes) {
    const ingHay = ingredientHaystack((r.ingredients ?? []).map((i) => i.name));
    const recipeNameHay = norm(r.name);

    for (const [idx, m] of (r.methods ?? []).entries()) {
      const prep = norm(m.prepSummary);
      const missing = [];
      for (const kw of PREP_INGREDIENT_KEYWORDS) {
        const k = norm(kw);
        if (!prep.includes(k) && !prep.includes(k.replace(/s$/, ""))) continue;
        // keyword appears in prepSummary
        if (keywordInHaystack(kw, ingHay)) continue;
        // also check if it's part of recipe name
        if (keywordInHaystack(kw, recipeNameHay)) continue;
        // skip generic words that appear in many preps without being ingredients
        if (["aceite", "sal", "agua", "pimienta"].includes(k)) continue;
        missing.push(kw);
      }
      if (missing.length) {
        items.push(fmt(r, `methods[${idx}] (${m.appliance}) prepSummary menciona sin ingrediente: ${[...new Set(missing)].join(", ")}`));
      }
    }
  }
  report(9, "prepSummary menciona ingredientes ausentes", items);
}

// ========== OUTPUT ==========
const order = [4, 3, 1, 5, 6, 7, 2, 9, 8];
let totalIssues = 0;

console.log("=".repeat(72));
console.log("AUDITORÍA DE CONSISTENCIA TRANSVERSAL — Catálogo MenuPlan");
console.log(`Recetas cargadas: ${recipes.length} · Archivos: ${byFile.size}`);
console.log("=".repeat(72));

for (const id of order) {
  const { title, count, items } = results[id];
  totalIssues += count;
  console.log(`\n## CHEQUEO ${id}: ${title}`);
  console.log(`Recuento: ${count}`);
  if (count === 0) {
    console.log("(ninguno)");
  } else {
    for (const item of items) console.log(`  - ${item}`);
  }
}

console.log("\n" + "=".repeat(72));
console.log("RESUMEN NUMÉRICO GLOBAL");
console.log("=".repeat(72));
for (const id of order) {
  console.log(`  Chequeo ${id}: ${results[id].count}`);
}
console.log(`  TOTAL incidencias: ${totalIssues}`);
console.log(`  Recetas auditadas: ${recipes.length}`);
