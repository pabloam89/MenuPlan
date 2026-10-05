// cambiar_plato de verdad: motor real (src/server/botCore.js, el mismo código
// que va en core.mjs) y solo la base de datos falsa. Lo que se prueba es el
// cableado: con qué base compara y entre cuáles elige, no la función pura.
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(async () => []), insert: vi.fn(async () => {}), eq: (v) => `eq.${v}` }));
let casaDeHoy = null;
vi.mock("./casa.js", () => ({
  hoyISO: () => "2026-10-05",
  cargarCasa: vi.fn(async () => casaDeHoy),
  // Como la de verdad: sin cambios devuelve ok con sinCambios.
  conCasa: vi.fn(async (_id, cambiar) => ((await cambiar(casaDeHoy)) ? { ok: true } : { ok: true, sinCambios: true })),
}));
vi.mock("./embudo.js", () => ({ rastro: vi.fn(), registrar: vi.fn(), EMBUDO: {} }));

const core = await import("../../src/server/botCore.js");
const { cambiarPlato, usarMotor, usarNutricion, filtrarCandidatas, baseDelHueco } = await import("./menu.js");
const { recipeCatalogById } = await import("../../src/data/recipeCatalog.js");

const nut = { nutrienteDe: core.nutrienteDe, crudoDe: core.crudoDe, completitudDe: core.completitudDe, densidadDe: core.densidadDe, cargaDe: core.cargaDe };
const data = {
  members: [{ id: "m1", name: "Ana", age: 38 }, { id: "m2", name: "Luis", age: 40 }],
  groups: [{ id: "g1", label: "Familia", memberIds: ["m1", "m2"] }],
  schedule: {},
};
const casaCon = (recipeId) => {
  const plan = { g1: { "Vie-Cena": { recipeId, eaters: 2 } } };
  return {
    householdId: "h",
    state: { data, aiRecipes: [], menuPlan: plan },
    menu: { id: "menu1", userId: "u1" },
    semanaViva: "2026-10-05",
    semanas: [{ weekStart: "2026-10-05", weekEnd: "2026-10-11", plan, shopping: { items: [] } }],
  };
};
const sinPrefijo = (id) => String(id).split("__").pop();
const proteina = (r) => core.nutrienteDe(r, "protein_g").valor;
// El hueco tal y como lo ve cambiarPlato: las 60 que el motor da por buenas.
const pool = (casa) => core.pickCatalogReplacement(data, casa.semanas[0].plan, { groupId: "g1", day: "Vie", meal: "Cena", course: "main", candidatos: 60 })?.candidatos ?? [];

beforeAll(() => {
  usarMotor(core);
  usarNutricion(nut);
});
afterEach(() => vi.restoreAllMocks());

describe("cambiar_plato con el motor real", () => {
  it("con perfil (alto en proteína) elige entre las tres mejores, no entre todas las que cumplen", async () => {
    casaDeHoy = casaCon("g1__sopas_cremas_046");
    const f = filtrarCandidatas(pool(casaDeHoy), { perfil: "altoProteina" }, baseDelHueco(core, casaDeHoy.semanas[0].plan.g1["Vie-Cena"], "main", nut), nut);
    expect(f.exacto).toBe(true);
    expect(f.lista.length).toBeGreaterThan(3);
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const out = {};
    await cambiarPlato("h", { dia: "viernes", franja: "Cena", perfil: "altoProteina" }, null, out);
    expect(out.cambiado).toBe(true);
    expect(sinPrefijo(out.recetaId)).toBe(f.lista[2].id);
  });

  it("sin la foto del plato registrada, compara con su receta del catálogo", async () => {
    const actual = pool(casaCon("g1__sopas_cremas_046"))
      .filter((r) => proteina(r) != null && !core.RECIPES_BY_ID[`g1__${r.id}`])
      .sort((a, b) => proteina(b) - proteina(a))[5];
    expect(core.RECIPES_BY_ID[`g1__${actual.id}`]).toBeUndefined();
    casaDeHoy = casaCon(`g1__${actual.id}`);
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const out = {};
    const texto = await cambiarPlato("h", { dia: "viernes", franja: "Cena", ejes: [{ cual: "proteina", direccion: "mas" }] }, null, out);
    expect(out.cambiado).toBe(true);
    expect(proteina(recipeCatalogById[sinPrefijo(out.recetaId)])).toBeGreaterThan(proteina(actual));
    expect(texto).not.toMatch(/No había plato en ese hueco/);
  });

  it("ejes que no se entienden: no cambia nada", async () => {
    casaDeHoy = casaCon("g1__sopas_cremas_046");
    for (const malo of [{ cual: "proteina" }, "no es json"]) {
      const out = {};
      const texto = await cambiarPlato("h", { dia: "viernes", franja: "Cena", ejes: malo }, null, out);
      expect(out.cambiado, String(malo)).toBeFalsy();
      expect(texto).toMatch(/No he cambiado nada/);
    }
  });
});
