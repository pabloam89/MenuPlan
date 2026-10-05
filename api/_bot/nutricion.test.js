// El plato de ahora llega como lo entrega el motor (catalogToFrontendRecipe,
// registrado con el prefijo de grupo, como hace prepararRecetas), y las
// candidatas en la forma del catálogo, como las da pickCatalogReplacement. Los
// tests de antes usaban el JSON para las dos y no vieron que en producción el
// plato de ahora nunca tenía dato.
import { describe, it, expect, beforeAll } from "vitest";
import { filtrarCandidatas, conEjes, baseDelHueco, ordenParaVariar, usarNutricion } from "./menu.js";
import { lineaMacros } from "./plato.js";
import { recipeCatalog, recipeCatalogById } from "../../src/data/recipeCatalog.js";
import { registerRecipes, RECIPES_BY_ID } from "../../src/data/recipes.js";
import { catalogToFrontendRecipe } from "../../src/lib/aiPlanner.js";
import { nutrienteDe, crudoDe } from "../../src/lib/nutricionPlato.js";
import { densidadDe, cargaDe, completitudDe } from "../../src/lib/derive/ejesDePlato.js";
import { puntuar } from "../../src/lib/derive/perfiles.js";

const nut = { nutrienteDe, crudoDe, completitudDe, densidadDe, cargaDe };
const valor = (p, campo) => nutrienteDe(p, campo).valor;
const GAZPACHO = recipeCatalogById.sopas_cremas_046;
const cenas = recipeCatalog.filter((r) => r.estrella && r.id !== GAZPACHO.id && [].concat(r.mealRole ?? []).includes("cena"));

// El hueco de la cena del viernes, como lo ve el bot.
const m = { RECIPES_BY_ID };
const hueco = { recipeId: "mayores__sopas_cremas_046" };
let actual;

beforeAll(() => {
  usarNutricion(nut);
  registerRecipes([{ ...catalogToFrontendRecipe(GAZPACHO, 2), id: hueco.recipeId }]);
  actual = baseDelHueco(m, hueco, "main", nut);
});

describe("el gazpacho de fresas de la captura, como plato de ahora", () => {
  it("el plato del menú llega sin protein_g, y aun así se sabe su proteína", () => {
    expect(RECIPES_BY_ID[hueco.recipeId].protein_g).toBeUndefined();
    expect(valor(actual, "protein_g")).toBe(3);
  });

  it("«más proteína»: todas las que salen tienen más proteína que el gazpacho, sin aviso", () => {
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "proteina", direccion: "mas" }] }, actual, nut);
    expect(r.aviso).toBeNull();
    expect(r.exacto).toBe(true);
    expect(r.lista.length).toBeGreaterThan(0);
    expect(r.lista.every((x) => valor(x, "protein_g") > 3)).toBe(true);
  });

  it("«algo más completo» (equilibrado): las tres primeras cumplen el perfil y no bajan de 275 kcal", () => {
    const r = filtrarCandidatas(cenas, { perfil: "equilibrado" }, actual, nut);
    expect(r.aviso).toBeNull();
    expect(r.exacto).toBe(true);
    const ctx = { leer: valor, completitud: (p) => completitudDe(crudoDe(p)), kcalActual: 275 };
    for (const x of r.lista.slice(0, 3)) {
      expect(puntuar("equilibrado", x, ctx).cumple, x.name).toBe(true);
      expect(valor(x, "kcal")).toBeGreaterThanOrEqual(275);
    }
  });

  it("varios ejes a la vez: más proteína Y menos sal que el gazpacho", () => {
    const sal = valor(actual, "sodium_mg");
    expect(sal).not.toBeNull();
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "proteina", direccion: "mas" }, { cual: "sodio", direccion: "menos" }] }, actual, nut);
    expect(r.exacto).toBe(true);
    expect(r.lista.length).toBeGreaterThan(0);
    // Sin `!= null`, «null < 390» es true en JavaScript y un plato sin sodio pasaría.
    expect(r.lista.every((x) => valor(x, "protein_g") > 3 && valor(x, "sodium_mg") != null && valor(x, "sodium_mg") < sal)).toBe(true);
  });

  it("una candidata sin el dato nunca cumple «menos sal»: no lo sé no es poco", () => {
    const sinSodio = cenas.find((x) => valor(x, "sodium_mg") == null);
    expect(sinSodio).toBeDefined();
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "sodio", direccion: "menos" }] }, actual, nut);
    expect(r.exacto).toBe(true);
    expect(r.lista).not.toContain(sinSodio);
  });

  it("los derivados (carga) se calculan sobre la receta base del plato de ahora", () => {
    const r = conEjes(cenas, [{ cual: "carga", direccion: "mas" }], actual, nut);
    expect(r.aviso).toBeNull();
    expect(r.exacto).toBe(true);
  });

  it("con perfil, se varía solo entre las mejores, no por toda la lista", () => {
    const r = filtrarCandidatas(cenas, { perfil: "equilibrado" }, actual, nut);
    expect(ordenParaVariar(r.lista, { perfil: "equilibrado", n: 3 })).toEqual(r.lista.slice(0, 9));
  });
});

