import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ficherosDeGit } from "./ficherosGit.js";
import { TABLAS } from "../src/data/model.js";
import { ES_CODIGO, SIMBOLOS_DEPRECADAS, deprecadas, lecturasDeprecadas, lecturasRetiradas, limpiar, reglasDe, retiradas, rutasDeclaradas } from "./lecturasRetiradas.js";

/**
 * Prohibido volver a leer una fuente retirada (issue #251). Sustituye al
 * antiguo src/data/catalogoUnaFuente.test.js: UNA regla, derivada del
 * registro de fuentes (TABLAS de src/data/model.js), para el catálogo y para
 * todo lo demás que se retire.
 *
 *  - Fuente `retirado` / `copia_retirada` (tablas Supabase copia, sus vistas,
 *    supabase/seed_*.sql): ningún fichero de código la lee (`.from("t")`,
 *    `/rest/v1/t`, `select("t", …)` del bot, SQL embebido, ruta del fichero),
 *    salvo los que el propio registro declara (productor/consumidores) y los
 *    de LEE_RETIRADAS_ADMITIDO, cada uno con su motivo.
 *  - Fuente `deprecado` (recetasPrototipo): solo la leen sus `consumidores`.
 *
 * No mira los comentarios ni migraciones (supabase/) ni el registro mismo.
 * Para añadir una excepción hay que escribir su motivo aquí, a la vista de
 * quien revise el PR; para dejar de necesitarla, borrar el fichero.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FICHEROS = ficherosDeGit(RAIZ);

/** Lo que no se examina: el registro, este detector y sus pruebas, y todo supabase/ (migraciones y sus tests). */
const NO_SE_EXAMINA = (f) => f.startsWith("supabase/") || f === "src/data/model.js" || f === "ops/lecturasRetiradas.js" || f === "ops/lecturasRetiradas.test.js";
const CODIGO = FICHEROS.filter((f) => ES_CODIGO.test(f) && !NO_SE_EXAMINA(f));

const MOTIVO_SEED = "Script del seed de Postgres: sigue en el repo pero la copia no tiene lectores desde la 0064 y no se vuelve a ejecutar; se borra junto con la copia (decisión de Pablo).";
/**
 * Excepciones: {fichero, fuente, motivo}. Cada una se comprueba viva: si el
 * fichero deja de leer esa fuente (o desaparece), el test pide quitarla.
 */
export const LEE_RETIRADAS_ADMITIDO = [
  ...["seedPostgres", "copiaRecetasSupabase", "copiaIngredientesSupabase", "copiaSustitucionesSupabase"].map((fuente) => ({ fichero: "scripts/generate-supabase-seed.mjs", fuente, motivo: MOTIVO_SEED + " Escribe los seed_*.sql, no los lee de la base." })),
  ...["seedPostgres", "copiaRecetasSupabase", "copiaFotosSupabase", "copiaIngredientesSupabase"].map((fuente) => ({ fichero: "scripts/run-seed.mjs", fuente, motivo: MOTIVO_SEED + " Ejecuta los seed_*.sql y cuenta filas de la copia." })),
];

const porId = new Map(TABLAS.map((f) => [f.id, f]));
const REGLAS = reglasDe(TABLAS);
const admitido = (fichero, fuente) => LEE_RETIRADAS_ADMITIDO.some((a) => a.fichero === fichero && a.fuente === fuente);

/** Dónde leer en su lugar: la fuente sustituta del registro. */
function sustituto(f) {
  const s = f.sustituido_por ? porId.get(f.sustituido_por) : null;
  return s ? `lee la fuente «${s.id}» (${s.ruta})` : `no tiene sustituto único: mira su «nota» en src/data/model.js`;
}

