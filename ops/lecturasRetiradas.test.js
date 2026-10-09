import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ficherosDeGit } from "./ficherosGit.js";
import { TABLAS } from "../src/data/model.js";
import { ES_CODIGO, SIMBOLOS_DEPRECADAS, deprecadas, lecturasDeprecadas, lecturasRetiradas, limpiar, porSimbolo, reglasDe, retiradas, rutasDeclaradas } from "./lecturasRetiradas.js";

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
 *  - Fuente retirada cuyo fichero es código (recetasPrototipo, retirada el 9 oct
 *    2026, #286): nadie la lee, ni aunque fuera `deprecado` con sus `consumidores`.
 *    Se vigila por SÍMBOLO (SIMBOLOS_DEPRECADAS) y solo en código: un comentario,
 *    un string o un texto JSX que nombre el símbolo no cuenta.
 *
 * No mira migraciones (supabase/) ni el registro mismo. «Deprecada con la
 * fecha vencida» NO es rojo aquí: es un aviso (fuentesVencidas, #253).
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FICHEROS = ficherosDeGit(RAIZ);

/** Lo que no se examina: el registro, este detector y sus pruebas, y todo supabase/ (migraciones y sus tests). */
const NO_SE_EXAMINA = (f) => f.startsWith("supabase/") || f === "src/data/model.js" || f === "ops/lecturasRetiradas.js" || f === "ops/lecturasRetiradas.test.js";
const CODIGO = FICHEROS.filter((f) => ES_CODIGO.test(f) && !NO_SE_EXAMINA(f));

/**
 * Excepciones: {fichero, fuente, motivo}, SOLO para lo que no puede decirse en
 * el registro. Si el fichero produce o consume la fuente (p. ej. los scripts del
 * seed, ya en `productor`/`consumidores` de las copias), va en el registro y
 * aquí sobra: un test lo exige. Hoy está vacía; el mecanismo se queda.
 * Cada excepción se comprueba viva: si el fichero deja de leer esa fuente, o
 * desaparece, el test pide quitarla.
 */
export const LEE_RETIRADAS_ADMITIDO = [];

const porId = new Map(TABLAS.map((f) => [f.id, f]));
const REGLAS = reglasDe(TABLAS);
const admitido = (fichero, fuente) => LEE_RETIRADAS_ADMITIDO.some((a) => a.fichero === fichero && a.fuente === fuente);

/** Dónde leer en su lugar: la fuente sustituta del registro. */
function sustituto(f) {
  const s = f.sustituido_por ? porId.get(f.sustituido_por) : null;
  return s ? `lee la fuente «${s.id}» (${s.ruta})` : `no tiene sustituto único: mira su «nota» en src/data/model.js`;
}

/** Defectos de una lista de excepciones: no retirada, sin motivo, ya declarada en el registro, fichero que no existe, o que ya no lee la fuente. */
function revisarAdmitidas(lista) {
  const sobran = [];
  for (const a of lista) {
    const fuente = porId.get(a.fuente);
    if (!fuente || !retiradas(TABLAS).includes(fuente)) { sobran.push(`${a.fichero}: «${a.fuente}» no es una fuente retirada del registro`); continue; }
    if (!a.motivo || a.motivo.length < 20) { sobran.push(`${a.fichero} (${a.fuente}): falta el motivo`); continue; }
    if (rutasDeclaradas(fuente).has(a.fichero)) { sobran.push(`${a.fichero}: ya está declarada como productor/consumidor de «${a.fuente}» en el registro; quita la excepción`); continue; }
    if (!existsSync(join(RAIZ, a.fichero))) { sobran.push(`${a.fichero} ya no existe: quita su excepción (${a.fuente})`); continue; }
    if (!lecturasRetiradas(readFileSync(join(RAIZ, a.fichero), "utf8"), REGLAS).some((h) => h.fuente === a.fuente)) sobran.push(`${a.fichero} ya no lee «${a.fuente}»: quita su excepción`);
  }
  return sobran;
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
    // el helper con el nombre de la tabla también si cuelga de un objeto (db.select, bd.upsert)
    expect(ve(`await db.select("recipes", "id=eq.1")`)).toContain("recipes");
    expect(ve(`await bd.upsert("catalog_meta", {})`)).toContain("catalog_meta");
  });

  it("no se dispara con lo parecido, con los comentarios ni con un ejemplo dentro de un string", () => {
    expect(ve(`supabase.from("user_recipes").select("*")`)).toEqual([]);
    expect(ve(`supabase.from("recipes_extra")`)).toEqual([]);
    expect(ve(`await select("bot_messages", "x", "y")`)).toEqual([]);
    expect(ve(`const ayuda = "recetas e ingredients"; const x = obj.recipes;`)).toEqual([]);
    expect(ve(`// supabase.from("recipes") y /rest/v1/dish_images\nconst a = 1;`)).toEqual([]);
    expect(ve(`/* supabase.from('ingredients')\n   leer supabase/seed_x.sql */ const a = 1;`)).toEqual([]);
    expect(ve(` * ver seed_ingredients.sql, select * from recipes`)).toEqual([]);
    // una URL en un string no abre un comentario
    expect(ve(`const u = "https://x.es"; fetch(u + "/rest/v1/recipes")`)).toContain("recipes");
    // un EJEMPLO de lectura dentro de un string (un test, un mensaje) no es una lectura
    expect(ve(`expect(esLectura('supabase.from("recipes")')).toBe(true)`)).toEqual([]);
    expect(ve("const ej = `supabase.from('ingredients')`;")).toEqual([]);
    // una regex con comillas no abre un string que se trague lo que sigue
    expect(ve("const r = /[’`´]/;\nsupabase.from('recipes')")).toContain("recipes");
    expect(ve("const r = /[’`´]/; // supabase.from('recipes')")).toEqual([]);
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
    // las otras formas de llegar a RECIPES: namespace, import dinámico, re-export
    expect(d(`import * as R from "../data/recipes.js"; const a = R.RECIPES;`)).toHaveLength(1);
    expect(d(`const b = (await import("../data/recipes.js")).RECIPES;`)).toHaveLength(1);
    expect(d(`const { RECIPES } = await import("../data/recipes.js");`)).toHaveLength(1);
    expect(d(`export { RECIPES } from "../data/recipes.js";`)).toHaveLength(1);
    // y lo vivo del mismo fichero sigue sin saltar
    expect(d(`export { RECIPES_BY_ID, INGREDIENT_CATEGORIES } from "../data/recipes.js";`)).toEqual([]);
    expect(d(`const { RECIPES_BY_ID } = await import("../data/recipes.js"); const k = { RECIPES: 1 };`)).toEqual([]);
    // una importación de otro módulo con RECIPES no es la de recipes.js
    expect(d(`import { RECIPES } from "./otro.js";`)).toEqual([]);
  });

  it("un texto que NOMBRA el símbolo (prompt, mensaje, plantilla, JSX, regex) no lo lee", () => {
    const d = (src) => lecturasDeprecadas(src, TABLAS).map((h) => h.simbolo);
    expect(d('const msg = "llama a generateMenu y BASE_RECIPES";')).toEqual([]);
    expect(d("const p = `usa generateMenu ${x} BASE_RECIPES`;")).toEqual([]);
    expect(d("const v = <p>BASE_RECIPES y generateMenu</p>;")).toEqual([]);
    expect(d("const t = x.match(/generateMenu/);")).toEqual([]);
    // pero lo que va dentro de ${} de una plantilla es código
    expect(d("const p = `a ${generateMenu(x)}`;")).toHaveLength(1);
  });

  it("limpiar() reconoce regex con comillas, plantillas anidadas y JSX", () => {
    // la regex de api/_bot/silencio.js (comillas y backtick dentro de una clase) no abre un string
    expect(limpiar("const r = /[’`´]/g; // nota\nconst a = 1;").marcas).toEqual({ comentarios: [20], cadenas: [], regex: [10] });
    // una división no es una regex
    expect(limpiar("const a = b / c / d; // x").marcas.regex).toEqual([]);
    // la flecha deja sitio a una regex
    expect(limpiar("const f = (s) => /ab'c/.test(s);").marcas.regex).toHaveLength(1);
    // plantilla anidada: lo de dentro de ${} es código; el resto de la plantilla, no
    const p = limpiar("const t = `a ${b + `c${d}`} 'e'`; // fin");
    expect(p.marcas.comentarios).toHaveLength(1);
    expect(p.soloCodigo).toContain("b +");
    expect(p.soloCodigo).not.toContain("'e'");
    // JSX: el apóstrofo del texto no abre un string, y los atributos sí son strings
    const j = limpiar("const v = <p title=\"x\">don't // texto</p>;\nconst w = 1; // c");
    expect(j.marcas.comentarios).toHaveLength(1);
    expect(j.marcas.cadenas).toHaveLength(1);
    expect(j.soloCodigo).not.toContain("texto");
    // «a <b» no es una etiqueta
    expect(limpiar("if (a <b) { x = 'y'; }").marcas.cadenas).toHaveLength(1);
    // mismas longitudes y líneas que el original
    const src = "x = 1; /* a\nb */ y = `c\nd`; // e\n";
    const r = limpiar(src);
    expect(r.codigo.length).toBe(src.length);
    expect(r.soloCodigo.length).toBe(src.length);
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
    // Hoy no queda ninguna deprecada; lo que se vigila por símbolo es una retirada (recetasPrototipo).
    expect(porSimbolo(TABLAS).map((f) => f.id)).toContain("recetasPrototipo");
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
        culpables.push(`${f} lee ${h.tipo} «${h.objeto}» de la fuente RETIRADA «${h.fuente}» (retirar_el ${fuente.retirar_el}). Qué hacer: ${sustituto(fuente)}; o, si el fichero la lee o escribe de verdad (un script de seed, una migración de datos), declara su papel en «productor» o «consumidores» de «${h.fuente}» en src/data/model.js; solo si eso no cabe, añádelo a LEE_RETIRADAS_ADMITIDO con su motivo. Si es solo un TEXTO o un ejemplo (un mensaje, un caso de test), no es una lectura: no lo declares, escríbelo de forma que no parezca el acceso (p. ej. partido en dos strings).`);
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
        culpables.push(`${f} usa ${h.simbolo}, de la fuente ${fuente.estado.toUpperCase()} «${h.fuente}» (se retira el ${fuente.retirar_el}). Qué hacer: ${sustituto(fuente)}; o, SOLO si lo lee de verdad y es legítimo hasta que se retire, añádelo a «consumidores» de «${h.fuente}» en src/data/model.js. (Los comentarios, los strings y los textos JSX no cuentan: aquí solo salta el código.)`);
      }
    }
    expect(culpables, `\n${culpables.join("\n")}\n`).toEqual([]);
  });

  it("las excepciones admitidas siguen siendo necesarias y están razonadas", () => {
    const sobran = revisarAdmitidas(LEE_RETIRADAS_ADMITIDO);
    expect(sobran, `\n${sobran.join("\n")}\n`).toEqual([]);
  });

  it("revisarAdmitidas() ve los defectos de una excepción (se prueba con datos falsos)", () => {
    const motivo = "un motivo suficientemente largo para pasar";
    const malos = revisarAdmitidas([
      { fichero: "scripts/run-seed.mjs", fuente: "seedPostgres", motivo }, // ya declarada en el registro
      { fichero: "scripts/no-existe.mjs", fuente: "seedPostgres", motivo },
      { fichero: "src/App.jsx", fuente: "recetas", motivo }, // no es una fuente retirada
      { fichero: "src/App.jsx", fuente: "seedPostgres", motivo: "corto" },
      { fichero: "src/App.jsx", fuente: "seedPostgres", motivo }, // no la lee
    ]);
    expect(malos).toEqual([
      expect.stringContaining("scripts/run-seed.mjs: ya está declarada"),
      expect.stringContaining("scripts/no-existe.mjs ya no existe"),
      expect.stringContaining("src/App.jsx: «recetas» no es una fuente"),
      expect.stringContaining("src/App.jsx (seedPostgres): falta el motivo"),
      expect.stringContaining("src/App.jsx ya no lee «seedPostgres»"),
    ]);
  });

  it("los scripts del seed están en el registro, no en una lista paralela", () => {
    const seed = rutasDeclaradas(porId.get("seedPostgres"));
    expect(seed.has("scripts/run-seed.mjs")).toBe(true);
    expect(seed.has("scripts/generate-supabase-seed.mjs")).toBe(true);
    for (const id of ["copiaRecetasSupabase", "copiaIngredientesSupabase"]) expect(rutasDeclaradas(porId.get(id)).has("scripts/run-seed.mjs"), id).toBe(true);
  });

  it("SIMBOLOS_DEPRECADAS y el registro se corresponden en los dos sentidos", () => {
    for (const id of Object.keys(SIMBOLOS_DEPRECADAS)) {
      const f = porId.get(id);
      expect(f, `SIMBOLOS_DEPRECADAS.${id}: no hay fuente con ese id en el registro; quita la entrada`).toBeTruthy();
      expect(["deprecado", "retirado"], `${id} está «${f?.estado}»: SIMBOLOS_DEPRECADAS solo vale para una fuente deprecada o retirada`).toContain(f.estado);
    }
    // una fuente retirada cuyo fichero es código sigue vigilada por símbolo (reglasDe() salta los ficheros de código,
    // porque recipes.js también exporta cosas vivas: RECIPES_BY_ID, INGREDIENT_CATEGORIES…)
    for (const f of retiradas(TABLAS)) {
      const codigo = f.ficheros.filter((g) => ES_CODIGO.test(g));
      expect(codigo.length === 0 || SIMBOLOS_DEPRECADAS[f.id], `${f.id} es retirada y su fichero es código (${codigo}): declara en SIMBOLOS_DEPRECADAS qué símbolo lo lee, o nada de lo que importe ese fichero quedará vigilado`).toBeTruthy();
    }
    expect(porSimbolo(TABLAS).length).toBeGreaterThan(0);
  });

  it("cada fuente deprecada tiene declarado cómo se lee, y los lectores declarados existen", () => {
    for (const f of deprecadas(TABLAS)) {
      expect(SIMBOLOS_DEPRECADAS[f.id], `${f.id} es deprecada: falta en SIMBOLOS_DEPRECADAS (ops/lecturasRetiradas.js) cómo se la lee`).toBeTruthy();
    }
    for (const f of TABLAS.filter((t) => t.estado !== "vivo")) {
      for (const ruta of rutasDeclaradas(f)) expect(existsSync(join(RAIZ, ruta)) || /\*/.test(ruta), `${f.id}: el fichero declarado ${ruta} no existe`).toBe(true);
    }
  });
});
