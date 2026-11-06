// Lo que elige la persona entra en el menú (trozo 74 de #1037). El 5 nov 2026 se pidieron a Lola «ideas para
// mañana, algo más pasta o carne con patatas» y dio trucha, chuletas y fritura: la comida tenía primero y
// segundo, el motor solo admitía `segundo` y de 59 pastas del catálogo vale de segundo 1. Ahora las reglas del
// menú son avisos y solo frena la seguridad. Motor real (src/server/botCore.js); solo la base es de mentira.
// Sin reloj (hoyISO fijo, día y comida dichos), sin azar (con receta o `candidatos` no se sortea) y sin red.
import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(async () => []), insert: vi.fn(async () => {}), eq: (v) => `eq.${v}` }));
let casaDeHoy = null;
let guardado = null;
vi.mock("./casa.js", () => ({
  hoyISO: () => "2026-10-05",
  cargarCasa: vi.fn(async () => casaDeHoy),
  conCasa: vi.fn(async (_id, cambiar) => {
    guardado = await cambiar(casaDeHoy);
    return guardado ? { ok: true } : { ok: true, sinCambios: true };
  }),
}));
vi.mock("./embudo.js", () => ({ rastro: vi.fn(), registrar: vi.fn(), EMBUDO: {} }));

const core = await import("../../src/server/botCore.js");
const {
  proponerPlatos, cambiarPlato, usarMotor, usarNutricion,
  NADA_PARECIDO_EN_EL_CATALOGO, OJO_SE_PUEDE_ELEGIR, PASA_A_PLATO_UNICO, VA_DE_PRIMERO, ROMPE_REGLAS_DEL_MENU,
} = await import("./menu.js");
const { recipeCatalogById } = await import("../../src/data/recipeCatalog.js");

const nut = { nutrienteDe: core.nutrienteDe, crudoDe: core.crudoDe, completitudDe: core.completitudDe, densidadDe: core.densidadDe, cargaDe: core.cargaDe };
// Del pool que sirve el motor (catálogo estrella, de temporada todo el año, dificultad normal).
const BOLONESA = "pasta_arroces_083"; // Fideos a la cazuela con costilla: solo plato único, con gluten
const HUMMUS = "legumbres_050"; // Garbanzos fritos crujientes especiados: solo primero
const MUSLOS = "carnes_045"; // Entraña a la brasa con chimichurri: segundo, ya puesto el martes
const datosCon = (alergias = []) => ({
  members: [{ id: "m1", name: "Ana", age: 38, allergies: alergias }, { id: "m2", name: "Luis", age: 40 }],
  groups: [{ id: "g1", label: "Familia", memberIds: ["m1", "m2"] }],
  schedule: {}, timeWeekday: 90, timeWeekend: 90, allergiesReviewed: true,
});
// La comida del lunes con primero y segundo, como la del 5 nov.
const PLAN = {
  "Lun-Comida": { firstRecipeId: "legumbres_015", recipeId: "carnes_006", eaters: 2 },
  "Mar-Comida": { recipeId: MUSLOS, eaters: 2 },
};
const casaCon = (data) => {
  const plan = structuredClone({ g1: PLAN });
  return {
    householdId: "h",
    state: { data, aiRecipes: [], menuPlan: plan },
    menu: { id: "menu1", userId: "u1" },
    semanaViva: "2026-10-05",
    semanas: [{ weekStart: "2026-10-05", weekEnd: "2026-10-11", plan, shopping: { items: [] } }],
  };
};
const motor = (data, extra = {}) => core.pickCatalogReplacement(data, { g1: PLAN }, { groupId: "g1", day: "Lun", meal: "Comida", course: "main", candidatos: 400, ...extra });
const opcionesDe = (texto) => texto.split("\n").filter((l) => /^\d+\. /.test(l));
const sinPrefijo = (id) => String(id ?? "").split("__").pop();
const huecoGuardado = () => guardado.semana.plan.g1["Lun-Comida"];

beforeAll(() => {
  usarMotor(core);
  usarNutricion(nut);
});