describe("lecturas de fuentes retiradas: el detector ve lo que tiene que ver", () => {
  const ve = (src) => lecturasRetiradas(src, REGLAS).map((h) => h.objeto);
  it("detecta las formas de lectura de una tabla o vista retirada", () => {
    expect(ve(`supabase.from("recipes").select("*")`)).toContain("recipes");
    expect(ve(`supabase.from('ingredients').select("*")`)).toContain("ingredients");
    expect(ve("supabase.from(`catalog_meta`).select('version')")).toContain("catalog_meta");
    expect(ve("fetch(`${url}/rest/v1/dish_images?id=eq.1`)")).toContain("dish_images");
    expect(ve(`await select("recipes", "id=eq.1", "name")`)).toContain("recipes");
    expect(ve(`await borrar("ingredient_aliases", "id=eq.1")`)).toContain("ingredient_aliases");
    expect(ve(`.from("recipe_substitution_options")`)).toContain("recipe_substitution_options");
    expect(ve(`.from("recipe_derived_allergens")`)).toContain("recipe_derived_allergens");
    expect(ve("c.query(`select count(*) from\n recipe_ingredients`)")).toContain("recipe_ingredients");
    expect(ve(`await c.query("delete from ingredient_substitutions")`)).toContain("ingredient_substitutions");
    expect(ve(`readFileSync("supabase/seed_x.sql")`)).toContain("supabase/seed_*.sql");
    expect(ve(`join(ROOT, "supabase", "seed_recipes_1_de_4.sql")`)).toContain("supabase/seed_*.sql");
  });

  it("no se dispara con lo parecido ni con los comentarios", () => {
    expect(ve(`supabase.from("user_recipes").select("*")`)).toEqual([]);
    expect(ve(`supabase.from("recipes_extra")`)).toEqual([]);
    expect(ve(`await select("bot_messages", "x", "y")`)).toEqual([]);
    expect(ve(`const ayuda = "recetas e ingredients"; const x = obj.recipes;`)).toEqual([]);
    expect(ve(`// supabase.from("recipes") y /rest/v1/dish_images\nconst a = 1;`)).toEqual([]);
    expect(ve(`/* supabase.from('ingredients')\n   leer supabase/seed_x.sql */ const a = 1;`)).toEqual([]);
    expect(ve(` * ver seed_ingredients.sql, select * from recipes`)).toEqual([]);
    // una URL en un string no abre un comentario
    expect(ve(`const u = "https://x.es"; fetch(u + "/rest/v1/recipes")`)).toContain("recipes");
  });

  it("detecta la lectura de la fuente deprecada y no se dispara con lo vivo del mismo fichero", () => {
    const d = (src) => lecturasDeprecadas(src, TABLAS).map((h) => h.simbolo);
    expect(d(`import { RECIPES, RECIPES_BY_ID } from "../data/recipes.js";`)).toHaveLength(1);
    expect(d(`import { RECIPES_BY_ID, RECIPES } from "../data/recipes";`)).toHaveLength(1);
    expect(d(`const r = BASE_RECIPES.map(f)`)).toHaveLength(1);
    expect(d(`import { generateMenu } from "./planner.js";`)).toHaveLength(1);
    expect(d(`import { RECIPES_BY_ID, registerRecipes } from "../data/recipes.js";`)).toEqual([]);
    expect(d(`import { INGREDIENT_CATEGORIES } from "../data/recipes.js";`)).toEqual([]);
    expect(d(`import { generateMenuWithAI } from "./aiPlanner.js";`)).toEqual([]);
    expect(d(`await m.generateMenuWithAI(x); // BASE_RECIPES, generateMenu`)).toEqual([]);
  });

  it("limpiar() respeta los strings con // dentro", () => {
    const { codigo, cadenas } = limpiar(`const u = "https://a.es/x"; // comentario\nconst v = 1;`);
    expect(codigo).toContain("https://a.es/x");
    expect(codigo).not.toContain("comentario");
    expect(cadenas).toContain("https://a.es/x");
  });

  it("examina de verdad el código de la app, del bot y de los scripts", () => {
    // Que no mida nada: tiene que estar en la lista lo que más importa vigilar.
    for (const f of ["src/App.jsx", "api/_bot/db.js", "src/lib/planner.js", "scripts/run-seed.mjs"]) expect(CODIGO, f).toContain(f);
    expect(CODIGO.length).toBeGreaterThan(300);
    expect(retiradas(TABLAS).length).toBeGreaterThan(0);
    expect(deprecadas(TABLAS).length).toBeGreaterThan(0);
  });
});