describe("cuando el plato de ahora no es del catálogo", () => {
  it("una receta de usuario en la forma del motor se compara igual (no se lee protein_g)", () => {
    const deUsuario = { id: "usr_123", name: "Crema de calabaza de la abuela", kcal: 180, macros: { protein: 4, carbs: 20, fat: 9 } };
    expect(crudoDe(deUsuario)).toBe(deUsuario);
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "proteina", direccion: "mas" }] }, nut.crudoDe(deUsuario), nut);
    expect(r.exacto).toBe(true);
    expect(r.lista.every((x) => valor(x, "protein_g") > 4)).toBe(true);
  });

  it("sin el dato: ordena por ese nutriente y avisa, en vez de devolver la lista sin filtrar", () => {
    const sinMacros = { id: "usr_456", name: "Algo sin datos", macros: {} };
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "proteina", direccion: "mas" }] }, sinMacros, nut);
    expect(r.aviso).toMatch(/No sé proteína del plato de ahora/);
    expect(r.exacto).toBe(false);
    expect(r.lista).toHaveLength(cenas.length);
    expect(r.lista).not.toEqual(cenas);
    const ps = r.lista.map((x) => valor(x, "protein_g")).filter((v) => v != null);
    expect(ps).toEqual([...ps].sort((a, b) => b - a));
  });
});

describe("lo que no se puede contestar se dice", () => {
  it("un perfil en el primero se ignora con aviso, sin tocar la lista", () => {
    const r = filtrarCandidatas(cenas, { perfil: "equilibrado", cual: "primero" }, actual, nut);
    expect(r.aviso).toMatch(/plato principal/);
    expect(r.exacto).toBe(false);
    expect(r.lista).toBe(cenas);
  });

  it("un eje que no existe avisa y no cuenta como cumplido", () => {
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "omega3", direccion: "mas" }] }, actual, nut);
    expect(r.aviso).toMatch(/No tengo un dato de «omega3»/);
    expect(r.exacto).toBe(false);
  });

  it("si ninguna supera al plato de ahora, salen las que más se acercan y no es exacto", () => {
    const tope = { ...actual, protein_g: 9999 };
    const r = filtrarCandidatas(cenas.slice(0, 6), { ejes: [{ cual: "proteina", direccion: "mas" }] }, tope, nut);
    expect(r.aviso).toMatch(/Ninguna tiene más proteína/);
    expect(r.exacto).toBe(false);
    const ps = r.lista.map((x) => valor(x, "protein_g"));
    expect(ps).toEqual([...ps].sort((a, b) => b - a));
  });

  it("sin plato de ahora (ideas sin menú) ordena en la dirección pedida, sin aviso", () => {
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "sodio", direccion: "menos" }] }, null, nut);
    expect(r.aviso).toBeNull();
    const s = r.lista.map((x) => valor(x, "sodium_mg")).filter((v) => v != null);
    expect(s).toEqual([...s].sort((a, b) => a - b));
  });
});

describe("la vía rápida de calorías enseña los macros del plato del menú", () => {
  it("con el plato registrado como lo guarda el bot", () => {
    expect(lineaMacros(RECIPES_BY_ID[hueco.recipeId], nut)).toBe("3 g de proteína, 23 g de hidratos, 19 g de grasa");
  });
});
