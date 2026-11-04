// «Veces en un menú» (#1246, paso 5): recipe_social_stats sale de los huecos de los planes, no de las copias de las
// recetas. Mientras la contara de user_menu_recipes, esa tabla no se podría dejar de escribir.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DIR_MIGRACIONES } from "../scripts/lib/cascadas.mjs";

/** El cuerpo de la última migración que define la función: es el que manda en la base. */
function ultimaDefinicion(nombre) {
  const re = new RegExp(String.raw`create (?:or replace )?function public\.${nombre}\([\s\S]*?\$\$([\s\S]*?)\$\$`, "i");
  const cuerpos = readdirSync(DIR_MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => re.exec(readFileSync(join(DIR_MIGRACIONES, f), "utf8"))?.[1])
    .filter(Boolean);
  return cuerpos.at(-1);
}

describe("recipe_social_stats cuenta los menús que llevan el plato", () => {
  const cuerpo = ultimaDefinicion("recipe_social_stats");

  it("no lee las copias", () => {
    expect(cuerpo).toBeTruthy();
    expect(cuerpo).not.toMatch(/user_menu_recipes/);
  });

  it("lee los dos platos del hueco, de cada menú una vez", () => {
    expect(cuerpo).toMatch(/user_menu_weeks/);
    expect(cuerpo).toMatch(/'recipeId'/);
    expect(cuerpo).toMatch(/'firstRecipeId'/);
    expect(cuerpo).toMatch(/count\(distinct \(u\.user_id, u\.menu_id\)\)/);
  });

  it("quita el prefijo de grupo como el resto del código (`split(\"__\").pop()`)", () => {
    expect(cuerpo).toContain("'^.*__'");
  });
});
