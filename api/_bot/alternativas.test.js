// proponer_platos dice por qué salen las que salen (4 nov 2026): Pablo pidió cambiar la cena del sábado
// (shakshuka) con «más hidratos» y luego «más variado», y todas las opciones eran de huevo sin decir por qué.
// El viernes había pescado y cerdo y el domingo pollo: el motor quitaba carne y pescado por los días de al lado.
// Motor real (src/server/botCore.js, el mismo código que va en core.mjs); solo la base es de mentira. Sin reloj
// (hoyISO fijo y día y comida dichos), sin azar (con `candidatos` el motor no sortea) y sin red.
import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(async () => []), insert: vi.fn(async () => {}), eq: (v) => `eq.${v}` }));
let casaDeHoy = null;
vi.mock("./casa.js", () => ({
  hoyISO: () => "2026-10-05",
  cargarCasa: vi.fn(async () => casaDeHoy),
  conCasa: vi.fn(async () => ({ ok: true })),
}));
vi.mock("./embudo.js", () => ({ rastro: vi.fn(), registrar: vi.fn(), EMBUDO: {} }));

const core = await import("../../src/server/botCore.js");
const {
  proponerPlatos, usarMotor, usarNutricion, variadas, MAX_POR_PROTEINA, poolPara, yaDichas, fraseDeDescartes,
  REPETIDA, BOTON_REPETIR_VECINOS,
} = await import("./menu.js");
const { PROTEIN_GROUP_BY_MAIN_PROTEIN } = await import("../../src/data/recipeSchema.js");

const nut = { nutrienteDe: core.nutrienteDe, crudoDe: core.crudoDe, completitudDe: core.completitudDe, densidadDe: core.densidadDe, cargaDe: core.cargaDe };
const data = {
  members: [{ id: "m1", name: "Ana", age: 38 }, { id: "m2", name: "Luis", age: 40 }],
  groups: [{ id: "g1", label: "Familia", memberIds: ["m1", "m2"] }],
  schedule: {}, timeWeekday: 90, timeWeekend: 90, allergiesReviewed: true,
};
// La semana de Pablo: viernes pescado (corvina) y cerdo, sábado noche shakshuka, domingo pollo.
const PLAN_PABLO = {
  "Vie-Comida": { recipeId: "pescados_039", eaters: 2 },
  "Vie-Cena": { recipeId: "carnes_059", eaters: 2 },
  "Sáb-Cena": { recipeId: "huevos_064", eaters: 2 },
  "Dom-Comida": { recipeId: "carnes_058", eaters: 2 },
};
const casaCon = (huecos) => {
  const plan = { g1: huecos };
  return {
    householdId: "h",
    state: { data, aiRecipes: [], menuPlan: plan },
    menu: { id: "menu1", userId: "u1" },
    semanaViva: "2026-10-05",
    semanas: [{ weekStart: "2026-10-05", weekEnd: "2026-10-11", plan, shopping: { items: [] } }],
  };
};
const grupoDe = (r) => PROTEIN_GROUP_BY_MAIN_PROTEIN[r?.mainProtein] ?? null;
const opcionesDe = (texto) => texto.split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, "").replace(/ \(.*$/, ""));
const motor = (huecos, extra = {}) => core.pickCatalogReplacement(data, { g1: huecos }, { groupId: "g1", day: "Sáb", meal: "Cena", course: "main", candidatos: 400, ...extra });

beforeAll(() => {
  usarMotor(core);
  usarNutricion(nut);
});

describe("el motor dice qué deja fuera y por qué", () => {
  it("los días de al lado: qué proteínas y de qué día, y ninguna candidata las lleva", () => {
    const r = motor(PLAN_PABLO);
    expect(r.descartes).toEqual([{ motivo: core.DESCARTE.VECINOS, dias: [{ dia: "Vie", proteinas: ["pescado_blanco", "cerdo"] }, { dia: "Dom", proteinas: ["pollo"] }] }]);
    expect(r.candidatos.some((c) => ["carne", "pescado"].includes(grupoDe(c)))).toBe(false);
  });

  it("con repetirVecinos entran carne y pescado, y ya no hay descarte por los vecinos", () => {
    const r = motor(PLAN_PABLO, { repetirVecinos: true });
    expect(r.descartes.map((d) => d.motivo)).not.toContain(core.DESCARTE.VECINOS);
    expect(r.candidatos.some((c) => grupoDe(c) === "carne")).toBe(true);
    expect(r.candidatos.some((c) => grupoDe(c) === "pescado")).toBe(true);
  });

  it("la otra comida del mismo día es otro motivo, y no se suelta con repetirVecinos", () => {
    const r = motor({ ...PLAN_PABLO, "Sáb-Comida": { recipeId: "carnes_058", eaters: 2 } }, { repetirVecinos: true });
    expect(r.descartes).toEqual([{ motivo: core.DESCARTE.MISMO_DIA, dias: [{ dia: "Sáb", proteinas: ["pollo"] }] }]);
  });

  it("vocabulario cerrado: cada motivo tiene sus palabras y el motor no da otro", () => {
    expect(Object.keys(core.DESCARTE_EN_PALABRAS).sort()).toEqual(Object.values(core.DESCARTE).sort());
    const motivos = [motor(PLAN_PABLO), motor({ ...PLAN_PABLO, "Sáb-Comida": { recipeId: "carnes_058", eaters: 2 } })].flatMap((r) => r.descartes.map((d) => d.motivo));
    expect(motivos.length).toBeGreaterThan(0);
    for (const m of motivos) expect(Object.values(core.DESCARTE)).toContain(m);
  });
});

