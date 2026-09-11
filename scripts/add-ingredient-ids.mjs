#!/usr/bin/env node
/**
 * Rellena `ingredientId` en cada línea de ingrediente del catálogo.
 *
 * El enlace receta → ingrediente iba por texto: `name` resuelto contra nombre
 * y alias de src/data/ingredients.json. Resuelve el 100 % del catálogo, pero
 * es una búsqueda difusa dentro de la fuente de verdad. Esto la convierte en
 * una clave: cada línea lleva el id canónico al lado del nombre.
 *
 * `name` se conserva SIEMPRE: es lo que se enseña ("Merluza o pescado blanco"
 * resuelve a `merluza` y tiene que seguir leyéndose así). Mismo contrato que
 * recipe_ingredients.raw_name en Postgres.
 *
 * Idempotente: una línea que ya lleva id se comprueba, no se reescribe. Si el
 * id guardado no coincide con lo que resuelve el nombre, se avisa y NO se
 * toca — eso es una discrepancia que hay que mirar, no pisar.
 *
 * Una línea cuyo nombre no resuelve se deja SIN id y se lista al final: es
 * exactamente lo que después hará fallar validate-catalog.mjs, que es lo que
 * se quiere — mejor un build roto que una receta enlazada a nada.
 *
 * Uso:  npx vite-node scripts/add-ingredient-ids.mjs          (escribe)
 *       npx vite-node scripts/add-ingredient-ids.mjs --check  (solo informa)
 *
 * (vite-node y no node: src/lib/ingredients.js arrastra módulos .jsx.)
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveIngredientId } from "../src/lib/ingredients.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
const CHECK_ONLY = process.argv.includes("--check");

const knownIds = new Set(
  JSON.parse(readFileSync(join(ROOT, "src", "data", "ingredients.json"), "utf8")).map((i) => i.id),
);

let lines = 0;
let filled = 0;
let alreadyOk = 0;
const unresolved = new Map(); // nombre → nº de líneas
const mismatched = []; // [receta, nombre, guardado, resuelto]

for (const file of readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json"))) {
  const path = join(RECIPES_DIR, file);
  const raw = readFileSync(path, "utf8");
  const recipes = JSON.parse(raw);
  let touched = 0;

  for (const recipe of recipes) {
    for (const line of recipe.ingredients ?? []) {
      lines++;
      const resolved = resolveIngredientId(line.name);
      const valid = resolved && knownIds.has(resolved) ? resolved : null;

      if (line.ingredientId) {
        if (line.ingredientId === valid) alreadyOk++;
        else mismatched.push([recipe.id, line.name, line.ingredientId, valid]);
        continue;
      }
      if (!valid) {
        unresolved.set(line.name, (unresolved.get(line.name) ?? 0) + 1);
        continue;
      }
      // Se inserta justo detrás de `name` para que el JSON se lea como
      // "nombre, id, cantidad, unidad" y el diff sea de una línea por
      // ingrediente.
      const { name, ...rest } = line;
      for (const k of Object.keys(line)) delete line[k];
      Object.assign(line, { name, ingredientId: valid, ...rest });
      filled++;
      touched++;
    }
  }

  if (touched && !CHECK_ONLY) {
    writeFileSync(path, `${JSON.stringify(recipes, null, 2)}${raw.endsWith("\n") ? "\n" : ""}`, "utf8");
    console.log(`${file.padEnd(28)} ${String(touched).padStart(5)} líneas`);
  }
}

console.log(`\nlíneas: ${lines} · rellenadas: ${filled} · ya correctas: ${alreadyOk}${CHECK_ONLY ? "  (--check: no se ha escrito nada)" : ""}`);

if (mismatched.length) {
  console.error(`\n❌ ${mismatched.length} líneas con un ingredientId que NO coincide con lo que resuelve su nombre (no se han tocado):`);
  for (const [rid, name, stored, resolved] of mismatched) {
    console.error(`  ${rid}  "${name}"  guardado=${stored}  resuelve=${resolved ?? "(nada)"}`);
  }
}
if (unresolved.size) {
  console.error(`\n❌ ${unresolved.size} nombres sin id (se dejan sin rellenar; validate-catalog los rechazará):`);
  for (const [name, n] of [...unresolved].sort((a, b) => b[1] - a[1])) console.error(`  ${String(n).padStart(3)} × ${name}`);
}
if (mismatched.length || unresolved.size) process.exit(1);
