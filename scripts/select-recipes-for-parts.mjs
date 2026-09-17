/**
 * select-recipes-for-parts.mjs
 *
 * ¿A qué recetas hay que preguntarle al modelo por el `part` de sus pasos?
 *
 * Etiquetar las 985 recetas con stepsRich sería pagar por 800 respuestas que ya
 * sabemos: "esta receta es un solo componente". La medición del catálogo dice
 * que el trabajo de verdad son ~300, y esta es la puerta de dos etapas que las
 * separa. La puerta es de RECALL, no de precisión: aquí solo se decide a quién
 * se le pregunta; quien decide de verdad es el modelo con el criterio
 * aparte/dentro (ver recipeSchema.js → llevaSalsa).
 *
 *   Etapa 0 · recetas con stepsRich (sin pasos ricos no hay `part` que poner).
 *   Etapa 1 · fuera las MONOCOMPONENTE POR CONSTRUCCIÓN: una salsa, una
 *             guarnición, una base, un puré de bebé, un postre, un desayuno o
 *             una merienda no tienen de qué separarse — son el componente.
 *             Además, derivar `part` en purés de bebé salía mal medido: el
 *             modelo troceaba el 64 % de ellos en partes inventadas.
 *   Etapa 2 · de las que quedan, las que dan SEÑAL de tener un componente
 *             aparte, en el nombre ("con salsa X", "con puré", "con patatas
 *             fritas") o en el texto de los ÚLTIMOS pasos ("aparte", "al lado",
 *             "en un cuenco", "acompañado", "napar", "salsear"). La señal de los
 *             pasos finales es la barata que nadie usaba: aparece en el 8,6 % de
 *             las recetas y, cuando coincide con una palabra de salsa, acertó el
 *             100 % de las veces.
 *   Etapa 3 · MÁS las que ya tienen `part` hoy. No se saltan: se vuelven a
 *             preguntar. Sus 141 etiquetas salieron del criterio FÍSICO viejo
 *             ("¿dos cazos distintos?"), que es justo el que las dejó
 *             inconsistentes — una reducción en la misma sartén salía
 *             'principal' y en cazo aparte 'salsa'. Re-etiquetarlas con el
 *             criterio aparte/dentro es el punto de toda la pasada.
 *
 * Uso:
 *   node scripts/select-recipes-for-parts.mjs [--out=output/parts-target-ids.txt]
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");

// ── Etapa 1: monocomponente por construcción ────────────────────────────────
// Por `type` (lo que el plato ES) y por `category` (dónde vive en el catálogo).
// Van los dos ejes porque no coinciden: hay 41 recetas type "guarnicion" y 42
// en category "guarniciones", y no son el mismo conjunto.
export const MONO_TYPES = new Set(["salsa", "guarnicion", "base"]);
export const MONO_CATEGORIES = new Set([
  "salsas", "guarniciones", "bases", "bebes", "postres", "desayunos", "meriendas",
]);

/** Sin tildes y en minúsculas: el catálogo escribe "puré" y "pure" a ratos. */
const norm = (s) => String(s ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// ── Etapa 2, señal A: el nombre ─────────────────────────────────────────────
// "con X" / "y X" donde X es un acompañamiento nombrable. Deja pasar a propósito
// los cinco falsos positivos conocidos del "con X" (gratinados, portadores,
// glaseados, aliños, y los "con X" donde X no es salsa): descartarlos aquí sería
// decidir con una regex lo que el criterio aparte/dentro decide mejor.
export const NAME_SIGNAL = new RegExp(
  "\\b(?:con|y)\\s+(?:su\\s+|sus\\s+|un\\s+|una\\s+|unos\\s+|unas\\s+|el\\s+|la\\s+|los\\s+|las\\s+)?("
  + [
    // salsas y emulsiones
    "salsa", "alioli", "ali oli", "mayonesa", "mojo", "chimichurri", "pesto",
    "vinagreta", "romesco", "tzatziki", "guacamole", "hummus", "bechamel",
    "reduccion", "mantequilla", "aliño", "alino", "tomate", "crema",
    // guarniciones
    "pure", "patatas", "arroz", "ensalada", "verduras", "guarnicion", "pisto",
    "cuscus", "quinoa", "champinones", "setas", "guisantes", "pimientos",
    "cebolla confitada", "manzana", "boniato", "pan",
  ].join("|")
  + ")",
);

// ── Etapa 2, señal B: el texto de los últimos pasos ─────────────────────────
// Solo los últimos pasos: "aparte" a mitad de receta suele ser "reservar aparte"
// (un bol de mise en place), no un componente que se sirve al lado.
export const STEP_SIGNAL =
  /(aparte|al lado|en un cuenco|en un bol|acompanad|acompanar|napar|salsear|para mojar|servir con|por separado)/;
export const LAST_STEPS_WINDOW = 3;

export function loadCatalog() {
  const out = [];
  for (const file of readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json"))) {
    for (const r of JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"))) {
      if (r?.id) out.push(r);
    }
  }
  return out;
}

export const hasRichSteps = (r) => Array.isArray(r?.stepsRich) && r.stepsRich.length > 0;
export const isMonocomponent = (r) => MONO_TYPES.has(r?.type) || MONO_CATEGORIES.has(r?.category);
export const hasPartToday = (r) => hasRichSteps(r) && r.stepsRich.some((s) => s?.part);

export const hasNameSignal = (r) => NAME_SIGNAL.test(norm(r?.name));
export const hasStepSignal = (r) => STEP_SIGNAL.test(
  (r?.stepsRich ?? []).slice(-LAST_STEPS_WINDOW).map((s) => norm(s?.text)).join(" "),
);

/**
 * Los ids a los que preguntar, con el recuento de cada etapa para el log.
 * @param {object[]} [catalog]
 */
export function selectPartsTargets(catalog = loadCatalog()) {
  const withRich = catalog.filter(hasRichSteps);
  const mono = withRich.filter(isMonocomponent);
  const rest = withRich.filter((r) => !isMonocomponent(r));

  const byName = rest.filter(hasNameSignal);
  const byStep = rest.filter(hasStepSignal);
  const signalled = rest.filter((r) => hasNameSignal(r) || hasStepSignal(r));

  const already = withRich.filter(hasPartToday);

  const ids = new Set(signalled.map((r) => r.id));
  const addedByAlready = already.filter((r) => !ids.has(r.id));
  for (const r of already) ids.add(r.id);

  // El orden del catálogo, no el de los Set: un diff estable se revisa mejor.
  const targets = catalog.filter((r) => ids.has(r.id));

  return {
    targets,
    stats: {
      catalogo: catalog.length,
      conStepsRich: withRich.length,
      monocomponente: mono.length,
      candidatas: rest.length,
      senalNombre: byName.length,
      senalPasos: byStep.length,
      // Las dos señales se solapan, así que la unión no es la suma.
      senalAlguna: signalled.length,
      yaEtiquetadas: already.length,
      yaEtiquetadasQueAnadeElPaso3: addedByAlready.length,
      objetivo: targets.length,
      pasosObjetivo: targets.reduce((a, r) => a + r.stepsRich.length, 0),
    },
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// Solo cuando se ejecuta a pelo: importarlo desde enrich-recipe-steps.mjs no
// debe escribir ficheros ni imprimir nada.
if (process.argv[1]?.endsWith("select-recipes-for-parts.mjs")) {
  const outArg = process.argv.slice(2).find((a) => a.startsWith("--out="));
  const outPath = join(ROOT, outArg ? outArg.slice("--out=".length) : "output/parts-target-ids.txt");

  const { targets, stats } = selectPartsTargets();

  console.log("Puerta de dos etapas para el `part` de stepsRich\n");
  console.log(`  catálogo …………………………………………… ${stats.catalogo}`);
  console.log(`  etapa 0 · con stepsRich ………………… ${stats.conStepsRich}`);
  console.log(`  etapa 1 · monocomponente (fuera) … ${stats.monocomponente}`);
  console.log(`            candidatas ……………………… ${stats.candidatas}`);
  console.log(`  etapa 2 · señal en el nombre …………… ${stats.senalNombre}`);
  console.log(`            señal en últimos pasos … ${stats.senalPasos}`);
  console.log(`            alguna de las dos ………… ${stats.senalAlguna}`);
  console.log(`  etapa 3 · ya etiquetadas hoy ………… ${stats.yaEtiquetadas} (+${stats.yaEtiquetadasQueAnadeElPaso3} que no daban señal)`);
  console.log(`\n  → OBJETIVO: ${stats.objetivo} recetas, ${stats.pasosObjetivo} pasos.`);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${targets.map((r) => r.id).join("\n")}\n`, "utf8");
  console.log(`\n✅ Lista escrita en ${outPath}`);
  console.log("   node scripts/enrich-recipe-steps.mjs --parts --dry-run --ids-file=output/parts-target-ids.txt");
}