describe("proponer_platos explica, deja soltarlo y no repite callado", () => {
  it("el caso de Pablo: la línea EXCLUIDO con los días y lo que hay, y el botón para soltarlo", async () => {
    casaDeHoy = casaCon(PLAN_PABLO);
    const texto = await proponerPlatos("h", { dia: "sábado", franja: "Cena", n: 4 });
    expect(texto).toContain("EXCLUIDO");
    expect(texto).toContain("No repito lo de los días de al lado: el viernes hay pescado blanco y cerdo, y el domingo pollo.");
    expect(texto).toContain(`[[${BOTON_REPETIR_VECINOS}]]`);
  });

  it("la vía rápida lleva el mismo porqué y el botón", async () => {
    casaDeHoy = casaCon(PLAN_PABLO);
    const out = {};
    await proponerPlatos("h", { dia: "sábado", franja: "Cena", n: 3 }, null, out);
    expect(out.porQue).toBe(fraseDeDescartes(motor(PLAN_PABLO).descartes, core.DESCARTE_EN_PALABRAS));
    expect(out.soltable).toBe(true);
  });

  it("con repetir_vecinos no hay EXCLUIDO por los vecinos y lo dice", async () => {
    casaDeHoy = casaCon(PLAN_PABLO);
    const texto = await proponerPlatos("h", { dia: "sábado", franja: "Cena", n: 4, repetirVecinos: true });
    expect(texto).not.toContain("días de al lado: el viernes");
    expect(texto).toContain("Con repetir_vecinos");
  });

  it("pedir otra vez lo mismo da otras y lo dice; nunca la misma lista callada", async () => {
    casaDeHoy = casaCon(PLAN_PABLO);
    const primera = await proponerPlatos("h", { dia: "sábado", franja: "Cena", n: 3 });
    const antes = opcionesDe(primera);
    expect(antes.length).toBe(3);
    // Lo que vio la persona: el mensaje de Lola con esos nombres.
    const segunda = await proponerPlatos("h", { dia: "sábado", franja: "Cena", n: 3, anterior: `Te encajan: ${antes.join(", ")}. ¿Cuál te pongo?` });
    const despues = opcionesDe(segunda);
    expect(despues.length).toBeGreaterThan(0);
    expect(despues.filter((x) => antes.includes(x))).toEqual([]);
    expect(segunda).toContain(`REPETIDA: ${REPETIDA.OTRAS}`);
  });

  it("tres de cuatro iguales («más variado» tras «más hidratos») también es repetir", async () => {
    casaDeHoy = casaCon(PLAN_PABLO);
    const hidratos = await proponerPlatos("h", { dia: "sábado", franja: "Cena", n: 4, ejes: [{ cual: "carbohidratos", direccion: "mas" }] });
    const variado = await proponerPlatos("h", { dia: "sábado", franja: "Cena", n: 4, anterior: hidratos });
    const antes = opcionesDe(hidratos);
    expect(opcionesDe(variado).filter((x) => antes.includes(x)).length * 2).toBeLessThanOrEqual(opcionesDe(variado).length);
    expect(variado).toContain("REPETIDA");
  });

  it("si no es lo mismo, nada de REPETIDA", async () => {
    casaDeHoy = casaCon(PLAN_PABLO);
    const texto = await proponerPlatos("h", { dia: "sábado", franja: "Cena", n: 3, anterior: "Hoy cenáis lentejas." });
    expect(texto).not.toContain("REPETIDA");
  });
});

describe("variedad en una lista", () => {
  const r = (id, mainProtein, category) => ({ id, name: id, mainProtein, category });
  it(`no más de ${MAX_POR_PROTEINA} del mismo grupo de proteína, aunque falten opciones`, () => {
    const huevos = [r("h1", "huevo", "huevos"), r("h2", "huevo", "cenas"), r("h3", "huevo", "platos_unicos"), r("h4", "huevo", "ensaladas")];
    const lista = variadas([...huevos, r("p1", "pasta", "pastas")], 4);
    expect(lista.filter((x) => x.mainProtein === "huevo").length).toBeLessThanOrEqual(MAX_POR_PROTEINA);
    expect(lista.map((x) => x.id)).toContain("p1");
  });
  it("cuenta el grupo, no la proteína: pollo, cerdo y pavo son carne", () => {
    const lista = variadas([r("a", "pollo", "x"), r("b", "cerdo", "y"), r("c", "pavo", "z")], 3);
    expect(lista.length).toBeLessThanOrEqual(MAX_POR_PROTEINA);
  });
  it("con «más hidratos» (ejes) el pool es más grande: el filtro no se queda con las 40 primeras", () => {
    const ejes = [{ cual: "carbohidratos", direccion: "mas" }];
    expect(poolPara({ ejes })).toBeGreaterThan(poolPara({}));
    expect(poolPara({ rasgos: { textura: "cuchara" } })).toBeGreaterThan(poolPara({}));
    expect(poolPara({ ejes: [] })).toBe(poolPara({}));
  });
  it("yaDichas: las ya dichas por su nombre, sin tildes ni mayúsculas", () => {
    const lista = [{ name: "Tortilla de patata" }, { name: "Huevos rotos" }];
    expect(yaDichas(lista, "• <b>TORTILLA DE PATATA</b>\n• <b>Huevos rotos</b>")).toEqual(lista);
    expect(yaDichas(lista, "• Tortilla de patata")).toEqual([lista[0]]);
    expect(yaDichas(lista, null)).toEqual([]);
  });
});