describe("el motor, cuando elige la persona", () => {
  it("las pastas entran con su aviso de tipo de plato, y antes van las que no rompen nada", () => {
    const r = motor(datosCon(), { pedido: true });
    const ids = r.candidatos.map((x) => x.id);
    expect(ids).toContain(BOLONESA);
    expect(r.avisos[BOLONESA]).toContain(core.DESCARTE.ROL);
    const primeraConAviso = ids.findIndex((id) => r.avisos[id]);
    expect(primeraConAviso).toBeGreaterThan(0);
    expect(ids.slice(primeraConAviso).every((id) => r.avisos[id])).toBe(true);
  });

  it("lo ya puesto en la semana entra con su aviso", () => {
    expect(motor(datosCon(), { pedido: true }).avisos[MUSLOS]).toContain(core.DESCARTE.REPETIDO);
  });

  it("la seguridad sí frena: con alergia al gluten no sale ninguna que choque", () => {
    const data = datosCon(["Gluten"]);
    const r = motor(data, { pedido: true });
    expect(r.candidatos.map((x) => x.id)).not.toContain(BOLONESA);
    expect(r.candidatos.some((x) => core.chocaConElGrupo(x, data, data.groups[0], "Comida"))).toBe(false);
  });

  it("vocabulario cerrado: cada aviso es un DESCARTE con sus palabras", () => {
    const avisos = Object.values(motor(datosCon(), { pedido: true }).avisos).flat();
    expect(avisos.length).toBeGreaterThan(0);
    for (const a of avisos) expect(core.DESCARTE_EN_PALABRAS[a]).toBeTruthy();
  });

  it("cuando elige la máquina nada cambia: solo segundos y sin avisos", () => {
    const r = motor(datosCon());
    expect(r.avisos).toBeUndefined();
    expect(r.candidatos.every((x) => x.mealRole.includes("segundo"))).toBe(true);
  });
});

describe("proponer_platos con parecido_a", () => {
  it("el caso del 5 nov: pide pasta para una comida con primero y salen pastas, con su «ojo»", async () => {
    casaDeHoy = casaCon(datosCon());
    const texto = await proponerPlatos("h", { dia: "lunes", franja: "Comida", parecidoA: "pasta", n: 3 });
    const opciones = opcionesDe(texto);
    expect(opciones.length).toBe(3);
    expect(opciones.some((l) => /pasta|fideo|espagueti|macarr/i.test(l))).toBe(true);
    expect(opciones.some((l) => l.includes(`ojo: ${core.DESCARTE_EN_PALABRAS[core.DESCARTE.ROL]}`))).toBe(true);
    expect(texto).toContain(OJO_SE_PUEDE_ELEGIR);
  });

  it("si nada se parece, lo dice y no da otras como parecidas", async () => {
    casaDeHoy = casaCon(datosCon());
    const texto = await proponerPlatos("h", { dia: "lunes", franja: "Comida", parecidoA: "zzqx", n: 3 });
    expect(opcionesDe(texto)).toEqual([]);
    expect(texto).toContain(NADA_PARECIDO_EN_EL_CATALOGO.replace("{pedido}", "zzqx"));
  });
});

describe("cambiar_plato con receta", () => {
  it("una de plato único en una comida con primero: entra, se quita el primero y se dice", async () => {
    casaDeHoy = casaCon(datosCon());
    const out = {};
    const texto = await cambiarPlato("h", { dia: "lunes", franja: "Comida", receta: recipeCatalogById[BOLONESA].name }, null, out);
    expect(out.cambiado).toBe(true);
    expect(sinPrefijo(huecoGuardado().recipeId)).toBe(BOLONESA);
    expect(huecoGuardado().firstRecipeId).toBeUndefined();
    expect(texto).toContain(PASA_A_PLATO_UNICO.replace("{primero}", recipeCatalogById["legumbres_015"].name));
  });

  it("una de primero pedida para el principal: va de primero y el segundo se queda", async () => {
    casaDeHoy = casaCon(datosCon());
    const out = {};
    const texto = await cambiarPlato("h", { dia: "lunes", franja: "Comida", receta: recipeCatalogById[HUMMUS].name }, null, out);
    expect(out.cambiado).toBe(true);
    expect(sinPrefijo(huecoGuardado().firstRecipeId)).toBe(HUMMUS);
    expect(sinPrefijo(huecoGuardado().recipeId)).toBe("carnes_006");
    expect(texto).toContain(VA_DE_PRIMERO);
  });

  it("una ya puesta en la semana: entra y dice qué regla rompe", async () => {
    casaDeHoy = casaCon(datosCon());
    const out = {};
    const texto = await cambiarPlato("h", { dia: "lunes", franja: "Comida", receta: recipeCatalogById[MUSLOS].name }, null, out);
    expect(out.cambiado).toBe(true);
    expect(sinPrefijo(huecoGuardado().recipeId)).toBe(MUSLOS);
    expect(texto).toContain(`${ROMPE_REGLAS_DEL_MENU}${core.DESCARTE_EN_PALABRAS[core.DESCARTE.REPETIDO]}`);
  });

  it("la seguridad sí frena: con alergia al gluten, la boloñesa no entra", async () => {
    casaDeHoy = casaCon(datosCon(["Gluten"]));
    guardado = null;
    const out = {};
    await cambiarPlato("h", { dia: "lunes", franja: "Comida", receta: recipeCatalogById[BOLONESA].name }, null, out);
    expect(sinPrefijo(guardado?.semana?.plan?.g1?.["Lun-Comida"]?.recipeId)).not.toBe(BOLONESA);
  });
});
