// El plato de ahora llega como lo entrega el motor (catalogToFrontendRecipe,
// registrado con el prefijo de grupo, como hace prepararRecetas), y las
// candidatas en la forma del catálogo, como las da pickCatalogReplacement. Los
// tests de antes usaban el JSON para las dos y no vieron que en producción el
// plato de ahora nunca tenía dato.
import { describe, it, expect, beforeAll } from "vitest";
import { filtrarCandidatas, conEjes, baseDelHueco, ordenParaVariar, usarNutricion, candidatasParaCambiar, normalizarEjes } from "./menu.js";
import { lineaMacros } from "./plato.js";
import { recipeCatalog, recipeCatalogById } from "../../src/data/recipeCatalog.js";
import { registerRecipes, RECIPES_BY_ID } from "../../src/data/recipes.js";
import { catalogToFrontendRecipe, applyGarnishToRecipe } from "../../src/lib/aiPlanner.js";
import { nutrienteDe, crudoDe } from "../../src/lib/nutricionPlato.js";
import { densidadDe, cargaDe, completitudDe } from "../../src/lib/derive/ejesDePlato.js";
import { puntuar } from "../../src/lib/derive/perfiles.js";
import guarniciones from "../../src/data/recipes/guarniciones.json" with { type: "json" };

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

  it("si el orden es la respuesta, se varía solo entre las primeras", () => {
    const r = filtrarCandidatas(cenas, { perfil: "equilibrado" }, null, nut);
    expect(ordenParaVariar(r.lista, { ordenado: true, n: 3 })).toEqual(r.lista.slice(0, 9));
  });
});

const tiempos = (l) => l.map((r) => r.time).filter(Number.isFinite);
const creciente = (xs) => xs.every((x, i) => i === 0 || xs[i - 1] <= x);

describe("el estilo sigue ordenando dentro de lo que cumple", () => {
  it("«rápido + más proteína»: solo las que tienen más proteína, de la más rápida a la más lenta", () => {
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "proteina", direccion: "mas" }] }, actual, nut);
    expect(r.ordenado).toBe(false);
    const o = ordenParaVariar(r.lista, { ordenado: r.ordenado, estilo: "rapido", n: 3 });
    expect(new Set(o)).toEqual(new Set(r.lista));
    expect(tiempos(o).length).toBeGreaterThan(10);
    expect(creciente(tiempos(o))).toBe(true);
    // Sin estilo el orden no es por tiempo: el test mide algo.
    expect(creciente(tiempos(ordenParaVariar(r.lista, { ordenado: r.ordenado, n: 3 })))).toBe(false);
  });

  it("«rápido + equilibrado»: las que cumplen empatan, y entre ellas manda el tiempo", () => {
    const r = filtrarCandidatas(cenas, { perfil: "equilibrado" }, actual, nut);
    expect(r.aviso).toBeNull();
    expect(r.ordenado).toBe(false);
    expect(creciente(tiempos(ordenParaVariar(r.lista, { ordenado: r.ordenado, estilo: "rapido", n: 3 })))).toBe(true);
  });
});

describe("el plato de ahora con una guarnición fundida se compara por su base", () => {
  it("«más proteína» compara con los 3 g del gazpacho, no con los del plato con guarnición", () => {
    const guarnicion = [...guarniciones].sort((a, b) => (b.protein_g ?? 0) - (a.protein_g ?? 0))[0];
    expect(guarnicion.protein_g).toBeGreaterThanOrEqual(4);
    const fundido = applyGarnishToRecipe(catalogToFrontendRecipe(GAZPACHO, 2), guarnicion, 2);
    registerRecipes([{ ...fundido, id: "ninos__sopas_cremas_046" }]);
    const proteinaFundida = RECIPES_BY_ID.ninos__sopas_cremas_046.macros.protein;
    expect(proteinaFundida).toBeGreaterThan(3);
    // Hay candidatas entre las dos cifras: si se comparara con el fundido, desaparecerían.
    const enMedio = cenas.filter((x) => { const p = valor(x, "protein_g"); return p > 3 && p <= proteinaFundida; });
    expect(enMedio.length).toBeGreaterThan(0);
    const base = baseDelHueco(m, { recipeId: "ninos__sopas_cremas_046" }, "main", nut);
    expect(valor(base, "protein_g")).toBe(3);
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "proteina", direccion: "mas" }] }, base, nut);
    expect(r.lista).toEqual(expect.arrayContaining(enMedio));
  });
});

describe("el plato de ahora sin foto registrada", () => {
  it("se compara con la receta del catálogo por su id", () => {
    const base = baseDelHueco(m, { recipeId: "otros__sopas_cremas_046" }, "main", nut);
    expect(RECIPES_BY_ID.otros__sopas_cremas_046).toBeUndefined();
    expect(base).toBe(GAZPACHO);
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "proteina", direccion: "mas" }] }, base, nut);
    expect(r.exacto).toBe(true);
    expect(r.lista.every((x) => valor(x, "protein_g") > 3)).toBe(true);
  });

  it("un id que no está en ningún sitio: no sé con qué comparar, y no es exacto (cambiar_plato no cambia)", () => {
    const base = baseDelHueco(m, { recipeId: "otros__no_existe" }, "main", nut);
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "proteina", direccion: "mas" }] }, base, nut);
    expect(r.exacto).toBe(false);
    expect(r.aviso).toMatch(/No sé/);
  });

  it("hueco vacío: sin base, y cambiar_plato elige entre las tres primeras del orden", () => {
    expect(baseDelHueco(m, { recipeId: null }, "main", nut)).toBeNull();
    const r = filtrarCandidatas(cenas, { ejes: [{ cual: "proteina", direccion: "mas" }] }, null, nut);
    expect(r.ordenado).toBe(true);
    expect(candidatasParaCambiar(r)).toEqual(r.lista.slice(0, 3));
  });
});

describe("ejes que llegan mal formados", () => {
  const bien = [{ cual: "proteina", direccion: "mas" }];
  it("como cadena JSON o como objeto suelto, igual que el array", () => {
    const esperado = conEjes(cenas, bien, actual, nut);
    expect(conEjes(cenas, JSON.stringify(bien), actual, nut)).toEqual(esperado);
    expect(conEjes(cenas, bien[0], actual, nut)).toEqual(esperado);
  });
  it("lo que no se entiende no es «nada pedido»: aviso y no exacto", () => {
    for (const malo of ["proteina", "{no es json", [{ cual: "proteina" }], [{ direccion: "mas" }], 7]) {
      const r = conEjes(cenas, malo, actual, nut);
      expect(r.exacto, String(malo)).toBe(false);
      expect(r.aviso, String(malo)).toMatch(/No he entendido/);
    }
    expect(normalizarEjes(null)).toEqual({ pedidos: [], invalidos: false });
  });
});

describe("carga sin kcal no es 0", () => {
  it("una candidata sin los dos sumandos no pasa por «menos carga»", () => {
    const rara = { id: "rara_sin_kcal", name: "Rara" };
    const nutRaro = { ...nut, cargaDe: (r) => (r?.id === rara.id ? { valor: { proteinaPor100kcal: null, fibraPor100kcal: null } } : cargaDe(r)) };
    const r = conEjes([rara, ...cenas], [{ cual: "carga", direccion: "menos" }], actual, nutRaro);
    expect(r.lista).not.toContain(rara);
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
