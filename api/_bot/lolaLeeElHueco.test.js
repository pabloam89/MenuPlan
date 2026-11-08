// Lola lee el plato de su hueco antes que de su copia (#1246, paso 5): el menú pintado, la ficha y el aviso de la víspera
// dan lo que el hueco apunta aunque en la casa quede una copia vieja con el mismo id, y sin copia ninguna.
// Motor real; base falsa.
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(async () => []), insert: vi.fn(async () => {}), eq: (v) => `eq.${v}` }));

const core = await import("../../src/server/botCore.js");
const { usarMotor, prepararRecetas, resolverHuecos } = await import("./menu.js");
const { pintarMenu, pintarMenuEntero } = await import("./pintar.js");
const { montarFicha } = await import("./ficha.js");
const { avisoDeVispera } = await import("./vispera.js");
const { apuntaSuPlato, planApuntaPlatos } = await import("../../src/lib/apuntaSuPlato.js");

const ID = "carnes_037";
const GUARNICION = "guarniciones_024";
const FECHA = "2026-10-09"; // viernes
const hueco = (extra = {}) => ({ recipeId: ID, eaters: 2, restricciones: [], garnishId: GUARNICION, sauceId: null, platoDe: ID, ...extra });
const data = {
  members: [{ id: "m1", name: "Ana", age: 38 }, { id: "m2", name: "Luis", age: 40 }],
  groups: [{ id: "g1", label: "Familia", memberIds: ["m1", "m2"] }],
  schedule: {},
};
const casaCon = (h, aiRecipes = []) => {
  const plan = { g1: { "Vie-Cena": h } };
  const semana = { weekStart: "2026-10-05", weekEnd: "2026-10-11", plan, shopping: { items: [] } };
  return { householdId: "h", state: { data, aiRecipes, menuPlan: plan }, semana, semanas: [semana] };
};
const COPIA_VIEJA = { id: ID, name: "Copia vieja sin guarnición", ingredients: [] };

beforeAll(() => usarMotor(core));
afterEach(() => vi.restoreAllMocks());

describe("el plato sale de su hueco (#1246, paso 5)", () => {
  const nombreDelHueco = async () => {
    const platoDe = await resolverHuecos(casaCon(hueco()));
    return platoDe(hueco(), "principal", "2026-10-05").name;
  };

  it("sabe qué planes apuntan su plato, sin contar lo que no son grupos", () => {
    expect(planApuntaPlatos({ g1: { "Vie-Cena": hueco() } })).toBe(true);
    expect(planApuntaPlatos({ g1: { "Vie-Cena": { recipeId: ID } } })).toBe(false);
    expect(planApuntaPlatos({ _warnings: { x: hueco() } })).toBe(false);
    expect(planApuntaPlatos(null)).toBe(false);
  });

  it("el hueco trae su guarnición en el nombre", async () => {
    expect(await nombreDelHueco()).toMatch(/ con /);
  });

  it("pintar: sin el motor, un hueco que apunta su plato cuenta como que falta, aunque haya copia con su id", () => {
    expect(pintarMenu(casaCon(hueco(), [COPIA_VIEJA]), { dias: [FECHA], comidas: ["Cena"] }).faltan).toBe(1);
  });

  it("pintar entero: sale el plato del hueco, no la copia vieja, y también sin copia", async () => {
    const nombre = await nombreDelHueco();
    for (const copias of [[COPIA_VIEJA], []]) {
      const p = await pintarMenuEntero(casaCon(hueco(), copias), { dias: [FECHA], comidas: ["Cena"] });
      expect(p.texto).toContain(nombre);
      expect(p.texto).not.toContain(COPIA_VIEJA.name);
      expect(p.faltan).toBe(0);
    }
  });

  it("pintar: un hueco de antes, que no apunta su plato, sigue leyendo su copia y no carga el motor", () => {
    const p = pintarMenu(casaCon({ recipeId: ID, eaters: 2 }, [COPIA_VIEJA]), { dias: [FECHA], comidas: ["Cena"] });
    expect(p.faltan).toBe(0);
    expect(p.texto).toContain(COPIA_VIEJA.name);
  });

  it("ficha: nombra el plato del hueco; sin el motor, cae a la copia", async () => {
    const casa = casaCon(hueco(), [COPIA_VIEJA]);
    const platoDe = await resolverHuecos(casa);
    const conMotor = montarFicha(casa, { platoDe }, FECHA).delDia;
    expect(conMotor).toContain(await nombreDelHueco());
    expect(conMotor).not.toContain(COPIA_VIEJA.name);
    expect(montarFicha(casa, {}, FECHA).delDia).toContain(COPIA_VIEJA.name);
  });

  it("víspera: lee los ingredientes del plato del hueco, no los de la copia", () => {
    const casa = casaCon(hueco(), [{ id: ID, name: "Copia", ingredients: [{ name: "garbanzos secos" }] }]);
    const platoDe = () => ({ name: "Del hueco", ingredients: [{ name: "alubias secas" }] });
    const aviso = avisoDeVispera(casa, FECHA, { platoDe });
    expect(aviso).toContain("alubias");
    expect(aviso).not.toContain("garbanzos");
  });

  it("víspera: un hueco de antes sigue leyendo su copia", () => {
    const casa = casaCon({ recipeId: ID, eaters: 2 }, [{ id: ID, name: "Copia", ingredients: [{ name: "garbanzos secos" }] }]);
    expect(avisoDeVispera(casa, FECHA)).toContain("garbanzos");
  });

  it("el recetario del motor ya lleva el plato del hueco (la compra y cambiar plato leen de ahí)", async () => {
    const casa = casaCon(hueco({ platoDe: ID }));
    const m = await prepararRecetas(casa);
    expect(m.RECIPES_BY_ID[ID].name).toBe(await nombreDelHueco());
  });

  it("un hueco con una guarnición que ya no está no tumba nada: ese plato no sale y se avisa en el log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const roto = hueco({ garnishId: "guarniciones_que_no_existe" });
    expect(apuntaSuPlato(roto)).toBe(true);
    const platoDe = await resolverHuecos(casaCon(roto));
    expect(platoDe(roto, "principal", "2026-10-05")).toBeNull();
    await expect(prepararRecetas(casaCon(roto))).resolves.toBeTruthy();
    expect(error).toHaveBeenCalled();
  });
});
