/**
 * apply-step-parts.mjs — escribe `stepsRich[i].part` desde un fichero de
 * etiquetas ya decididas.
 *
 * El camino normal para rellenar `part` es scripts/enrich-recipe-steps.mjs
 * --parts, que se lo pregunta a un modelo por API. Este script es la otra
 * puerta: cuando las etiquetas ya están tomadas (por Pablo, o por el agente
 * de la sesión aplicando el mismo PART_CRITERION), las aplica sin llamar a
 * nadie.
 *
 * Mismo contrato de escritura que el modo --parts, y por el mismo motivo: el
 * wording de los pasos está curado y no se toca. Se comprueba paso a paso que
 * `text`, `kind`, `minutes`, `during` y `base` quedan idénticos, y si algo se
 * movió, revienta antes de escribir nada.
 *
 * Y una regla de la propia rúbrica que se valida aquí: una receta con un solo
 * valor de `part` en todos sus pasos es ruido (la UI pintaría una cabecera de
 * sección para un único bloque). O hay al menos un componente aparte, o la
 * receta se queda sin el campo.
 *
 *   node scripts/apply-step-parts.mjs <etiquetas.json> [--dry-run]
 *
 * Formato:  { "<recipeId>": ["principal", "guarnicion", ...] }  una entrada
 * por paso, en orden. `null` en una posición deja ese paso sin `part`.
 * Una lista vacía [] declara la receta monocomponente: no se escribe nada.
 */
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const STEP_PARTS = ["principal", "guarnicion", "salsa", "combinado"];
const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");

const [rutaEtiquetas] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry-run");
if (!rutaEtiquetas) {
  console.error("uso: node scripts/apply-step-parts.mjs <etiquetas.json> [--dry-run]");
  process.exit(1);
}
const etiquetas = JSON.parse(readFileSync(rutaEtiquetas, "utf8"));

/** Huella de todo lo que NO puede cambiar. */
const huella = (pasos) =>
  JSON.stringify((pasos ?? []).map((s) => [s?.text, s?.kind, s?.minutes, s?.during, s?.base]));

const errores = [];
const resumen = { recetas: 0, pasos: 0, monocomponente: 0, saltadas: 0 };
const porFichero = {};

for (const fichero of readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json"))) {
  const ruta = join(RECIPES_DIR, fichero);
  const original = readFileSync(ruta, "utf8");
  const recetas = JSON.parse(original);
  let tocado = false;

  for (const receta of recetas) {
    const partes = etiquetas[receta.id];
    if (!partes) continue;

    const pasos = receta.stepsRich ?? [];
    if (!pasos.length) { errores.push(`${receta.id}: no tiene stepsRich`); continue; }

    if (partes.length === 0) {           // declarada monocomponente
      resumen.monocomponente += 1;
      continue;
    }
    if (partes.length !== pasos.length) {
      errores.push(`${receta.id}: ${partes.length} etiquetas para ${pasos.length} pasos`);
      continue;
    }
    const malos = partes.filter((p) => p !== null && !STEP_PARTS.includes(p));
    if (malos.length) { errores.push(`${receta.id}: valores no válidos ${[...new Set(malos)].join(", ")}`); continue; }

    const distintas = new Set(partes.filter(Boolean));
    if (distintas.size < 2) {
      errores.push(`${receta.id}: un solo valor de part (${[...distintas]}) — la rúbrica dice que eso va sin campo`);
      continue;
    }

    const antes = huella(pasos);
    pasos.forEach((paso, i) => {
      if (partes[i] === null) delete paso.part;
      else paso.part = partes[i];
    });
    if (huella(pasos) !== antes) { errores.push(`${receta.id}: la escritura movió algo que no es \`part\``); continue; }

    tocado = true;
    resumen.recetas += 1;
    resumen.pasos += partes.filter(Boolean).length;
  }

  if (tocado) porFichero[fichero] = `${JSON.stringify(recetas, null, 2)}${original.endsWith("\n") ? "\n" : ""}`;
}

const idsConocidos = new Set();
for (const f of readdirSync(RECIPES_DIR).filter((x) => x.endsWith(".json"))) {
  for (const r of JSON.parse(readFileSync(join(RECIPES_DIR, f), "utf8"))) idsConocidos.add(r.id);
}
for (const id of Object.keys(etiquetas)) if (!idsConocidos.has(id)) errores.push(`${id}: no existe en el catálogo`);

if (errores.length) {
  console.error(`✗ ${errores.length} problema(s), no se ha escrito nada:`);
  for (const e of errores) console.error(`   ${e}`);
  process.exit(1);
}

if (!DRY) for (const [fichero, contenido] of Object.entries(porFichero)) writeFileSync(join(RECIPES_DIR, fichero), contenido);

console.log(`${DRY ? "[dry-run] " : ""}${resumen.recetas} recetas etiquetadas, ${resumen.pasos} pasos con part`);
if (resumen.monocomponente) console.log(`${resumen.monocomponente} declaradas monocomponente (sin campo, por la rúbrica)`);
console.log(`ficheros ${DRY ? "que cambiarían" : "escritos"}: ${Object.keys(porFichero).join(", ") || "(ninguno)"}`);