describe("lecturas de fuentes retiradas: el repo", () => {
  const leidas = CODIGO.map((f) => ({ f, src: readFileSync(join(RAIZ, f), "utf8") }));

  it("nadie lee una fuente retirada (tablas, vistas ni ficheros) salvo lo declarado", () => {
    const culpables = [];
    for (const { f, src } of leidas) {
      for (const h of lecturasRetiradas(src, REGLAS)) {
        const fuente = porId.get(h.fuente);
        if (rutasDeclaradas(fuente).has(f) || admitido(f, h.fuente)) continue;
        culpables.push(`${f} lee ${h.tipo} «${h.objeto}» de la fuente RETIRADA «${h.fuente}» (retirar_el ${fuente.retirar_el}). Qué hacer: ${sustituto(fuente)}; o, si de verdad debe seguir leyéndola, añádelo a LEE_RETIRADAS_ADMITIDO en ops/lecturasRetiradas.test.js con su motivo.`);
      }
    }
    expect(culpables, `\n${culpables.join("\n")}\n`).toEqual([]);
  });

  it("nadie lee una fuente deprecada salvo sus consumidores declarados", () => {
    const culpables = [];
    for (const { f, src } of leidas) {
      for (const h of lecturasDeprecadas(src, TABLAS)) {
        const fuente = porId.get(h.fuente);
        if (rutasDeclaradas(fuente).has(f)) continue;
        culpables.push(`${f} usa ${h.simbolo}, de la fuente DEPRECADA «${h.fuente}» (se retira el ${fuente.retirar_el}). Qué hacer: ${sustituto(fuente)}; o, si es un lector legítimo hasta entonces, añádelo a «consumidores» de «${h.fuente}» en src/data/model.js.`);
      }
    }
    expect(culpables, `\n${culpables.join("\n")}\n`).toEqual([]);
  });

  it("las excepciones admitidas siguen siendo necesarias y están razonadas", () => {
    const sobran = [];
    for (const a of LEE_RETIRADAS_ADMITIDO) {
      const fuente = porId.get(a.fuente);
      if (!fuente || !retiradas(TABLAS).includes(fuente)) { sobran.push(`${a.fichero}: «${a.fuente}» no es una fuente retirada del registro`); continue; }
      if (!a.motivo || a.motivo.length < 20) { sobran.push(`${a.fichero} (${a.fuente}): falta el motivo`); continue; }
      if (!existsSync(join(RAIZ, a.fichero))) { sobran.push(`${a.fichero} ya no existe: quita su excepción (${a.fuente})`); continue; }
      const lee = lecturasRetiradas(readFileSync(join(RAIZ, a.fichero), "utf8"), REGLAS).some((h) => h.fuente === a.fuente);
      if (!lee) sobran.push(`${a.fichero} ya no lee «${a.fuente}»: quita su excepción`);
    }
    expect(sobran, `\n${sobran.join("\n")}\n`).toEqual([]);
  });

  it("cada fuente deprecada tiene declarado cómo se lee, y los lectores declarados existen", () => {
    for (const f of deprecadas(TABLAS)) {
      expect(SIMBOLOS_DEPRECADAS[f.id], `${f.id} es deprecada: falta en SIMBOLOS_DEPRECADAS (ops/lecturasRetiradas.js) cómo se la lee`).toBeTruthy();
      for (const ruta of rutasDeclaradas(f)) expect(existsSync(join(RAIZ, ruta)), `${f.id}: el lector declarado ${ruta} no existe`).toBe(true);
    }
  });
});
