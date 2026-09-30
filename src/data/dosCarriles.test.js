import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveIngredient } from "../lib/ingredients.js";

/**
 * LOS DOS CAMINOS QUE RESUELVEN UN INGREDIENTE, Y QUE TIENEN QUE DAR LO MISMO.
 *
 * Una línea de receta dice a qué ingrediente apunta de dos maneras a la vez, y
 * el pipeline usa una u otra según por dónde entre:
 *
 *   src/lib/ingredients.js:217   resolveRecipeIngredients → resolveIngredient(line.NAME)
 *                                …e ignora `line.ingredientId` por completo.
 *                                Es el camino de las CALORÍAS.
 *
 *   src/lib/derive/composicion.js:159,171   usa `linea.ingredientId` tal cual.
 *                                Es el camino del VECTOR.
 *
 * Mientras coincidan no pasa nada. El día que no, las kcal de un plato y su
 * composición hablan de alimentos distintos **y no falla nada**: los dos
 * números salen, los dos parecen correctos y nadie los compara.
 *
 * Pasó de verdad el 22 sep 2026: al mover tres líneas de atún rojo de `atun`
 * a `atun-fresco` se cambió el `ingredientId` y NO los alias, así que el
 * vector ya contaba atún fresco mientras las calorías seguían cobrando la
 * ficha de la conserva en aceite. Lo cazó el test hermano de
 * `ingredients.test.js`… que solo recorre `recipeCatalog`.
 *
 * Este recorre las 1.033, que es donde vive la diferencia: `recipeCatalog`
 * deja fuera bases, guarniciones y salsas —unas 600 líneas— y esas alimentan
 * el vector igual que las demás.
 */
const RAIZ = fileURLToPath(new URL("./recipes", import.meta.url));
const recetas = readdirSync(RAIZ)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(RAIZ, f), "utf8")));

describe("el nombre y la clave apuntan al mismo ingrediente", () => {
  it("en las 1.033 recetas, no solo en las del recetario", () => {
    const divergen = [];
    let lineas = 0;
    for (const r of recetas) {
      for (const l of r.ingredients ?? []) {
        lineas++;
        const porNombre = resolveIngredient(l.name)?.id ?? null;
        const guardado = l.ingredientId ?? null;
        if (porNombre === guardado) continue;
        divergen.push(`${r.id} «${l.name}» · guardado=${guardado} · por nombre=${porNombre}`);
      }
    }

    // Suelo de cordura: si el bucle recorre poco, el `[]` de abajo es un
    // falso verde. Hoy son 7.586 líneas en 1.033 recetas.
    expect(lineas).toBeGreaterThan(7000);

    expect(
      divergen,
      "el camino de las calorías resuelve por NOMBRE y el del vector usa la CLAVE. "
      + "Si no coinciden, un plato publica kcal de un alimento y composición de otro, "
      + "y no falla nada. Si has movido una línea de ingrediente, mueve también su alias.",
    ).toEqual([]);
  });
});
