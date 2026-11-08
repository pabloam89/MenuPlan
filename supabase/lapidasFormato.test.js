import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recetaPropia } from "../src/lib/ids.js";

/**
 * El formato del id de una receta propia vive en src/lib/ids.js
 * (`recetaPropia`); la 0094 lo copia en el CHECK de
 * user_recipe_deletions.recipe_id. Si divergen, una receta con un id que el
 * código da por bueno no podría dejar lápida y su borrado fallaría (o
 * deleteUserRecipe y api/_bot/propias.js, que filtran con `recetaPropia.es`,
 * dejarían fuera ids que la base sí acepta).
 */
const sql = readFileSync(join(import.meta.dirname, "migrations", "0094_lapidas_recetas_propias.sql"), "utf8");

const checkDeLaTabla = () => {
  const m = sql.match(/constraint user_recipe_deletions_recipe_id_formato\s+check \(recipe_id ~ '([^']+)'\)/);
  return m?.[1];
};

describe("formato del id en las lápidas de recetas propias (0094)", () => {
  it("el CHECK de la 0094 es ids.recetaPropia.viejo", () => {
    expect(checkDeLaTabla()).toBe(recetaPropia.viejo.source);
  });

  it("las precondiciones de la 0094 usan la misma regex", () => {
    const usos = [...sql.matchAll(/id !~ '([^']+)'/g)].map((m) => m[1]);
    expect(usos.length).toBeGreaterThan(0);
    for (const u of usos) expect(u).toBe(recetaPropia.viejo.source);
  });

  it("la regex vieja abarca los ids nuevos", () => {
    for (let i = 0; i < 50; i++) expect(recetaPropia.viejo.test(recetaPropia.nuevo())).toBe(true);
  });
});
